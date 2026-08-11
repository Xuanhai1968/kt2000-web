import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, Button, Input, Select, Checkbox, Radio, Typography, Space,
} from "antd";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { HoaDonThue, HoaDonLine } from "../api";
import {
  themeVfp, luoiVfpProps, colVfp, dinhDangPhanTramVat, nhoDoRongCot,
} from "../theme/luoiVfp";
import "./mau-huong.css";          // .ag-row.dong-dang-chon — tô dòng đang chọn
import "./keo-cot.css";            // con trỏ ↔ ở mép cột, báo cho biết kéo được
import "./danh-sach-hoa-don.css";

// ============ DANH SÁCH HÓA ĐƠN GTGT — FRM_DS_HDDT ============
// Dựng lại form "Danh sách hóa đơn GTGT đầu vào/ra" của KT2000 VFP: lưới hóa đơn
// dày ở trên, ba tầng thanh công cụ nhồi kín ở dưới.
//
// Nguồn dữ liệu: dùng LẠI mảng HoaDonThue mà màn cha đã đọc từ sổ thuế — form này
// chỉ để TÌM và CHỌN, không tự gọi API. Làm vậy thì mở form là có ngay danh sách,
// không phải chờ tải lần hai, và không bao giờ lệch với thứ màn cha đang hiển thị.
//
// Dòng hàng: API danh sách không kèm lines cho nhẹ tải, nên bảng dưới chỉ có dữ
// liệu sau khi màn cha tải chi tiết hóa đơn đó (onChon -> taiChiTiet). Ở đây gọi
// onChon ngay khi bấm chọn dòng để bảng dưới đổ dữ liệu mà không phải đóng modal.

interface Props {
  mo: boolean;
  onDong: () => void;
  dsHd: HoaDonThue[];
  namLamViec: number;
  tenDonVi: string;
  laDauRa: boolean;
  onChon: (maHd: string, bucTaiLai?: boolean) => void;
  onXemHtml: (maHd: string) => void;
}

// Nút chưa nối nghiệp vụ: giữ nguyên màu và vị trí như bản gốc nhưng để disabled,
// thà mờ còn hơn bấm vào im lặng không làm gì.
function NutCho({ nhan, lop = "" }: { nhan: string; lop?: string }) {
  return (
    <Button size="small" className={lop} disabled
            title="Nghiệp vụ này chưa xử lý">
      {nhan}
    </Button>
  );
}

export default function DanhSachHoaDon({
  mo, onDong, dsHd, namLamViec, tenDonVi, laDauRa, onChon, onXemHtml,
}: Props) {
  const [thang, setThang] = useState<number | "all">("all");
  const [thangKT, setThangKT] = useState<number | "all">("all");
  const [oTuKhoa, setOTuKhoa] = useState("");
  const [tuKhoa, setTuKhoa] = useState("");
  const timNgay = () => setTuKhoa(oTuKhoa);
  const [fileChon, setFileChon] = useState<string | null>(null);
  const [nhomDoi, setNhomDoi] = useState("ten_kh");
  const [nhomDoi2, setNhomDoi2] = useState("ten_hang");
  const [cb, setCb] = useState<Record<string, boolean>>({
    kiemTraThuTu: false, chiLayDanhDau: false, tatCa: false, ghiNho: true,
    themVaoDanhMuc: true, chuyenUnicode: true, nhomTheoTenHang: false,
    theoNgayNhapHang: false, dongBoBoQuaDuoi: false, duongDanKhac: false,
    themMoiCaKhiDaCo: false, nhapHangTraLai: false, layDuLieuTheoDuongDan: false,
    xoaDuLieuTruocKhiLay: false, chuyenSangGhiChuG: false,
    chuyenTenHangSangGhiChu: false, tongHopKhiDongBo: true,
    printPreview: false, inTatCa: false, nganHang: false,
    khongInHangKM: false, giaDaCoThue: false, lapRapCB1: true,
    chiLayFileExcelSP: true, chiInPDF: false, chiTrongBangKe: false,
  });
  const datCb = (k: string, v: boolean) => setCb((m) => ({ ...m, [k]: v }));

  const dsLoc = useMemo(() => {
    const k = tuKhoa.trim().toLowerCase();
    return dsHd.filter((x) => {
      if (thang !== "all" && x.thang !== thang) return false;
      if (!k) return true;
      return [x.soHd, x.khhd, x.mst, x.tenKh, x.maHd]
        .some((v) => (v ?? "").toLowerCase().includes(k));
    });
  }, [dsHd, thang, tuKhoa]);

  // Hóa đơn đang chọn ở bảng trên — nguồn của bảng dòng hàng bên dưới
  const hdDangChon = useMemo(
    () => dsHd.find((x) => x.maHd === fileChon) ?? null, [dsHd, fileChon]);

  const tongTienHang = useMemo(
    () => dsLoc.reduce((s, x) => s + x.tienHang, 0), [dsLoc]);
  const tongTienVat = useMemo(
    () => dsLoc.reduce((s, x) => s + x.tienVat, 0), [dsLoc]);
  const tongThanhToan = useMemo(
    () => dsLoc.reduce((s, x) => s + x.tongTien, 0), [dsLoc]);

  const soVn = (v: number) =>
    v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Ngày dd/MM/yy như lưới gốc. Backend trả ISO datetime nên cắt phần ngày trước.
  const ngayNgan = (s: string | null) => {
    const p = (s ?? "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
  };

  const hoanRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const huyHoan = () => {
    if (hoanRef.current) { clearTimeout(hoanRef.current); hoanRef.current = null; }
  };
  useEffect(() => huyHoan, []);

  const chonDong = (maHd: string) => {
    huyHoan();
    setFileChon(maHd);
    onChon(maHd);
  };

  const chonDongHoan = (maHd: string) => {
    huyHoan();
    setFileChon(maHd);
    hoanRef.current = setTimeout(() => {
      hoanRef.current = null;
      onChon(maHd);
    }, 250);
  };

  const chonVaDong = () => {
    if (fileChon) { onChon(fileChon); onDong(); }
  };

  // ===== Cột "In": TỰ tích theo dữ liệu, vẫn bấm được =====
  //
  // BR: hóa đơn ĐIỀU CHỈNH / THAY THẾ nhận biết bằng tich_chat_hd_lienquan khác
  // trống (docs/THUE/BienBan_RaSoat.md — cột hd_thay_the_dieu_chinh bị bỏ vì suy
  // ra được từ đây). Không dò theo chữ trong tthaiHd: giá trị đó là văn bản tự do
  // của TCT, đổi cách viết một cái là phép lọc câm lặng bỏ sót hóa đơn.
  //
  // Đánh dấu hóa đơn VỪA có chiết khấu VỪA là điều chỉnh/thay thế.
  const laCanIn = (h: HoaDonThue) =>
    (h.tienCk ?? 0) !== 0 && (h.tichChatHdLienquan ?? "").trim() !== "";

  // Chỉ giữ những mã người dùng TỰ BẤM ngược lại mặc định, không giữ cả tập đã
  // tích. Nhờ vậy ô tích luôn bám theo dữ liệu mới nhất: tải lại danh sách hay
  // sửa chiết khấu là dấu tự đúng, không cần đồng bộ tay và không bao giờ lệch.
  // (Ghi đè chỉ sống trong phiên — chưa có cột nào dưới DB để lưu.)
  const [inGhiDe, setInGhiDe] = useState<Record<string, boolean>>({});

  const laDanhDauIn = (h: HoaDonThue) => inGhiDe[h.maHd] ?? laCanIn(h);

  const datIn = (h: HoaDonThue, tich: boolean) => {
    setInGhiDe((cu) => {
      // Bấm về đúng giá trị mặc định thì XÓA ghi đè, đừng lưu lại — để dòng đó
      // tiếp tục bám dữ liệu nếu chiết khấu đổi về sau.
      if (tich === laCanIn(h)) {
        const moi = { ...cu };
        delete moi[h.maHd];
        return moi;
      }
      return { ...cu, [h.maHd]: tich };
    });
  };

  const soDanhDau = useMemo(
    () => dsLoc.filter(laDanhDauIn).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dsLoc, inGhiDe]);

  // Cầu nối cho cell renderer của cột In: xem chú thích tại colId "in".
  const luoiTrenRef = useRef<AgGridReact<HoaDonThue> | null>(null);
  const hamRef = useRef({ laDanhDauIn, datIn });

  // Làm mới cầu nối rồi bảo AG Grid vẽ lại cột In. Nó không tự biết state React
  // đã đổi vì mảng cột cố tình không phụ thuộc state. Chạy theo cả dsLoc: tải
  // lại danh sách hay sửa chiết khấu thì dấu tự tính lại cho đúng.
  useEffect(() => {
    hamRef.current = { laDanhDauIn, datIn };
    luoiTrenRef.current?.api?.refreshCells({ columns: ["in"], force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGhiDe, dsLoc]);

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);
  const optThang = [{ value: "all" as const, label: "Tất cả các tháng" },
                    ...cacThang.map((m) => ({ value: m, label: `Tháng ${m}` }))];

  const cotTren = useMemo<ColDef<HoaDonThue>[]>(() => [
    { colId: "stt", headerName: "STT", width: 48, pinned: "left",
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1 },
    { colId: "maHd", headerName: "Mã HĐ", field: "maHd", width: 150,
      pinned: "left", tooltipField: "maHd" },
    { colId: "ngay", headerName: "Ngày", width: 74,
      valueGetter: (p) => ngayNgan(p.data?.ngay ?? null) },
    { colId: "ngayNh", headerName: "Ngày NH", width: 74,
      valueGetter: (p) => ngayNgan(p.data?.ngayNh ?? p.data?.ngay ?? null) },
    { colId: "soHd", headerName: "Số HĐ", field: "soHd", width: 82 },
    { colId: "nhanSu", headerName: "Nhân sự", width: 330,
      valueGetter: (p) => `${p.data?.tenKh ?? ""}_${p.data?.mst ?? ""}`,
      tooltipValueGetter: (p) => String(p.value ?? "") },
    // Định khoản: dòng nào chưa hạch toán thì để trống như bản gốc
    { colId: "ghiNo", headerName: "Nợ", field: "ghiNo", width: 44 },
    { colId: "ghiCo", headerName: "Có", field: "ghiCo", width: 44 },
    { colId: "ptVat", headerName: "%VAT", width: 50,
      valueGetter: (p) => dinhDangPhanTramVat(p.data?.lines[0]?.ptVat) },
    { colId: "noVat", headerName: "Nợ VAT", width: 50, valueGetter: () => "" },
    { colId: "coVat", headerName: "Có VAT", width: 46, valueGetter: () => "" },
    { colId: "kt", headerName: "KT", width: 44, valueGetter: () => "" },
    { colId: "tienHang", headerName: "Tiền HĐ", field: "tienHang", width: 130,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "tienCk", headerName: "Tiền CK", field: "tienCk", width: 110,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "tienVat", headerName: "Tiền VAT", field: "tienVat", width: 120,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "maTv", headerName: "Thương vụ", field: "maTv", width: 90 },
    { colId: "ghiChu", headerName: "Ghi chú", field: "ghiChu", width: 130,
      tooltipField: "ghiChu" },
    // Ô tích TỰ BẬT cho hóa đơn có chiết khấu + điều chỉnh/thay thế, nhưng vẫn
    // bấm được. checkbox thuần thay vì antd Checkbox: ô lưới cao 22px và cell
    // renderer dựng lại liên tục khi cuộn — component nặng ở đây không đáng.
    //
    // Đọc qua hamRef chứ không gọi thẳng laDanhDauIn/datIn: mảng cột này để deps
    // rỗng cho AG Grid giữ nguyên tham chiếu (nhoDoRongCot cần thế), nên closure
    // ở đây bắt mất bản đầu tiên của hai hàm và ô tích sẽ đứng im khi bấm.
    { colId: "in", headerName: "In", width: 46,
      headerTooltip: "Tự đánh dấu: HĐ có chiết khấu và là HĐ điều chỉnh/thay thế",
      valueGetter: (p) => (p.data ? hamRef.current.laDanhDauIn(p.data) : false),
      cellStyle: { backgroundColor: "#f5f5f5", textAlign: "center" },
      // onClick chặn nổi bọt: bấm ô tích không được kéo theo "chọn dòng" của
      // lưới — hai hành động khác nhau, gộp lại thì tích một cái là đổi luôn
      // hóa đơn đang xem ở bảng dưới.
      cellRenderer: (p: { data?: HoaDonThue }) => p.data ? (
        <input type="checkbox"
               checked={hamRef.current.laDanhDauIn(p.data)}
               onClick={(e) => e.stopPropagation()}
               onChange={(e) => p.data && hamRef.current.datIn(p.data, e.target.checked)} />
      ) : null },
    { colId: "tongTien", headerName: "Tổng G.Vốn", field: "tongTien", width: 130,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "loLai", headerName: "Lỗ - Lãi", width: 90, type: "numericColumn",
      valueGetter: () => 0, valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "ckGoc", headerName: "CK Gốc", width: 80, type: "numericColumn",
      valueGetter: () => 0, valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "sohdLienquan", headerName: "Số HĐLQ", field: "sohdLienquan", width: 90 },
    { colId: "tichChatHdLienquan", headerName: "Số HĐLCTC HĐ",
      field: "tichChatHdLienquan", width: 110 },
    { colId: "loaiHdLienquan", headerName: "Loại HĐ", field: "loaiHdLienquan", width: 80 },
    { colId: "mauSoHdLienquan", headerName: "Mã Số HĐ", field: "mauSoHdLienquan", width: 90 },
    { colId: "khhd", headerName: "Ký hiệu HĐ", field: "khhd", width: 100 },
    { colId: "tthaiHd", headerName: "Trạng thái", field: "tthaiHd", width: 100 },
    { colId: "ghiChu2", headerName: "Ghi chú", field: "ghiChu", width: 120,
      tooltipField: "ghiChu" },
  ], []);

  const cotDuoi = useMemo<ColDef<HoaDonLine>[]>(() => [
    { colId: "sttLine", headerName: "STT", field: "sttLine", width: 48, pinned: "left" },
    { colId: "tenHang", headerName: "Tên hàng hoá dịch vụ", field: "tenHang",
      width: 300, tooltipField: "tenHang" },
    { colId: "dvt", headerName: "ĐVT", field: "dvt", width: 70 },
    { colId: "soLuong", headerName: "Số lượng", field: "soLuong", width: 96,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "donGia", headerName: "Đơn giá", field: "donGia", width: 120,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "thanhTien", headerName: "Thành tiền", field: "thanhTien", width: 130,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0),
      cellStyle: { backgroundColor: "#f5f5f5", fontWeight: 600 } },
    { colId: "ptVat", headerName: "% VAT", width: 66,
      valueGetter: (p) => dinhDangPhanTramVat(p.data?.ptVat) },
    // Chưa định khoản thì hiện giá trị quy ước 156/331 như bản gốc
    { colId: "ghiNo", headerName: "Nợ", width: 50,
      valueGetter: (p) => p.data?.ghiNo || "156" },
    { colId: "ghiCo", headerName: "Có", width: 50,
      valueGetter: (p) => p.data?.ghiCo || "331" },
    { colId: "tienCk", headerName: "C.Khấu", field: "tienCk", width: 80,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "ghiChu", headerName: "Ghi chú", width: 200,
      valueGetter: (p) => p.data?.ghiChu || p.data?.tenHang || "",
      tooltipValueGetter: (p) => String(p.value ?? "") },
  ], []);

  const sumDuoi = useMemo(
    () => (hdDangChon?.lines ?? []).reduce((s, x) => s + x.thanhTien, 0),
    [hdDangChon]);

  return (
    <Modal
      title={`Danh sách hóa đơn GTGT ${laDauRa ? "đầu ra" : "đầu vào"} — ${tenDonVi}`}
      open={mo}
      onCancel={onDong}
      footer={null}
      width="100vw"
      style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
      styles={{
        body: {
          height: "calc(100vh - 96px)",
          overflow: "auto",
          padding: 6,
        },
      }}
    >
      <div className="ds-hoadon">
        {/* ===== THANH LỌC TRÊN CÙNG ===== */}
        <div className="thanh-loc">
          <span className="nhan">Tháng</span>
          <Select size="small" style={{ width: 150 }} value={thang}
                  onChange={(v) => setThang(v)} options={optThang} />
          <span className="nhan">Năm {namLamViec}</span>
          <Button size="small" className="nut-xanhdg">Refresh</Button>
          <NutCho nhan="Theo ngày" lop="nut-xanhdg" />
          <span className="nhan">Tháng KT:</span>
          <Select size="small" style={{ width: 130 }} value={thangKT}
                  onChange={(v) => setThangKT(v)} options={optThang} />

          <Checkbox checked={cb.kiemTraThuTu}
                    onChange={(e) => datCb("kiemTraThuTu", e.target.checked)}>
            Kiểm tra thứ tự HĐ ra
          </Checkbox>

          <NutCho nhan="Cập nhật TV" lop="nut-hong" />
          <NutCho nhan="Xoá HĐ đánh dấu" />
          <NutCho nhan="Xem tờ khai gốc" />

          <span style={{ flex: 1 }} />
          <NutCho nhan="Chuyển VAT Vào Giá trị" lop="nut-xanhdam" />
          <NutCho nhan="Chuyển Chi phí hoặc Thu nhập khác" lop="nut-hong" />
        </div>

        <div className="thanh-loc">
          <span className="nhan nhan-xanh">Tìm nhanh</span>
          <Input.Search size="small" allowClear style={{ width: 420 }}
                 placeholder="Số HĐ, ký hiệu, MST, tên đối tác, tên file. Enter để tìm"
                 value={oTuKhoa}
                 onChange={(e) => {
                   setOTuKhoa(e.target.value);
                   if (e.target.value === "") setTuKhoa("");
                 }}
                 onSearch={timNgay} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dsLoc.length}/{dsHd.length} hóa đơn
            {soDanhDau > 0 && (
              <span title="Hóa đơn vừa có chiết khấu vừa là HĐ điều chỉnh/thay thế — đã tự tích ở cột In">
                {" · "}<b>{soDanhDau}</b> HĐ đánh dấu ở cột In
              </span>
            )}
            {oTuKhoa !== tuKhoa && (
              <span style={{ color: "#d46b08" }}> Bấm Enter để tìm</span>
            )}
          </Typography.Text>
          <span style={{ flex: 1 }} />
          <Button size="small" className="nut-xanhla" disabled={!fileChon}
                  onClick={() => fileChon && onXemHtml(fileChon)}
                  title={fileChon ? `Mở bản HTML gốc của ${fileChon}`
                                  : "Chưa chọn hóa đơn"}>
            Xem ảnh gốc HĐ
          </Button>
          <Button size="small" type="primary" disabled={!fileChon}
                  onClick={chonVaDong}>
            Chọn hóa đơn này
          </Button>
        </div>

        <div style={{ height: 260 }}>
        <AgGridReact<HoaDonThue>
          ref={luoiTrenRef}
          theme={themeVfp}
          {...luoiVfpProps}
          {...nhoDoRongCot("ds_hoadon_tren")}
          rowData={dsLoc}
          getRowId={(p) => p.data.maHd}
          defaultColDef={colVfp}
          columnDefs={cotTren}
          overlayNoRowsTemplate="Không có hóa đơn nào khớp điều kiện lọc"
          rowClassRules={{ "dong-dang-chon": (p) => p.data?.maHd === fileChon }}
          onCellClicked={(e) => e.data && chonDong(e.data.maHd)}
          onRowDoubleClicked={(e) => {
            if (e.data) { onChon(e.data.maHd); onDong(); }
          }}
          onCellFocused={(e) => {
            if (e.rowIndex == null) return;
            const node = e.api.getDisplayedRowAtIndex(e.rowIndex);
            const maHd = node?.data?.maHd;
            if (maHd && maHd !== fileChon) chonDongHoan(maHd);
          }}

          onCellKeyDown={(e) => {
            const phim = (e.event as KeyboardEvent | null)?.key;
            if (phim !== "Enter") return;
            const maHd = e.data?.maHd;
            if (!maHd) return;
            huyHoan();               // bỏ lượt hoãn đang chờ, gọi thẳng
            setFileChon(maHd);
            onChon(maHd, true);      // buộc hỏi lại server
          }}
        />
        </div>

        {/* ===== TẦNG CÔNG CỤ 1: đổi hàng KM · tổng tiền · đánh dấu ===== */}
        <div className="tang-cong-cu">
          <Input.TextArea rows={3} style={{ width: 250 }} />

          <div className="cot-cong-cu">
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi hàng KM" lop="nut-xanhdg" />
              <div className="o-tong">{soVn(tongTienHang)}</div>
              <div className="o-tong">{soVn(tongThanhToan)}</div>
              <div className="o-tong" style={{ minWidth: 70 }}>{soVn(0)}</div>
              <NutCho nhan="Đánh dấu HĐ có VAT" lop="nut-xanhla" />
            </div>
            <div className="hang-cong-cu">
              <Radio.Group size="small" value={nhomDoi}
                           onChange={(e) => setNhomDoi(e.target.value)}>
                <Radio value="ten_kh">Đổi tên KH</Radio>
                <Radio value="ghi_no">Đổi Ghi nợ</Radio>
                <Radio value="ghi_co">Đổi ghi có</Radio>
                <Radio value="thuong_vu">Thương vụ</Radio>
              </Radio.Group>
              <NutCho nhan="Đánh dấu HĐ có CK" lop="nut-cam" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Lấy XML 2015" lop="nut-xanhdg" />
              <NutCho nhan="Đổi thông tin HĐ" lop="nut-xanhdg" />
              <Select size="small" style={{ width: 300 }} placeholder=" " />
            </div>
          </div>

          <div className="cot-cong-cu" style={{ marginLeft: "auto" }}>
            <Checkbox checked={cb.chuyenSangGhiChuG}
                      onChange={(e) => datCb("chuyenSangGhiChuG", e.target.checked)}>
              Chuyển sang GHI_CHU
            </Checkbox>
            <div className="hang-cong-cu">
              <NutCho nhan="Sửa ghi chú" lop="nut-vang" />
              <NutCho nhan="Copy File ảnh" lop="nut-vang" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm ghi chú" lop="nut-vang" />
              <NutCho nhan="Thêm KM theo DM hàng có sẵn" lop="nut-vang" />
            </div>
            <Checkbox checked={cb.chuyenTenHangSangGhiChu}
                      onChange={(e) => datCb("chuyenTenHangSangGhiChu", e.target.checked)}>
              Chuyển Tên hàng sang ghi chú bổ trống
            </Checkbox>
          </div>
        </div>

        {/* ===== TẦNG CÔNG CỤ 2: đồng bộ · kiểm tra định khoản ===== */}
        <Typography.Text style={{ fontSize: 12, color: "#0000cd", display: "block",
                                  marginTop: 4 }}>
          Bấm chuột phải vào ô Mã hoá đơn (F3) của HĐ tương ứng để Sửa phiếu này
        </Typography.Text>

        <div className="tang-cong-cu">
          <div className="cot-cong-cu">
            <Checkbox checked={cb.chiLayDanhDau}
                      onChange={(e) => datCb("chiLayDanhDau", e.target.checked)}>
              Chỉ lấy các HĐ đánh dấu
            </Checkbox>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.tatCa}
                        onChange={(e) => datCb("tatCa", e.target.checked)}>
                Tất Cả
              </Checkbox>
              <Checkbox checked={cb.ghiNho}
                        onChange={(e) => datCb("ghiNho", e.target.checked)}>
                Ghi nhớ
              </Checkbox>
            </div>
          </div>

          <div className="cot-cong-cu">
            <NutCho nhan="Đồng bộ Khách hàng" lop="nut-xanhdg" />
            <div className="hang-cong-cu">
              <NutCho nhan="Đồng bộ Hàng hóa" lop="nut-xanhdg" />
              <Checkbox checked={cb.tongHopKhiDongBo}
                        onChange={(e) => datCb("tongHopKhiDongBo", e.target.checked)}>
                Tổng hợp khi đồng bộ
              </Checkbox>
            </div>
          </div>

          <div className="cot-cong-cu">
            <NutCho nhan="Các HĐ trên 20T" lop="nut-xanhdg" />
            <NutCho nhan="Kiểm tra định khoản" lop="nut-xanhdg" />
          </div>

          <div className="cot-cong-cu">
            <Checkbox checked={cb.themVaoDanhMuc}
                      onChange={(e) => datCb("themVaoDanhMuc", e.target.checked)}>
              Thêm vào danh mục KH khi không có MST
            </Checkbox>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.nhomTheoTenHang}
                        onChange={(e) => datCb("nhomTheoTenHang", e.target.checked)}>
                Nhóm theo Tên hàng khi in chi tiết
              </Checkbox>
              <Checkbox checked={cb.nhapHangTraLai}
                        onChange={(e) => datCb("nhapHangTraLai", e.target.checked)}>
                Nhập hàng trả lại
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.theoNgayNhapHang}
                        onChange={(e) => datCb("theoNgayNhapHang", e.target.checked)}>
                Theo ngày nhập hàng
              </Checkbox>
              <Checkbox checked={cb.layDuLieuTheoDuongDan}
                        onChange={(e) => datCb("layDuLieuTheoDuongDan", e.target.checked)}>
                Lấy dữ liệu theo đường dẫn gốc
              </Checkbox>
            </div>
          </div>

          <div className="cot-cong-cu">
            <Checkbox checked={cb.themMoiCaKhiDaCo}
                      onChange={(e) => datCb("themMoiCaKhiDaCo", e.target.checked)}>
              Thêm mới cả khi đã có HĐ
            </Checkbox>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.dongBoBoQuaDuoi}
                        onChange={(e) => datCb("dongBoBoQuaDuoi", e.target.checked)}>
                Đồng bộ bỏ qua đuôi '_AD
              </Checkbox>
              <div className="o-tong" style={{ minWidth: 60 }}>{soVn(0)}</div>
              <NutCho nhan="Cập nhật % VAT" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.duongDanKhac}
                        onChange={(e) => datCb("duongDanKhac", e.target.checked)}>
                Đường dẫn khác
              </Checkbox>
              <NutCho nhan="Mark All Line" lop="nut-xanhdg" />
              <NutCho nhan="Chuyển C.Khấu" lop="nut-cam" />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.xoaDuLieuTruocKhiLay}
                        onChange={(e) => datCb("xoaDuLieuTruocKhiLay", e.target.checked)}>
                Xóa dữ liệu trước khi lấy
              </Checkbox>
              <NutCho nhan="Xử lý HĐ TT-ĐC-XB" lop="nut-vang" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 5 }}>
          <div className="hang-cong-cu" style={{ marginBottom: 2 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              Chi tiết hàng hoá dịch vụ
            </Typography.Text>
            {hdDangChon ? (
              <Typography.Text style={{ fontSize: 12 }}>
                — {hdDangChon.khhd}/{hdDangChon.soHd} · {ngayNgan(hdDangChon.ngay)} ·{" "}
                {hdDangChon.tenKh} {" "}
                <b>{hdDangChon.lines.length || hdDangChon.soDongHang}</b> dòng
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Bấm một hóa đơn ở bảng trên để xem dòng hàng
              </Typography.Text>
            )}
            <span style={{ flex: 1 }} />
            <Typography.Text style={{ fontSize: 12 }}>
              Tổng thành tiền{" "}
              <b style={{ color: !hdDangChon
                            || Math.abs(hdDangChon.tienHang - sumDuoi) < 10
                              ? "#389e0d" : "#cf1322" }}>
                {soVn(sumDuoi)}
              </b>
            </Typography.Text>
          </div>
          <div className="khung-phu" style={{ height: 170 }}>
            <AgGridReact<HoaDonLine>
              theme={themeVfp}
              {...luoiVfpProps}
              {...nhoDoRongCot("ds_hoadon_duoi")}
              rowData={hdDangChon?.lines ?? []}
              getRowId={(p) => String(p.data.sttLine)}
              defaultColDef={colVfp}
              columnDefs={cotDuoi}
              overlayNoRowsTemplate={hdDangChon
                ? "Hóa đơn này không có dòng hàng"
                : "Chưa chọn hóa đơn"}
            />
          </div>
        </div>

        {/* ===== TẦNG CÔNG CỤ 3: in ấn · công cụ ===== */}
        <div className="tang-cong-cu">
          <div className="cot-cong-cu">
            <div className="hang-cong-cu">
              <NutCho nhan="Công cụ" />
              <NutCho nhan="In phiếu TC" lop="nut-vang" />
              <Checkbox checked={cb.printPreview}
                        onChange={(e) => datCb("printPreview", e.target.checked)}>
                Print Preview
              </Checkbox>
              <Checkbox checked={cb.inTatCa}
                        onChange={(e) => datCb("inTatCa", e.target.checked)}>
                In tất cả
              </Checkbox>
              <Checkbox checked={cb.nganHang}
                        onChange={(e) => datCb("nganHang", e.target.checked)}>
                Ngân hàng
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Xóa HĐ lấy từ Excel" lop="nut-cam" />
              <NutCho nhan="Định khoản lại" lop="nut-xanhdg" />
              <NutCho nhan="Đổi ĐK theo TK kho" lop="nut-xanhdg" />
              <NutCho nhan="HĐ SX Tồn kho" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.khongInHangKM}
                        onChange={(e) => datCb("khongInHangKM", e.target.checked)}>
                Không in hàng KM khi in Bảng kê bán lẻ
              </Checkbox>
              <NutCho nhan="Kiểm tra tên trùng" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm C.Khấu" lop="nut-tim" />
              <div className="o-tong" style={{ minWidth: 90 }}>{soVn(0)}</div>
              <NutCho nhan="Đọc HĐ PDF" lop="nut-xanhla" />
              <NutCho nhan="Đọc HĐ PDF cùng XML" lop="nut-xanhla" />
              <NutCho nhan="Đọc tờ khai Hải quan" lop="nut-xanhla" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đọc HĐ Hủy" />
              <NutCho nhan="In P.Xuất kèm File PDF" lop="nut-xanhla" />
              <NutCho nhan="In Phiếu xuất kho" lop="nut-xanhla" />
            </div>
          </div>

          {/* Cột giữa: hạch toán 154 / hàng KM */}
          <div className="cot-cong-cu">
            <div className="hang-cong-cu">
              <NutCho nhan="Loại bỏ hạch 154" lop="nut-tim" />
              <NutCho nhan="Thêm KM cho HĐ Ra" lop="nut-xanhla" />
              <div className="o-tong" style={{ minWidth: 70 }}>{soVn(0)}</div>
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.lapRapCB1}
                        onChange={(e) => datCb("lapRapCB1", e.target.checked)}>
                Lắp ráp CB 1 (1521)
              </Checkbox>
              <Radio.Group size="small" value={nhomDoi2}
                           onChange={(e) => setNhomDoi2(e.target.value)}>
                <Radio value="ten_hang">Đổi tên hàng</Radio>
                <Radio value="ghi_no">Đổi Ghi nợ</Radio>
                <Radio value="ghi_co">Đổi ghi có</Radio>
                <Radio value="tv">Đổi TV</Radio>
              </Radio.Group>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi..." lop="nut-vang" />
              <span className="nhan">Tên</span>
              <Select size="small" style={{ width: 300 }} placeholder=" " />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.chiLayFileExcelSP}
                        onChange={(e) => datCb("chiLayFileExcelSP", e.target.checked)}>
                Chỉ lấy File Excel các SP Lỗ lãi
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Tính giá trị lãi lỗ" lop="nut-xanhla" />
              <NutCho nhan="Tìm Hàng lỗ theo HĐ" lop="nut-hong" />
            </div>
            <div className="hang-cong-cu">
              <div className="o-tong" style={{ minWidth: 90 }}>{soVn(0)}</div>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thay đổi ĐG theo GV" lop="nut-vang" />
              <NutCho nhan="Tạo HĐ tự tính" lop="nut-xanhla" />
              <NutCho nhan="Tạo HĐ từ TK" lop="nut-xanhla" />
              <NutCho nhan="Tạo HĐ từ TK New" lop="nut-cam" />
            </div>
          </div>

          {/* Cột phải: giá / mark line / thêm hàng KM */}
          <div className="cot-cong-cu">
            <div className="hang-cong-cu">
              <Checkbox checked={cb.giaDaCoThue}
                        onChange={(e) => datCb("giaDaCoThue", e.target.checked)}>
                Giá đã có thuế
              </Checkbox>
              <NutCho nhan="Mark 10 Line" lop="nut-xanhdg" />
              <Input size="small" style={{ width: 130 }} value="1" readOnly />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm GT cho HĐ lẻ" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm hàng KM" lop="nut-xanhdg" />
              <NutCho nhan="Thêm hàng KM nhiều HĐ" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Tách hàng KM sang HĐ" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Tách dòng hàng KM" lop="nut-xanhdg" />
              <NutCho nhan="Chuyển HĐ 154 sang H.Hóa" lop="nut-xanhdg" />
            </div>
          </div>
        </div>

        <Space style={{ marginTop: 6 }} size={12}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Tổng Tiền HĐ <b>{soVn(tongTienHang)}</b> · Σ VAT <b>{soVn(tongTienVat)}</b> ·
            Tổng Thanh toán <b>{soVn(tongThanhToan)}</b>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Bấm đúp một dòng để mở hóa đơn đó. Các nút mờ là nghiệp vụ chưa xử lý
          </Typography.Text>
        </Space>
      </div>
    </Modal>
  );
}
