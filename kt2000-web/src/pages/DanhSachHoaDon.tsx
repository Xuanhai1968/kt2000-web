import { useCallback, useMemo, useState } from "react";
import {
  Modal, Table, Button, Input, Select, Checkbox, Radio, Typography, Empty, Space,
} from "antd";
import type { HoaDonThue, HoaDonLine } from "../api";
import { useDieuHuongLuoi } from "./dieuHuongLuoi";
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
  onChon: (maHd: string) => void;
  onXemHtml: (maHd: string) => void;
}

// Nút chưa nối nghiệp vụ: giữ nguyên màu và vị trí như bản gốc nhưng để disabled,
// thà mờ còn hơn bấm vào im lặng không làm gì.
function NutCho({ nhan, lop = "" }: { nhan: string; lop?: string }) {
  return (
    <Button size="small" className={lop} disabled
            title="Nghiệp vụ này chưa nối backend">
      {nhan}
    </Button>
  );
}

export default function DanhSachHoaDon({
  mo, onDong, dsHd, namLamViec, tenDonVi, laDauRa, onChon, onXemHtml,
}: Props) {
  const [thang, setThang] = useState<number | "all">("all");
  const [thangKT, setThangKT] = useState<number | "all">("all");
  const [tuKhoa, setTuKhoa] = useState("");
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

  const chonDong = (maHd: string) => {
    setFileChon(maHd);
    onChon(maHd);
  };

  const [luoiDangCamPhim, setLuoiDangCamPhim] = useState<"tren" | "duoi">("tren");
  const doiDongTren = useCallback((i: number) => {
    const hd = dsLoc[i];
    if (hd && hd.maHd !== fileChon) chonDong(hd.maHd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsLoc, fileChon]);

  const soCotTren = 27;   // đúng số cột của lưới hóa đơn bên dưới
  const soCotDuoi = 11;   // đúng số cột của lưới dòng hàng

  const {
    oDangDung: oTren, setODangDung: datOTren,
    oDangSua: suaTren, setODangSua: datSuaTren,
    khungRef: refTren, xuLyPhim: phimTren,
  } = useDieuHuongLuoi({
    soDong: dsLoc.length, soCot: soCotTren,
    bat: mo && luoiDangCamPhim === "tren",
    onDoiDong: doiDongTren,
  });
  const {
    oDangDung: oDuoi, setODangDung: datODuoi,
    oDangSua: suaDuoi, setODangSua: datSuaDuoi,
    khungRef: refDuoi, xuLyPhim: phimDuoi,
  } = useDieuHuongLuoi({
    soDong: hdDangChon?.lines.length ?? 0, soCot: soCotDuoi,
    bat: mo && luoiDangCamPhim === "duoi",
  });


  type ViTri = { dong: number; cot: number };
  const themDieuHuong = <T,>(
    cot: Record<string, unknown>[],
    lay: () => { oDung: ViTri; oSua: ViTri | null; dangCam: boolean },
    datDung: (v: ViTri) => void, datSua: (v: ViTri | null) => void,
  ) => cot.map((c, i) => ({
    ...c,
    render: (v: unknown, ban: T, dong: number) => {
      const { oSua, dangCam } = lay();
      if (dangCam && oSua?.dong === dong && oSua?.cot === i) {
        return (
          <Input size="small" autoFocus defaultValue={v == null ? "" : String(v)}
                 onClick={(e) => e.stopPropagation()}
                 onDoubleClick={(e) => e.stopPropagation()}
                 onBlur={() => datSua(null)} />
        );
      }
      const renderCu = c.render as
        ((v: unknown, ban: T, dong: number) => React.ReactNode) | undefined;
      return renderCu ? renderCu(v, ban, dong) : (v as React.ReactNode);
    },
    onCell: (_: T, dong?: number) => {
      const d = dong ?? -1;
      const { oDung, oSua, dangCam } = lay();
      const dung = dangCam && oDung.dong === d && oDung.cot === i;
      const sua = dangCam && oSua?.dong === d && oSua?.cot === i;
      return {
        "data-dong": d,
        className: sua ? "o-dang-sua" : dung ? "o-dang-dung" : undefined,
        onClick: () => { if (d >= 0) datDung({ dong: d, cot: i }); },
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (d >= 0) datSua({ dong: d, cot: i });
        },
      } as React.HTMLAttributes<HTMLElement>;
    },
  }));

  const viTren = useMemo(
    () => ({ oDung: oTren, oSua: suaTren, dangCam: luoiDangCamPhim === "tren" }),
    [oTren, suaTren, luoiDangCamPhim]);
  const viDuoi = useMemo(
    () => ({ oDung: oDuoi, oSua: suaDuoi, dangCam: luoiDangCamPhim === "duoi" }),
    [oDuoi, suaDuoi, luoiDangCamPhim]);

  const chonVaDong = () => {
    if (fileChon) { onChon(fileChon); onDong(); }
  };

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);
  const optThang = [{ value: "all" as const, label: "Tất cả các tháng" },
                    ...cacThang.map((m) => ({ value: m, label: `Tháng ${m}` }))];

  const cotTren = useMemo(() => themDieuHuong<HoaDonThue>([
          { title: "STT", width: 48, fixed: "left",
            render: (_: unknown, __: HoaDonThue, i: number) => i + 1 },
          { title: "Mã HĐ", width: 150, fixed: "left", ellipsis: true,
            render: (_: unknown, r: HoaDonThue) =>
              <span title={r.maHd}>{r.maHd}</span> },
          { title: "Ngày", width: 74, render: (_: unknown, r: HoaDonThue) => ngayNgan(r.ngay) },
          { title: "Ngày NH", width: 74,
            render: (_: unknown, r: HoaDonThue) => ngayNgan(r.ngayNh ?? r.ngay) },
          { title: "Số HĐ", dataIndex: "soHd", width: 82 },
          { title: "Nhân sự", width: 330, ellipsis: true,
            render: (_: unknown, r: HoaDonThue) => {
              const t = `${r.tenKh ?? ""}_${r.mst ?? ""}`;
              return <span title={t}>{t}</span>;
            } },
          // Định khoản: dòng nào chưa hạch toán thì hiện giá trị quy ước như bản gốc
          { title: "Nợ", dataIndex: "ghiNo", width: 44, align: "center",
            render: (v: string | null) => v || "156" },
          { title: "Có", dataIndex: "ghiCo", width: 44, align: "center",
            render: (v: string | null) => v || "331" },
          { title: "% V.", width: 44, align: "center",
            render: (_: unknown, r: HoaDonThue) =>
              r.lines[0]?.ptVat != null ? String(r.lines[0].ptVat) : "" },
          { title: "V.Nợ", width: 50, align: "center", render: () => "1331" },
          { title: "V.Có", width: 46, align: "center", render: () => "331" },
          { title: "V.KT", width: 44, align: "center", render: () => "6" },
          { title: "Tiền HĐ", dataIndex: "tienHang", width: 130, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Tiền CK", dataIndex: "tienCk", width: 110, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Tiền VAT", dataIndex: "tienVat", width: 120, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Thương vụ", dataIndex: "maTv", width: 90 },
          { title: "Ghi chú", dataIndex: "ghiChu", width: 130, ellipsis: true },
          { title: "In", width: 40, align: "center",
            render: () => <Checkbox disabled /> },
          { title: "Tổng G.Vốn", dataIndex: "tongTien", width: 130, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Lỗ - Lãi", width: 90, align: "right", render: () => soVn(0) },
          { title: "CK Gốc", width: 80, align: "right", render: () => soVn(0) },
          { title: "Số HĐLQ", dataIndex: "sohdLienquan", width: 90 },
          { title: "Số HĐLCTC HĐ", dataIndex: "tichChatHdLienquan", width: 110 },
          { title: "Loại HĐ", dataIndex: "loaiHdLienquan", width: 80 },
          { title: "Mã Số HĐ", dataIndex: "mauSoHdLienquan", width: 90 },
          { title: "Ký hiệu HĐ", dataIndex: "khhd", width: 100 },
          { title: "Trạng thái", dataIndex: "tthaiHd", width: 100 },
          { title: "Ghi chú", dataIndex: "ghiChu", width: 120, ellipsis: true },
  ], () => viTren, datOTren, datSuaTren),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viTren]);

  const cotDuoi = useMemo(() => themDieuHuong<HoaDonLine>([
          { title: "STT", dataIndex: "sttLine", width: 48, fixed: "left" },
          { title: "Tên hàng hoá dịch vụ", dataIndex: "tenHang", width: 300,
            ellipsis: true,
            render: (v: string) => <span title={v}>{v}</span> },
          { title: "ĐVT", dataIndex: "dvt", width: 70 },
          { title: "Số lượng", dataIndex: "soLuong", width: 96, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Đơn giá", dataIndex: "donGia", width: 120, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Thành tiền", dataIndex: "thanhTien", width: 130, align: "right",
            render: (v: number) => <b>{soVn(v)}</b> },
          { title: "% VAT", dataIndex: "ptVat", width: 66, align: "center",
            render: (v: number) => String(v) },
          { title: "Nợ", dataIndex: "ghiNo", width: 50, align: "center",
            render: (v: string | null) => v || "156" },
          { title: "Có", dataIndex: "ghiCo", width: 50, align: "center",
            render: (v: string | null) => v || "331" },
          { title: "C.Khấu", dataIndex: "tienCk", width: 80, align: "right",
            render: (v: number) => soVn(v) },
          { title: "Ghi chú", dataIndex: "ghiChu", width: 200, ellipsis: true,
            render: (v: string | null, m: HoaDonLine) => {
              const t = v || m.tenHang;
              return <span title={t}>{t}</span>;
            } },
  ], () => viDuoi, datODuoi, datSuaDuoi),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viDuoi]);

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
          <NutCho nhan="Chuyển VAT Vào Gía trị" lop="nut-xanhdam" />
          <NutCho nhan="Chuyển Chi phí hoặc Thu nhập khác" lop="nut-hong" />
        </div>

        <div className="thanh-loc">
          <span className="nhan nhan-xanh">Tìm nhanh</span>
          <Input size="small" allowClear style={{ width: 420 }}
                 placeholder="Số HĐ, ký hiệu, MST, tên đối tác, tên file…"
                 value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dsLoc.length}/{dsHd.length} hóa đơn
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
        <div ref={refTren} className="khung-ban-phim" tabIndex={0}
             onKeyDown={phimTren}
             onMouseDown={() => setLuoiDangCamPhim("tren")}>
        <Table
          className="luoi-ds"
          rowKey="maHd"
          size="small"
          dataSource={dsLoc}
          pagination={false}
          scroll={{ x: 2100, y: 260 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                      description="Không có hóa đơn nào khớp điều kiện lọc" /> }}
          onRow={(r: HoaDonThue) => ({
            onClick: () => chonDong(r.maHd),
            onDoubleClick: () => { onChon(r.maHd); onDong(); },
            className: r.maHd === fileChon ? "dong-dang-chon" : undefined,
            style: { cursor: "pointer" },
          })}
          columns={cotTren}
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
              Chuyển sang GHI_CHU_G
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
            <Checkbox checked={cb.chuyenUnicode}
                      onChange={(e) => datCb("chuyenUnicode", e.target.checked)}>
              Chuyển tên hàng sang UNICODE
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
              <NutCho nhan="Sý HĐ TT-ĐC-XB" lop="nut-vang" />
            </div>
          </div>

          <div className="cot-cong-cu" style={{ marginLeft: "auto" }}>
            <NutCho nhan="Chuyển UNICODE cho File Excel" lop="nut-xanhla" />
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
                {hdDangChon.tenKh} ·{" "}
                <b>{hdDangChon.lines.length || hdDangChon.soDongHang}</b> dòng
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                — bấm một hóa đơn ở bảng trên để xem dòng hàng
              </Typography.Text>
            )}
          </div>
          <div className="khung-phu" ref={refDuoi} tabIndex={0}
               onKeyDown={phimDuoi}
               onMouseDown={() => setLuoiDangCamPhim("duoi")}>
            <Table
              className="luoi-ds"
              rowKey="sttLine" size="small" pagination={false}
              dataSource={hdDangChon?.lines ?? []}
              scroll={{ x: 1080, y: 150 }}
              locale={{ emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                       description={hdDangChon
                         ? "Hóa đơn này không có dòng hàng"
                         : "Chưa chọn hóa đơn"} />
              ) }}
              columns={cotDuoi}
              summary={(rows: readonly HoaDonLine[]) => {
                const sum = rows.reduce((s, x) => s + x.thanhTien, 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5} align="right">
                      <b>Σ thành tiền</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <b style={{
                        color: !hdDangChon
                          || Math.abs(hdDangChon.tienHang - sum) < 10
                            ? "#389e0d" : "#cf1322",
                      }}>
                        {soVn(sum)}
                      </b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} colSpan={5} />
                  </Table.Summary.Row>
                );
              }}
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
              <NutCho nhan="In P.Nhập kèm File PDF" lop="nut-xanhla" />
              <Checkbox checked={cb.chiInPDF}
                        onChange={(e) => datCb("chiInPDF", e.target.checked)}>
                Chỉ in PDF
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="In HĐ Bán lẻ từng số" lop="nut-vang" />
              <NutCho nhan="Tổng hợp hàng hóa theo % VAT" lop="nut-hong" />
              <Checkbox checked={cb.chiTrongBangKe}
                        onChange={(e) => datCb("chiTrongBangKe", e.target.checked)}>
                Chỉ in bảng kê khi in Phiếu nhập cùng PDF
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Lấy DM_HANG sang Excel (UNICODE)" lop="nut-xanhla" />
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

          {/* Cột SL File XML bên phải cùng */}
          <div className="cot-sl-xml" style={{ marginLeft: "auto" }}>
            <div>
              <div className="nhan-sl">SL File XML Vĩnh Hy</div>
              <div className="o-sl" />
            </div>
            <div>
              <div className="nhan-sl">SL File XML SeverNew</div>
              <div className="o-sl" />
            </div>
            <div>
              <div className="nhan-sl">SL File XML Only</div>
              <div className="o-sl" />
            </div>
            <div>
              <div className="nhan-sl">SL File PDF SeverNew</div>
              <div className="o-sl" />
            </div>
            <NutCho nhan="Lấy NKCT" lop="nut-tim" />
          </div>
        </div>

        <Space style={{ marginTop: 6 }} size={12}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Σ Tiền HĐ <b>{soVn(tongTienHang)}</b> · Σ VAT <b>{soVn(tongTienVat)}</b> ·
            Σ Thanh toán <b>{soVn(tongThanhToan)}</b>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Bấm đúp một dòng để mở hóa đơn đó. Các nút mờ là nghiệp vụ chưa nối backend.
          </Typography.Text>
        </Space>
      </div>
    </Modal>
  );
}
