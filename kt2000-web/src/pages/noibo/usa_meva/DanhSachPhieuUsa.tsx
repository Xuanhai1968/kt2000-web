// DANH SÁCH PHIẾU — bản bê từ USA_Meva (pages/IssuedInvoicePage.tsx, 1729 dòng).
//
// ĐÂY LÀ NB-#7 trong lộ trình ở docs/NB/NHAP-SPEC-NB-DUYET-THU-TIEN.md: chỉ làm phần
// KHÔNG cần luật nghiệp vụ mới, nên KHÔNG chờ Leader chốt hai câu hỏi còn treo
// (có duyệt phiếu không, thu tiền ghi vào đâu).
//
// ĐÃ BÊ (4 thứ ../DanhSachPhieu.tsx chưa có):
//   1. Mở rộng dòng xem chi tiết hàng ngay tại chỗ — nạp lười, nhớ lại lần sau
//   2. In HÀNG LOẠT nhiều phiếu đã tích chọn (dùng mẫu hai liên A4 ngang)
//   3. Highlight đơn vừa sửa xong quay về — tự mở rộng + cuộn tới, tắt sau 3 giây
//   4. Lọc theo trạng thái kho (đã giao / chưa giao)
//
// CỐ Ý KHÔNG BÊ (xem mục 5 bản nháp spec):
//   - Duyệt / trả lại / bỏ duyệt      -> chưa chốt (câu 1.1), backend chưa có
//   - Thu tiền / đối chiếu / ảnh bill -> chưa chốt (câu 1.2); bên USA_Meva cũng đang
//                                        tắt bằng cờ PAYMENT_ENABLED = false
//   - Hóa đơn điện tử, xin/cấp in lại, xuất Excel theo tỉnh -> ngoài phạm vi v1
//
// DÙNG LẠI, KHÔNG VIẾT LẠI: nbDanhSachDonTatCa/nbLayDon từ ../../api,
// CSS .pxn__ từ ../phieu-xuat-nhap.css.
// Viết mới: mẫu in hai liên (./mauInHaiLien) và bốn thứ liệt kê trên.
//
// MẪU IN theo ĐƠN VỊ (xem DUNG_MAU_HAI_LIEN bên dưới): USA_Meva in hai liên A4 ngang,
// đơn vị khác in A4 dọc một liên. Cả hai đường in — icon cột cuối và nút trên thanh —
// luôn dùng CÙNG một mẫu, không thể ra hai tờ giấy khác nhau cho cùng một đơn vị.
//
// KHÔNG có nút "Tạo gói" ở đây (bỏ 08/08) — ghép/chốt/xuất gói làm ở màn GÓI HÀNG,
// nơi có đủ vòng đời gói theo BR-NB-08.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Space, Button, Tag, Typography, Input, Table, Select, message, Empty, Row, Col,
  Tooltip,
} from "antd";
import { EditOutlined, PrinterOutlined, FileTextOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import {
  nbDanhSachDonTatCa, nbLayDon, loiApi,
} from "../../../api";
import type { DonNb, DonNbLine, HuongDon } from "../../../api";
import { useAuth } from "../../../AuthContext";
import { inPhieuDon, xemTruocHoaDon } from "../mauInPhieu";
import { inHaiLien } from "./mauInHaiLien";
import "../phieu-xuat-nhap.css";

const soTien = (n: number) =>
  (Number(n) || 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const ngayVn = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("vi-VN") : "";

const kieuSo: React.CSSProperties = {
  fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
  fontVariantNumeric: "tabular-nums",
};

const NHAN_HUONG: Record<HuongDon, { chu: string; mau: string }> = {
  RA:  { chu: "Xuất hàng", mau: "red" },
  VAO: { chu: "Nhập hàng", mau: "blue" },
};

const THANG = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1, label: `Tháng ${i + 1}`,
}));

// Lọc trạng thái kho — BR-NB-07: có ngay_nh = hàng đã rời kho, engine đã trừ tồn.
type LocKho = "tat_ca" | "da_giao" | "chua_giao";
const LOC_KHO = [
  { value: "tat_ca",    label: "Tất cả" },
  { value: "da_giao",   label: "Đã xuất kho" },
  { value: "chua_giao", label: "Chưa giao" },
];

// Mẫu in HAI LIÊN (A4 ngang, cắt đôi) là tờ giấy riêng của USA_Meva — bê nguyên từ hệ
// cũ của họ, kèm bảng công nợ I→VI và ô ký nhận từng dòng mà đơn vị khác không dùng.
// Đơn vị KHÔNG nằm trong danh sách này in mẫu A4 dọc một liên (../mauInPhieu.ts).
// Thêm đơn vị muốn dùng mẫu hai liên thì thêm mã vào đây.
const DUNG_MAU_HAI_LIEN = ["USA_MEVA_NB"];

export default function DanhSachPhieuUsa() {
  const nav = useNavigate();
  const loc = useLocation();
  const { session } = useAuth();
  const haiLien = DUNG_MAU_HAI_LIEN.includes(session?.tenant.code ?? "");

  const [ds, setDs] = useState<DonNb[]>([]);
  const [tai, setTai] = useState(false);
  const [tu, setTu] = useState("");
  const [thang, setThang] = useState<number | undefined>();
  const [locHuong, setLocHuong] = useState<HuongDon | undefined>();
  const [locKho, setLocKho] = useState<LocKho>("tat_ca");
  const [dsChon, setDsChon] = useState<string[]>([]);

  const doc = useCallback(async (kw?: string, th?: number) => {
    setTai(true);
    try {
      const r = await nbDanhSachDonTatCa(th, kw, 500);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách phiếu"));
    } finally {
      setTai(false);
    }
  }, []);

  // Hoãn sang microtask: gọi thẳng trong thân effect thì setTai(true) chạy đồng bộ
  // ngay trong lượt render, sinh render dây chuyền.
  useEffect(() => {
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void doc(undefined, thang); });
    return () => { huy = true; };
  }, [doc, thang]);

  // Lọc chiều + trạng thái kho làm ở FE: dữ liệu đã có sẵn trong tay, bắn thêm lượt API
  // chỉ để bỏ bớt dòng là chậm hơn mà không được gì.
  const dsHien = useMemo(
    () => ds.filter((d) => {
      if (locHuong && d.huong !== locHuong) return false;
      if (locKho === "da_giao"   && !d.ngayNh) return false;
      if (locKho === "chua_giao" &&  d.ngayNh) return false;
      return true;
    }),
    [ds, locHuong, locKho]);

  const soDaXuat = useMemo(() => dsHien.filter((d) => !!d.ngayNh).length, [dsHien]);
  const soChuaGiao = dsHien.length - soDaXuat;

  // ================= 1. MỞ RỘNG DÒNG XEM CHI TIẾT =================
  // Lưới chỉ có phần ĐẦU đơn, không có dòng hàng. Bấm mở mới gọi chi tiết (nạp lười) —
  // nạp sẵn cả 500 đơn là 500 lượt gọi cho thứ người dùng chỉ xem vài cái.
  // Nhớ lại vào ctChiTiet để đóng/mở lại không phải gọi lần hai.
  const [ctChiTiet, setCtChiTiet] = useState<Map<string, DonNb>>(new Map());
  const dangTaiCt = useRef<Set<string>>(new Set());
  // dangMo khai báo ở mục 3 bên dưới — nó cần biết đơn nào vừa sửa để mở sẵn.

  const napChiTiet = useCallback(async (maHd: string) => {
    if (ctChiTiet.has(maHd) || dangTaiCt.current.has(maHd)) return;
    dangTaiCt.current.add(maHd);
    try {
      const r = await nbLayDon(maHd);
      setCtChiTiet((m) => new Map(m).set(maHd, r.data));
    } catch (e) {
      message.error(loiApi(e, `Không đọc được chi tiết đơn ${maHd}`));
    } finally {
      dangTaiCt.current.delete(maHd);
    }
  }, [ctChiTiet]);

  const bangChiTiet = useCallback((d: DonNb) => {
    const ct = d.maHd ? ctChiTiet.get(d.maHd) : undefined;
    if (!ct) return <Typography.Text type="secondary">Đang đọc chi tiết…</Typography.Text>;
    if (ct.lines.length === 0)
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đơn không có dòng hàng nào" />;
    return (
      <Table<DonNbLine>
        rowKey="sttLine"
        size="small"
        pagination={false}
        dataSource={ct.lines}
        columns={[
          { title: "STT", width: 50, align: "center",
            render: (_v, _r, i) => i + 1 },
          { title: "Tên hàng", dataIndex: "tenHang", ellipsis: true },
          { title: "ĐVT", dataIndex: "dvt", width: 80, align: "center" },
          { title: "Số lượng", dataIndex: "soLuong", width: 90, align: "right",
            render: (v: number) => <span style={kieuSo}>{soTien(v)}</span> },
          { title: "Đơn giá", dataIndex: "donGia", width: 110, align: "right",
            render: (v: number) => <span style={kieuSo}>{soTien(v)}</span> },
          // Mã màu kèm chấm màu — người xem đối chiếu ngay với tờ phiếu đã in.
          { title: "Mã màu", dataIndex: "maMau", width: 110,
            render: (v: string | null, r: DonNbLine) => v
              ? <span className="umv__mau-o">
                  {r.maHex
                    ? <i className="umv__mau-cham" style={{ background: r.maHex }} />
                    : null}
                  {v}
                </span>
              : null },
          { title: "Tiền tinh màu", dataIndex: "tienTinhMau", width: 110, align: "right",
            render: (v: number) => v
              ? <span style={kieuSo}>{soTien(v)}</span> : null },
          { title: "%VAT", dataIndex: "ptVat", width: 70, align: "right" },
          { title: "Thành tiền", dataIndex: "thanhTien", width: 130, align: "right",
            render: (v: number) => <b style={kieuSo}>{soTien(v)}</b> },
          { title: "Ghi chú", dataIndex: "ghiChu", width: 160, ellipsis: true },
        ]}
      />
    );
  }, [ctChiTiet]);

  // ================= 2. IN HÀNG LOẠT =================
  // Phải nạp chi tiết TỪNG đơn rồi mới in được (lưới không có dòng hàng).
  // Dùng mẫu HAI LIÊN A4 ngang: nhiều đơn thì nhiều trang, mỗi đơn một tờ.
  const [dangInLo, setDangInLo] = useState(false);
  const inHangLoat = useCallback(async () => {
    if (dsChon.length === 0) return;
    setDangInLo(true);
    try {
      // Nạp song song cho nhanh, nhưng giữ ĐÚNG THỨ TỰ đang hiện trên lưới:
      // xấp giấy in ra phải khớp thứ tự người dùng nhìn thấy, không thì lúc chia
      // cho từng chuyến xe phải dò lại từng tờ.
      const theoThuTu = dsHien
        .filter((d) => d.maHd && dsChon.includes(d.maHd))
        .map((d) => d.maHd!);
      const kq = await Promise.all(theoThuTu.map((ma) =>
        (ctChiTiet.get(ma)
          ? Promise.resolve(ctChiTiet.get(ma)!)
          : nbLayDon(ma).then((r) => r.data)
        ).catch(() => null)));

      const donDay = kq.filter((x): x is DonNb => x != null);
      const soHong = kq.length - donDay.length;
      if (donDay.length === 0) { message.error("Không đọc được đơn nào để in"); return; }
      // Đọc hỏng vài đơn thì vẫn in phần còn lại, nhưng PHẢI nói ra — im lặng in thiếu
      // là thủ kho soạn thiếu hàng mà không ai biết.
      if (soHong > 0) message.warning(`${soHong} đơn không đọc được, chỉ in ${donDay.length} đơn`);

      // Nhớ lại để lần sau mở rộng dòng khỏi gọi lại
      setCtChiTiet((m) => {
        const n = new Map(m);
        donDay.forEach((d) => { if (d.maHd) n.set(d.maHd, d); });
        return n;
      });
      if (haiLien) {
        inHaiLien(donDay, { tenCty: session?.tenant.name });
      } else {
        // Mẫu A4 dọc in MỘT đơn mỗi lượt -> gọi lần lượt. Mỗi lượt là một hộp thoại in,
        // nên chặn ở 20 đơn: quá số đó người dùng phải bấm 20 lần, tưởng máy treo.
        if (donDay.length > 20) {
          message.warning("Mẫu một liên in từng phiếu — chọn tối đa 20 phiếu một lượt");
          return;
        }
        donDay.forEach((d) => inPhieuDon(d, { ten: session?.tenant.name }));
      }
    } finally {
      setDangInLo(false);
    }
  }, [dsChon, dsHien, ctChiTiet, session, haiLien]);

  // ================= 3. HIGHLIGHT ĐƠN VỪA SỬA =================
  // Form lưu xong quay về đây kèm state {maHdVuaLuu}. Tự mở rộng + cuộn tới + tô nền,
  // tắt sau 3 giây. Không có cái này thì sửa xong quay về phải tự dò trong 500 dòng.
  // Đọc NGAY LÚC KHỞI TẠO chứ không trong effect: mã đơn nằm sẵn trong location.state
  // từ trước khi component vẽ lần đầu, nên đây là giá trị ban đầu chứ không phải phản
  // ứng với thay đổi. Đặt trong effect thì vẽ một lượt thừa rồi mới tô sáng (và eslint
  // chặn đúng ở react-hooks/set-state-in-effect).
  const maVuaLuu = (loc.state as { maHdVuaLuu?: string } | null)?.maHdVuaLuu ?? null;
  const [maHdSang, setMaHdSang] = useState<string | null>(maVuaLuu);
  const [dangMo, setDangMo] = useState<string[]>(maVuaLuu ? [maVuaLuu] : []);

  useEffect(() => {
    if (!maVuaLuu) return;
    // napChiTiet gọi API rồi mới setState trong .then — không phải setState đồng bộ
    // trong thân effect. Luật lint không phân biệt được nên phải tắt đúng dòng này.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void napChiTiet(maVuaLuu);
    // Dọn state khỏi history: để nguyên thì F5 hoặc bấm Back lại tô sáng lần nữa,
    // trong khi người dùng đã xem xong từ lâu.
    nav(loc.pathname, { replace: true, state: null });
    const t = setTimeout(() => setMaHdSang(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maVuaLuu]);

  // Cuộn tới dòng vừa tô sáng. Chờ một nhịp cho Table vẽ xong dòng đó.
  useEffect(() => {
    if (!maHdSang) return;
    const t = setTimeout(() => {
      document.querySelector(`[data-ma-hd="${maHdSang}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [maHdSang, dsHien]);

  // ---------- Ghép gói: KHÔNG làm ở màn này (bỏ 08/08) ----------
  // Ghép/chốt/xuất gói nay chỉ làm ở màn GÓI HÀNG — nơi có đủ thao tác của vòng đời
  // gói (BR-NB-08: ghép -> chốt sinh phiếu soạn -> xuất đóng dấu ngay_nh -> thu tiền).
  // Nút "Tạo gói nhanh" ở đây chỉ làm được nhịp đầu rồi vẫn phải sang màn kia, nên
  // để lại chỉ khiến người dùng tưởng gói đã xong.
  // Ô tích chọn giữ nguyên — nay phục vụ IN HÀNG LOẠT.

  // Mở sang form BẢN USA_MEVA theo chiều của đơn
  const moDon = useCallback((d: DonNb) => {
    const duong = d.huong === "VAO" ? "/app/phieu-nhap" : "/app/phieu-xuat";
    nav(`${duong}?maHd=${encodeURIComponent(d.maHd ?? "")}`);
  }, [nav]);

  // In MỘT phiếu — cùng mẫu HAI LIÊN với nút in hàng loạt.
  // Trước đây chỗ này gọi mẫu A4 dọc một liên: in một phiếu ra tờ khác hẳn in cả xấp,
  // mà cùng là phiếu giao cho khách ký. Nay thống nhất một mẫu.
  const [dangIn, setDangIn] = useState<string | null>(null);
  const inDon = useCallback(async (d: DonNb) => {
    if (!d.maHd) return;
    setDangIn(d.maHd);
    try {
      const ct = ctChiTiet.get(d.maHd) ?? (await nbLayDon(d.maHd)).data;
      setCtChiTiet((m) => new Map(m).set(d.maHd!, ct));
      if (haiLien) inHaiLien(ct, { tenCty: session?.tenant.name });
      else inPhieuDon(ct, { ten: session?.tenant.name });
    } catch (e) {
      message.error(loiApi(e, "Không in được phiếu"));
    } finally {
      setDangIn(null);
    }
  }, [session, ctChiTiet, haiLien]);

  // XUẤT HÓA ĐƠN — tạm thời chỉ MỞ BẢN XEM TRƯỚC để soát tên hàng (ten_hd) trước khi
  // đẩy sang hóa đơn điện tử. Chưa cấp số hóa đơn, chưa ký số, chưa gửi Viettel.
  // Dùng chung cache ctChiTiet với nút In: đơn đã mở rồi thì không gọi lại API.
  const [dangXuat, setDangXuat] = useState<string | null>(null);
  const xuatHoaDon = useCallback(async (d: DonNb) => {
    if (!d.maHd) return;
    setDangXuat(d.maHd);
    try {
      const ct = ctChiTiet.get(d.maHd) ?? (await nbLayDon(d.maHd)).data;
      setCtChiTiet((m) => new Map(m).set(d.maHd!, ct));
      xemTruocHoaDon(ct, { ten: session?.tenant.name });
    } catch (e) {
      message.error(loiApi(e, "Không mở được bản xem trước hóa đơn"));
    } finally {
      setDangXuat(null);
    }
  }, [session, ctChiTiet]);

  const cot = useMemo(() => [
    {
      title: "Loại", dataIndex: "huong", width: 110,
      render: (v: HuongDon | null) => {
        const n = v ? NHAN_HUONG[v] : null;
        return n ? <Tag color={n.mau}>{n.chu}</Tag> : "—";
      },
    },
    {
      title: "Mã đơn", dataIndex: "maHd", width: 85,
      render: (v: string) => <span style={{ ...kieuSo, fontWeight: 600 }}>{v}</span>,
    },
    {
      title: "Ngày lập", dataIndex: "ngay", width: 100,
      render: (v: string | null) => ngayVn(v) || "—",
    },
    {
      title: "Ngày kho", dataIndex: "ngayNh", width: 115,
      render: (v: string | null) => v ? ngayVn(v) : <Tag color="orange">chưa giao</Tag>,
    },
    { title: "Đối tác", dataIndex: "tenKh", ellipsis: true },
    { title: "NV giao", dataIndex: "tenNvvc", width: 130, ellipsis: true },
    // Cột "Gói" đã bỏ: gần như luôn rỗng với đơn vị không dùng gói (USA_MEVA_NB nằm
    // trong KHONG_DUNG_GOI), chiếm chỗ mà không mang tin. Mã gói vẫn xem được ở màn
    // GÓI HÀNG — nơi có đủ vòng đời gói (BR-NB-08).
    {
      title: "Tiền hàng", dataIndex: "tienHang", width: 120, align: "right" as const,
      render: (v: number) => <span style={kieuSo}>{soTien(v)}</span>,
    },
    {
      title: "Tổng cộng", dataIndex: "tongTien", width: 130, align: "right" as const,
      render: (v: number) => <b style={kieuSo}>{soTien(v)}</b>,
    },
    {
      title: "", width: 110, align: "center" as const,
      render: (_: unknown, r: DonNb) => (
        <Space size={0}>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" type="link" icon={<EditOutlined />}
                    onClick={() => moDon(r)} />
          </Tooltip>
          <Tooltip title={haiLien ? "In 2 liên (A4 ngang, cắt đôi)" : "In phiếu"}>
            <Button size="small" type="link" icon={<PrinterOutlined />}
                    loading={dangIn === r.maHd} onClick={() => inDon(r)} />
          </Tooltip>
          <Tooltip title="Xuất hóa đơn — mở bản xem trước (tên hàng theo tên hóa đơn)">
            <Button size="small" type="link" icon={<FileTextOutlined />}
                    loading={dangXuat === r.maHd} onClick={() => xuatHoaDon(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ], [moDon, inDon, dangIn, haiLien, xuatHoaDon, dangXuat]);

  return (
    <div className="pxn-trang">
      <Card
        size="small"
        style={{ borderTop: "4px solid #0f766e" }}
        title={
          <Typography.Text strong
                           style={{ fontSize: 19, color: "#0f766e", letterSpacing: 0.4 }}>
            DANH SÁCH PHIẾU
          </Typography.Text>
        }
        extra={
          <Space>
            <Button onClick={() => nav("/app/phieu-nhap")}>+ Phiếu nhập</Button>
            <Button type="primary" onClick={() => nav("/app/phieu-xuat")}>
              + Phiếu xuất hàng
            </Button>
          </Space>
        }
        styles={{ body: { padding: "10px 14px" } }}
      >
        {/* ---------- Thanh lọc ---------- */}
        <Row gutter={[10, 8]} style={{ marginBottom: 10 }}>
          <Col xs={24} md={7}>
            <div className="pxn__nhan">Tìm</div>
            <Input.Search
              placeholder="Số đơn hoặc tên đối tác"
              value={tu}
              onChange={(e) => setTu(e.target.value)}
              onSearch={(v) => doc(v, thang)}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="pxn__nhan">Tháng</div>
            <Select allowClear style={{ width: "100%" }} placeholder="Cả năm"
                    value={thang} onChange={setThang} options={THANG} />
          </Col>
          <Col xs={12} md={4}>
            <div className="pxn__nhan">Loại phiếu</div>
            <Select allowClear style={{ width: "100%" }} placeholder="Cả hai"
                    value={locHuong} onChange={setLocHuong}
                    options={[
                      { value: "RA", label: "Phiếu xuất hàng" },
                      { value: "VAO", label: "Phiếu nhập hàng" },
                    ]} />
          </Col>
          <Col xs={12} md={4}>
            {/* BR-NB-07: lọc theo mốc rời kho thật, không phải ngày lập đơn */}
            <div className="pxn__nhan">Trạng thái kho</div>
            <Select style={{ width: "100%" }} value={locKho}
                    onChange={(v) => setLocKho(v as LocKho)} options={LOC_KHO} />
          </Col>
          <Col xs={12} md={5}>
            <div className="pxn__nhan">Tổng hợp</div>
            <div style={{ height: 32, display: "flex", alignItems: "center" }}>
              <Typography.Text>
                Đã xuất kho{" "}
                <b style={{ ...kieuSo, fontSize: 16 }}>{soDaXuat}</b>
                <Typography.Text type="secondary"> / {dsHien.length}</Typography.Text>
                {soChuaGiao > 0 && (
                  <Tag color="orange" style={{ marginLeft: 8 }}>
                    còn {soChuaGiao} chưa giao
                  </Tag>
                )}
              </Typography.Text>
            </div>
          </Col>
        </Row>

        {/* ---------- Thao tác hàng loạt ---------- */}
        <Space style={{ marginBottom: 10 }}>
          <Tooltip title={dsChon.length === 0
            ? `Tích chọn phiếu rồi bấm để in cả xấp${haiLien ? " (A4 ngang, hai liên)" : ""}`
            : `In ${dsChon.length} phiếu, mỗi phiếu một tờ`}>
            <Button type="primary" icon={<PrinterOutlined />} loading={dangInLo}
                    disabled={dsChon.length === 0} onClick={inHangLoat}>
              {haiLien ? "In 2 liên" : "In phiếu"}
              {dsChon.length > 0 ? ` (${dsChon.length})` : ""}
            </Button>
          </Tooltip>
        </Space>

        <Table
          rowKey="maHd"
          size="small"
          loading={tai}
          dataSource={dsHien}
          columns={cot}
          rowSelection={{
            selectedRowKeys: dsChon,
            onChange: (k) => setDsChon(k as string[]),
            // Chỉ phiếu XUẤT chưa vào gói mới ghép gói được (BR-NB-08: một đơn không
            // lên hai xe). Nhưng in thì phiếu nào cũng in được — nên KHÔNG chặn tích
            // chọn ở đây nữa, mà chặn ngay lúc bấm nút Tạo gói (xem taoGoiNhanh).
          }}
          expandable={{
            expandedRowKeys: dangMo,
            onExpandedRowsChange: (k) => setDangMo(k as string[]),
            onExpand: (mo, r) => { if (mo && r.maHd) void napChiTiet(r.maHd); },
            expandedRowRender: bangChiTiet,
          }}
          pagination={{ pageSize: 20, showSizeChanger: true,
                        showTotal: (t) => `${t} phiếu` }}
          locale={{ emptyText: <Empty description="Chưa có phiếu nào" /> }}
          onRow={(r) => ({
            onDoubleClick: () => moDon(r),
            "data-ma-hd": r.maHd,
            style: r.maHd === maHdSang ? { background: "#fffbe6" } : undefined,
          }) as React.HTMLAttributes<HTMLElement>}
        />
      </Card>
    </div>
  );
}
