import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Select, Table, Tabs, Space, Button, Typography, message,
} from "antd";
import { AuditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import ModalRaSoat from "./ModalRaSoat";
import { thueBaoCao, loiApi } from "../api";
import type { BaoCaoThue as BaoCaoThueDto, BangKeHoaDon, ChiTieuTongHop } from "../api";
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

export default function BaoCaoThue() {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();

  // Mặc định tháng hiện tại nếu nó nằm trong năm làm việc, không thì tháng 1 —
  // mở màn ra là thấy ngay kỳ đang làm, khỏi phải chọn.
  const thangMacDinh = new Date().getFullYear() === namLamViec
    ? new Date().getMonth() + 1 : 1;
  const [thang, setThang] = useState<number | "all">(thangMacDinh);
  const [tab, setTab] = useState("vao");
  const [moRaSoat, setMoRaSoat] = useState(false);

  const [bc, setBc] = useState<BaoCaoThueDto | null>(null);
  const [tai, setTai] = useState(true);

  // Chặn kết quả CŨ ghi đè kết quả mới: đổi tháng nhanh tay thì request trước có
  // thể về sau request sau. Đếm lượt gọi, chỉ nhận lượt mới nhất.
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

  // setTimeout 0 chứ không gọi nap() thẳng: nap() có setTai(true) chạy ĐỒNG BỘ
  // ngay trong thân effect, React coi đó là cascading render (react-hooks/
  // set-state-in-effect). Đẩy sang lượt sau thì effect chỉ còn việc khởi động.
  useEffect(() => {
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tenant.id, namLamViec, thang]);

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

  // Chiều cao thân bảng. antd dựng .ant-table-body bằng style NỘI TUYẾN sinh từ
  // giá trị này, nên nó phải là con số dùng được thật — truyền 1 thì bảng cao 1px
  // và trắng trơn, không CSS nào cứu được.
  //
  // PHẢI KHỚP với .ant-table-body trong bao-cao-thue.css.
  // 300px = 96 (ngoài Card) + đầu Card + dải tab + header bảng + THANH TỔNG (~40px).
  const CAO_BANG = "calc(100vh - 300px)";

  // Bảng Tổng hợp không có thanh tổng dưới đáy nên được cao thêm đúng phần đó.
  const CAO_BANG_TH = "calc(100vh - 260px)";

  // Thanh TỔNG là khối RIÊNG dưới bảng, không dùng Table.Summary — nhưng vẫn DÓNG
  // ĐÚNG CỘT bằng cách lặp lại đúng bề rộng cột của bảng.
  //
  // Vì sao không dùng Table.Summary: antd ghim summary vào trong khung cuộn dọc,
  // và mỗi lần thêm/bớt cột phải đếm lại colSpan cho khớp. Khối rời nằm ngoài,
  // luôn thấy được, và chỉ cần đọc cùng một mảng bề rộng là thẳng hàng.
  //
  // Cuộn ngang ĐỒNG BỘ với bảng: hai ô tiền nằm ở cột thứ 8 và 10 (x = 952px và
  // 1258px) nên khi bảng cuộn sang phải, thanh tổng phải trượt theo đúng chừng ấy,
  // nếu không số sẽ lệch khỏi cột nó đang cộng.
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
        {/* "Tất cả các tháng" = gộp cả năm làm việc. Dùng đúng chữ như ô lọc bên
            màn Danh sách hóa đơn để hai chỗ không gọi một thứ bằng hai tên. */}
        <Select style={{ width: 170 }} value={thang}
                onChange={(v) => setThang(v)}
                options={[
                  { value: "all" as const, label: "Tất cả" },
                  ...CAC_THANG.map((m) => ({ value: m, label: `Tháng ${m}` })),
                ]} />
      </Space>
      {/* Rà soát: đối chiếu file XML với sổ trước khi nộp tờ khai. CHỈ XEM,
          không ghi gì vào sổ. */}
      <Button icon={<AuditOutlined />} onClick={() => setMoRaSoat(true)}>
        Rà soát
      </Button>
    </Space>
  );

  return (
    <Card
      className="bc-thue"
      title="Báo cáo thuế GTGT"
      extra={thanhLoc}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* Tabs chuẩn antd. Trước đây tự dựng dải nút vì bảng AG Grid cần chiều cao
          tường minh mà Tabs làm đứt chuỗi; nay bảng là Table của antd, tự cuộn
          bằng scroll.y nên dùng Tabs được bình thường.
          destroyOnHidden: chỉ giữ bảng của tab đang xem trong DOM. */}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
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

      <ModalRaSoat
        mo={moRaSoat}
        onDong={() => setMoRaSoat(false)}
        thang={thang === "all" ? undefined : thang}
        nhanKy={nhanKy}
      />
    </Card>
  );
}
