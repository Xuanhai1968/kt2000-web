import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Select, Table, Tabs, Space, Button, Typography, message,
} from "antd";
import { AuditOutlined, FileTextOutlined, FileDoneOutlined,
         UnorderedListOutlined, TableOutlined, SwapOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import ToKhaiXml from "./ToKhaiXml";
import { NhapToKhaiTay } from "./BangToKhai";
import BcToKhaiXml from "./BcToKhaiXml";
import BangTongHop from "./BangTongHop";
import HdLienQuanKhacKy from "./HdLienQuanKhacKy";
import { thueBaoCao, thueRaSoatCheo, loiApi } from "../api";
import type { BaoCaoThue as BaoCaoThueDto, BangKeHoaDon, ChiTieuTongHop,
              DongRaSoatToKhai } from "../api";
import { useAuth } from "../AuthContext";
import "./bao-cao-thue.css";

// ============ BÁO CÁO THUẾ GTGT — FRM_BC_THUE ============
// Dựng lại form "Báo cáo thuế GTGT" của KT2000 VFP: thanh lọc kỳ trên cùng, ba
// tab nghiệp vụ, bảng chiếm gần hết màn, thanh tổng hồng dưới đáy.
//
// Dùng Table của antd chứ KHÔNG dùng AG Grid: AG Grid cần chiều cao tường minh từ
// khối cha, mà ở màn này khối cha nằm sau một chuỗi dài (Layout.Content → trang →
// tab), đứt một mắt là lưới cao 0 và mất cả header cột. Table của antd tự dựng
// theo nội dung, chỉ cần khai scroll.y là cuộn trong lòng nó — chắc chắn hơn hẳn.
//
// Nguồn dữ liệu: MỘT lời gọi /thue/bao-cao trả về cả ba bảng (mua vào, bán ra,
// tổng hợp). Gọi một lần cho cả màn thay vì mỗi tab một request — ba bảng đều
// tính từ cùng tập hóa đơn của kỳ đó, tách ra thì vừa chậm vừa có nguy cơ ba tab
// nói ba con số khác nhau nếu ai đó nạp hóa đơn xen giữa.
//
// Bảng tổng hợp KHÔNG cộng ở đây mà lấy thẳng số server tính: đó là số đi vào tờ
// khai thuế, phải có một chỗ định nghĩa công thức (xem ThueService.TinhTongHop).

const CAC_THANG = Array.from({ length: 12 }, (_, i) => i + 1);

// Ghi nhớ ô lọc Tháng theo MÁY (cùng lối NT-06 ở màn Hóa đơn đầu vào — trạng thái
// kiểu này nằm trong KT2000.INI của bản VFP cũ, localStorage là chỗ tương đương).
//
// Vì sao cần: kế toán làm tờ khai của MỘT kỳ suốt cả buổi, nhảy qua lại giữa màn
// này và màn hóa đơn liên tục. Mỗi lần quay lại mà ô lọc nhảy về tháng hiện tại thì
// phải chọn lại tháng đó — và tệ hơn, dễ đọc nhầm số của tháng khác mà không để ý.
const KHOA_THANG = "kt2000_bao_cao_thue_thang";

// "all" là giá trị hợp lệ của ô lọc nên phải phân biệt với "chưa từng lưu".
// Không đọc được (localStorage bị chặn, giá trị rác) thì trả null để tầng gọi lùi
// về mặc định, chứ không ném lỗi làm trắng cả màn.
const docThangDaLuu = (): number | "all" | null => {
  try {
    const s = localStorage.getItem(KHOA_THANG);
    if (s === "all") return "all";
    const n = Number(s);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
  } catch { return null; }
};

// Tiền kiểu VFP: dấu . ngăn nghìn, dấu , ngăn phần lẻ, luôn 2 số lẻ.
const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
};

// Bề rộng cột — MỘT nguồn duy nhất cho cả bảng lẫn thanh tổng, để hai chỗ không
// bao giờ lệch nhau. Thứ tự đúng như cotBangKe bên dưới.
//
// PHẢI khai TRƯỚC cotBangKe: const không được hoisting, đặt sau thì cotBangKe đọc
// phải vùng chết và nổ "Cannot access before initialization" ngay khi nạp module.
const RONG_COT = {
  stt: 56, khHd: 90, soHd: 90, ngay: 86, ten: 300, mst: 130, matHang: 240,
  dt: 150, ts: 56, thue: 140, ghiChu: 200,
} as const;

// Nhãn thanh tổng trải trên 7 cột đầu (STT…Mặt hàng), y như colSpan=7 trước đây.
const RONG_NHAN = RONG_COT.stt + RONG_COT.khHd + RONG_COT.soHd + RONG_COT.ngay
                + RONG_COT.ten + RONG_COT.mst + RONG_COT.matHang;

const RONG_BANG = RONG_NHAN + RONG_COT.dt + RONG_COT.ts + RONG_COT.thue
                + RONG_COT.ghiChu;

// Cột chung cho hai bảng kê. Khác nhau đúng một chữ: "Người bán" (mua vào) vs
// "Người mua" (bán ra). Để ngoài component vì không dùng state nào.
const cotBangKe = (vaiTro: string): ColumnsType<BangKeHoaDon> => [
  // KHÔNG fixed:"left" — cột ghim đứng yên khi cuộn ngang, còn thanh tổng bên dưới
  // trượt cả khối, hai bên sẽ lệch nhau đúng 56px. Thà cùng trượt còn hơn lệch cột.
  { title: "STT", dataIndex: "stt", width: RONG_COT.stt, align: "right" },
  { title: "KH HĐ", dataIndex: "khHd", width: RONG_COT.khHd },
  { title: "Số HĐ", dataIndex: "soHd", width: RONG_COT.soHd },
  { title: "Ngày", dataIndex: "ngay", width: RONG_COT.ngay,
    render: (v: string | null) => ngayNgan(v) },
  { title: `Tên ${vaiTro}`, dataIndex: "tenDoiTac", width: RONG_COT.ten, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: `MST ${vaiTro}`, dataIndex: "mstDoiTac", width: RONG_COT.mst },
  { title: "Mặt hàng", dataIndex: "matHang", width: RONG_COT.matHang, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "D.Thu Chưa thuế", dataIndex: "doanhThuChuaVat", width: RONG_COT.dt,
    align: "right", render: (v: number) => tien(v) },
  // Thuế suất để trống khi HĐ không khai vat — không bịa thành 0%
  { title: "TS", dataIndex: "thueSuat", width: RONG_COT.ts, align: "right",
    render: (v: number | null) => v == null ? "" : String(v) },
  { title: "Thuế GTGT", dataIndex: "thueGtgt", width: RONG_COT.thue, align: "right",
    render: (v: number) => tien(v) },
  { title: "Ghi chú", dataIndex: "ghiChu", width: RONG_COT.ghiChu, ellipsis: true },
];

const COT_VAO = cotBangKe("Người bán");
const COT_RA = cotBangKe("Người mua");

const COT_TONG_HOP: ColumnsType<ChiTieuTongHop> = [
  { title: "STT", dataIndex: "stt", width: 70 },
  { title: "Chỉ tiêu kê khai", dataIndex: "chiTieu" },
  { title: "D.Thu Chưa có VAT", dataIndex: "doanhThuChuaVat", width: 200,
    align: "right", render: (v: number | null) => tien(v) },
  { title: "Thuế GTGT", dataIndex: "thueGtgt", width: 200, align: "right",
    render: (v: number | null) => tien(v) },
];

// ============ LƯỚI RÀ SOÁT CHÉO (chỉ MDN_NB) ============
// Dựng lại bảng theo dõi của kế toán dịch vụ: mỗi đơn vị một dòng, soi nhanh xem
// đơn vị nào còn lệch trước khi nộp tờ khai.
//
// Tiền ở lưới này KHÔNG có phần lẻ (khác hàm tien() dùng cho bảng kê): chỉ tiêu tờ
// khai là số nguyên đồng, thêm ",00" vào 30 dòng chỉ làm rối mắt mà không nói thêm gì.
// null = CHƯA lập tờ khai → để trống, tuyệt đối không hiện 0 (xem chú thích ở api.ts).
const tienNguyen = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Số đếm hóa đơn: 0 để TRỐNG cho lưới đỡ nhiễu — mắt chỉ cần bắt vào ô CÓ số.
const dem = (v: number | null | undefined) => (v ? String(v) : "");

const COT_RA_SOAT: ColumnsType<DongRaSoatToKhai> = [
  { title: "STT", dataIndex: "stt", width: 50, align: "right", fixed: "left" },
  { title: "Đơn vị", dataIndex: "maDonVi", width: 170, fixed: "left",
    render: (v: string, m) => (
      <span className={m.khaiQuy ? "" : "dv-khai-thang"}
            title={`${m.tenDonVi ?? v} — khai ${m.khaiQuy ? "quý" : "tháng"}`}>
        {v}
      </span>) },
  { title: "Tồn đầu", dataIndex: "tonDau", width: 130, align: "right",
    render: (v: number | null, m) => (
      <span className={m.lechTonDau ? "so-lech" : ""}>{tienNguyen(v)}</span>) },
  { title: "Tồn đầu XML", dataIndex: "tonDauXml", width: 130, align: "right",
    render: (v: number | null, m) => (
      <span className={m.lechTonDau ? "so-lech" : ""}>{tienNguyen(v)}</span>) },
  { title: "V1", dataIndex: "v1", width: 46, align: "right", render: dem },
  { title: "R1", dataIndex: "r1", width: 46, align: "right", render: dem },
  { title: "V2", dataIndex: "v2", width: 46, align: "right", render: dem,
    onCell: (m) => ({ className: m.khaiQuy ? "" : "o-khong-dung" }) },
  { title: "R2", dataIndex: "r2", width: 46, align: "right", render: dem,
    onCell: (m) => ({ className: m.khaiQuy ? "" : "o-khong-dung" }) },
  { title: "V3", dataIndex: "v3", width: 46, align: "right", render: dem,
    onCell: (m) => ({ className: m.khaiQuy ? "" : "o-khong-dung" }) },
  { title: "R3", dataIndex: "r3", width: 46, align: "right", render: dem,
    onCell: (m) => ({ className: m.khaiQuy ? "" : "o-khong-dung" }) },
  { title: "Tồn cuối", dataIndex: "tonCuoi", width: 130, align: "right",
    render: (v: number | null) => tienNguyen(v) },
  { title: "Kỳ", dataIndex: "kyKeKhai", width: 84, align: "center",
    render: (v: string | null) => v ?? "" },
  { title: "Tồn XML", dataIndex: "tonXml", width: 130, align: "right",
    render: (v: number | null) => tienNguyen(v) },
  { title: "Lệch", dataIndex: "lech", width: 130, align: "right",
    render: (v: number | null, m) => (
      <span className={m.lechTonCuoi ? "so-lech" : ""}>{tienNguyen(v)}</span>) },
  { title: "Mẫu 01", dataIndex: "mau01", width: 70, align: "center",
    render: (v: string | null) => v ?? "" },

  { title: "SL HĐ sổ", dataIndex: "soHdSo", width: 80, align: "right", render: dem },
];


const RONG_RA_SOAT = 40 + 50 + 170 + 130 + 130 + 46 * 6 + 130 + 84 + 130 + 130 + 70 + 80;

export default function BaoCaoThue() {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const thangMacDinh = new Date().getFullYear() === namLamViec
    ? new Date().getMonth() + 1 : 1;

  const laMdnNb = session?.tenant.tenantType === "internal";

  const [thang, setThang] = useState<number | "all">(
    () => docThangDaLuu() ?? thangMacDinh);

  const doiThang = (v: number | "all") => {
    setThang(v);

    try { localStorage.setItem(KHOA_THANG, String(v)); } catch { /* hết chỗ */ }
  };
  const [tab, setTab] = useState(laMdnNb ? "cheo" : "vao");
  const [moRaSoat, setMoRaSoat] = useState(false);

  const [cheo, setCheo] = useState<DongRaSoatToKhai[]>([]);
  const [taiCheo, setTaiCheo] = useState(false);
  const [dvChon, setDvChon] = useState<string[]>([]);
  const [moToKhai, setMoToKhai] = useState(false);
  const [moNhapTay, setMoNhapTay] = useState(false);
  const [moBcXml, setMoBcXml] = useState(false);
  const [moTongHop, setMoTongHop] = useState(false);
  const [moLienQuan, setMoLienQuan] = useState(false);
  const dongDangChon = useMemo(
    () => dvChon.length === 1
      ? cheo.find((d) => d.maDonVi === dvChon[0]) ?? null : null,
    [cheo, dvChon]);

  const [bc, setBc] = useState<BaoCaoThueDto | null>(null);
  const [tai, setTai] = useState(!laMdnNb);
  const luotRef = useRef(0);

  const nap = async () => {
    const luot = ++luotRef.current;
    setTai(true);
    try {
      const r = await thueBaoCao(thang === "all" ? undefined : thang);
      if (luot !== luotRef.current) return;   // đã có lượt mới hơn
      setBc(r.data);
    } catch (e) {
      if (luot !== luotRef.current) return;
      setBc(null);
      message.error(loiApi(e, "Không đọc được báo cáo thuế"));
    } finally {
      if (luot === luotRef.current) setTai(false);
    }
  };

  useEffect(() => {
    if (laMdnNb) return;
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laMdnNb, session?.tenant.id, namLamViec, thang]);

  const napCheo = async () => {
    setTaiCheo(true);
    try {
      const ky = thang === "all" ? thangMacDinh : thang;
      const r = await thueRaSoatCheo(namLamViec, ky);
      setCheo(r.data.dong);
      const con = new Set(r.data.dong.map((d) => d.maDonVi));
      setDvChon((cu) => cu.filter((m) => con.has(m)));
    } catch (e) {
      setCheo([]);
      message.error(loiApi(e, "Không đọc được bảng rà soát chéo"));
    } finally {
      setTaiCheo(false);
    }
  };

  useEffect(() => {
    if (!laMdnNb || tab !== "cheo") return;
    const id = setTimeout(() => void napCheo(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laMdnNb, tab, session?.tenant.id, namLamViec, thang]);

  // Tổng ở thanh đáy đổi theo TAB đang xem — bản gốc cũng vậy: đang xem bảng kê
  // nào thì thấy tổng của bảng đó.
  const tongDangXem = useMemo(() => {
    const ds = tab === "ra" ? bc?.banRa : bc?.muaVao;
    if (!ds) return { dt: 0, thue: 0, soHd: 0 };
    return {
      dt: ds.reduce((s, x) => s + x.doanhThuChuaVat, 0),
      thue: ds.reduce((s, x) => s + x.thueGtgt, 0),
      soHd: ds.length,
    };
  }, [bc, tab]);

  const nhanKy = thang === "all" ? `cả năm ${namLamViec}`
                                 : `tháng ${thang}/${namLamViec}`;
                                 
  const oTongRef = useRef<HTMLDivElement | null>(null);
  const khoaRef = useRef(false);

  useEffect(() => {
    const oTong = oTongRef.current;
    // Thân cuộn của antd — chỉ có sau khi bảng đã dựng xong.
    const oBang = oTong?.closest(".khoi-bang")
                       ?.querySelector<HTMLElement>(".ant-table-body");
    if (!oTong || !oBang) return;

    const noi = (tu: HTMLElement, den: HTMLElement) => () => {
      if (khoaRef.current) { khoaRef.current = false; return; }
      khoaRef.current = true;
      den.scrollLeft = tu.scrollLeft;
    };
    const tuBang = noi(oBang, oTong);
    const tuTong = noi(oTong, oBang);

    oBang.addEventListener("scroll", tuBang, { passive: true });
    oTong.addEventListener("scroll", tuTong, { passive: true });
    // Đổi tab/kỳ thì bảng dựng lại từ đầu, kéo vị trí cuộn về 0 cho khớp.
    oTong.scrollLeft = oBang.scrollLeft;
    return () => {
      oBang.removeEventListener("scroll", tuBang);
      oTong.removeEventListener("scroll", tuTong);
    };
  }, [tab, bc, tai]);

  const CAO_BANG = "calc(100vh - 300px)";

  // Bảng Tổng hợp không có thanh tổng dưới đáy nên được cao thêm đúng phần đó.
  const CAO_BANG_TH = "calc(100vh - 260px)";

  const CAO_BANG_CHEO = "calc(100vh - 272px)";

  const thanhTong = (
    <div className="tong-bc-ngoai" ref={oTongRef}>
      <div className="tong-bc" style={{ width: RONG_BANG }}>
        {/* Gộp 7 cột đầu (STT…Mặt hàng) làm chỗ đặt nhãn */}
        <span className="tong-nhan" style={{ width: RONG_NHAN }}>
          Tổng {tab === "ra" ? "bán ra" : "mua vào"} {nhanKy} —{" "}
          <b>{tongDangXem.soHd}</b> hóa đơn
        </span>
        <span className="tong-o tong-dt" style={{ width: RONG_COT.dt }}>
          {tien(tongDangXem.dt)}
        </span>
        <span className="tong-o" style={{ width: RONG_COT.ts }} />
        <span className="tong-o tong-thue" style={{ width: RONG_COT.thue }}>
          {tien(tongDangXem.thue)}
        </span>
        <span className="tong-o" style={{ width: RONG_COT.ghiChu }} />
      </div>
    </div>
  );

  const bangKe = (ds: BangKeHoaDon[] | undefined, cot: ColumnsType<BangKeHoaDon>,
                  nhan: string) => (
    <div className="khoi-bang">
      <Table<BangKeHoaDon>
        className="bang-bc"
        size="small"
        rowKey="maHd"
        dataSource={ds ?? []}
        columns={cot}
        loading={tai}
        pagination={false}
        scroll={{ x: RONG_BANG, y: CAO_BANG }}
        locale={{ emptyText: `Kỳ này chưa có hóa đơn ${nhan}` }}
      />
      {thanhTong}
    </div>
  );

  // Thanh lọc kỳ nằm ở `extra` của Card — đúng chỗ antd dành cho thao tác của khối.
  const thanhLoc = (
    <Space size={12} wrap>
      <Space size={8}>
        <Typography.Text type="secondary">Tháng</Typography.Text>
        <Select style={{ width: 170 }} value={thang}
                onChange={doiThang}
                options={[
                  { value: "all" as const, label: "Tất cả" },
                  ...CAC_THANG.map((m) => ({ value: m, label: `Tháng ${m}` })),
                ]} />
      </Space>

      {!laMdnNb && (
        <Button icon={<AuditOutlined />} onClick={() => setMoRaSoat(true)}
                title="Đối chiếu file XML với sổ trước khi nộp tờ khai">
          Rà soát
        </Button>
      )}

      {laMdnNb && (
        <>
          <Button icon={<FileDoneOutlined />}
                  disabled={dvChon.length !== 1}
                  onClick={() => setMoNhapTay(true)}
                  title={dvChon.length === 1
                    ? `Nhập tay tờ khai cho ${dvChon[0]}`
                    : "Tích chọn một đơn vị trên lưới trước"}>
            Tờ khai
          </Button>
          <Button icon={<TableOutlined />}
                  disabled={dvChon.length !== 1}
                  onClick={() => setMoTongHop(true)}
                  title={dvChon.length === 1
                    ? `Bảng tổng hợp chỉ tiêu của ${dvChon[0]}`
                    : "Tích chọn một đơn vị trên lưới trước"}>
            Bảng tổng hợp
          </Button>
          <Button type="primary" icon={<FileTextOutlined />}
                  disabled={dvChon.length !== 1}
                  onClick={() => setMoToKhai(true)}
                  title={dvChon.length === 1
                    ? `Lập tờ khai cho ${dvChon[0]}`
                    : "Tích chọn một đơn vị trên lưới trước"}>
            Lấy tờ khai XML
          </Button>

          <Button icon={<UnorderedListOutlined />}
                  onClick={() => setMoBcXml(true)}
                  title="Danh sách tờ khai đã lưu + nạp XML cổng trả về">
            BC tờ khai XML
          </Button>

          {/* HĐ thay thế/điều chỉnh KHÁC KỲ — không kê vào kỳ này, nhưng kỳ GỐC còn
              treo. Quét MỌI đơn vị nên không đòi tích chọn dòng nào. */}
          <Button icon={<SwapOutlined />}
                  onClick={() => setMoLienQuan(true)}
                  title={"Hóa đơn thay thế/điều chỉnh có hóa đơn gốc thuộc kỳ khác"
                       + " — cần kê khai lại kỳ gốc"}>
            HĐ khác kỳ
          </Button>
        </>
      )}
    </Space>
  );

  return (
    <Card
      className="bc-thue"
      title="Báo cáo thuế GTGT"
      styles={{ body: { paddingTop: 12 } }}
    >

      {laMdnNb ? (
        <>
          <div className="thanh-loc-cheo">{thanhLoc}</div>
          <Table<DongRaSoatToKhai>
            className="bang-bc bang-ra-soat-cheo"
            size="small"
            rowKey="maDonVi"
            dataSource={cheo}
            columns={COT_RA_SOAT}
            loading={taiCheo}
            pagination={false}

            scroll={{ x: RONG_RA_SOAT, y: CAO_BANG_CHEO }}
            rowSelection={{
              fixed: "left",
              columnWidth: 40,
              selectedRowKeys: dvChon,
              onChange: (keys) => setDvChon(keys as string[]),
            }}
            // Đơn vị khai THÁNG: đỏ cả dòng + nền hồng (xem bao-cao-thue.css).
            rowClassName={(m) => m.khaiQuy ? "" : "dong-khai-thang"}
            locale={{ emptyText: "Chưa có đơn vị nào" }}
          />
        </>
      ) : (
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        tabBarExtraContent={{ right: thanhLoc }}
        items={[
          {
            key: "vao",
            label: "Hoá đơn mua Vào",
            children: bangKe(bc?.muaVao, COT_VAO, "mua vào"),
          },
          {
            key: "ra",
            label: "Hoá đơn bán Ra",
            children: bangKe(bc?.banRa, COT_RA, "bán ra"),
          },
          {
            key: "tonghop",
            label: "Bảng tổng Hợp",
            children: (
              <Table<ChiTieuTongHop>
                className="bang-bc bang-tong-hop"
                size="small"
                rowKey="stt"
                dataSource={bc?.tongHop ?? []}
                columns={COT_TONG_HOP}
                loading={tai}
                pagination={false}
                scroll={{ y: CAO_BANG_TH }}
                // Chỉ tiêu CHÍNH của tờ khai (1, 2, 3...) in đậm để mắt tách ngay
                // với dòng con 2a/2b/3c.
                rowClassName={(m) => m.laDongChinh ? "dong-chi-tieu-chinh" : ""}
                locale={{ emptyText: "Chưa có số liệu" }}
              />
            ),
          },
        ]}
      />
      )}
      {(!laMdnNb || dvChon.length === 1) && (
        <ToKhaiXml
          mo={laMdnNb ? moToKhai : moRaSoat}
          onDong={() => (laMdnNb ? setMoToKhai(false) : setMoRaSoat(false))}
          maDonVi={laMdnNb ? dvChon[0] : ""}
          tenDonVi={laMdnNb ? dongDangChon?.tenDonVi : session?.tenant.name}
          nam={namLamViec}
          thang={thang === "all" ? thangMacDinh : thang}
          vatKhauTruKyTruoc={laMdnNb ? dongDangChon?.tonDau : null}
        />
      )}

      {laMdnNb && (
        <BcToKhaiXml
          mo={moBcXml}
          onDong={() => setMoBcXml(false)}
          nam={namLamViec}
          // Kỳ ĐI THEO bộ lọc ngoài: lọc ngoài tháng 7 mà trong màn mặc định tháng
          // hiện tại là lưu file vào nhầm kỳ. Ô lọc để "Tất cả" thì lùi về tháng
          // mặc định — lưu file là việc của MỘT kỳ, không có "cả năm".
          thang={thang === "all" ? thangMacDinh : thang}
        />
      )}

      {/* Bảng tổng hợp — cần tích đúng một đơn vị. Lọc theo tháng đang chọn; ô lọc
          để "Tất cả" thì lùi về tháng mặc định, vì bảng tổng hợp là của MỘT kỳ —
          gộp cả năm thì mọi chỉ tiêu chồng lên nhau. */}
      {laMdnNb && dvChon.length === 1 && (
        <BangTongHop
          mo={moTongHop}
          onDong={() => setMoTongHop(false)}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          nam={namLamViec}
          thang={thang === "all" ? thangMacDinh : thang}
        />
      )}

      {/* HĐ thay thế/điều chỉnh khác kỳ — quét MỌI đơn vị nên KHÔNG đòi tích chọn
          dòng nào, khác ba modal trên. */}
      {laMdnNb && (
        <HdLienQuanKhacKy
          mo={moLienQuan}
          onDong={() => setMoLienQuan(false)}
          nam={namLamViec}
          thang={thang === "all" ? thangMacDinh : thang}
        />
      )}

      {laMdnNb && dvChon.length === 1 && (
        <NhapToKhaiTay
          mo={moNhapTay}
          onDong={() => setMoNhapTay(false)}
          onDaLuu={() => void napCheo()}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          mstDonVi={dongDangChon?.mst}
          nam={namLamViec}
          thang={thang === "all" ? thangMacDinh : thang}
        />
      )}
    </Card>
  );
}
