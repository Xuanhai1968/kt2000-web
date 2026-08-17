import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Checkbox, Alert, Typography, message, Input } from "antd";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import {
  layTonKho, layTonKhoChiTiet, loiApi,
  type TonKhoTongHopRow, type TonKhoChiTietRow,
} from "../api";
import {
  themeVfp, luoiVfpProps, colVfp, dinhDangTien, dinhDang4SoLe, nhoDoRongCot,
} from "../theme/luoiVfp";
import "./bao-cao-ton-kho.css";

// ===================== BÁO CÁO TỒN KHO — FRM_TON_KHO =====================
//
// Dựng lại form tồn kho của KT2000 VFP: lưới tổng hợp ở trên (gộp nhóm theo TK kho),
// lưới phát sinh chi tiết ở dưới khi bấm vào một mặt hàng.
//
// BR-BC-09 — server trả DỮ LIỆU SẠCH: mỗi dòng là một cặp (TK kho × mặt hàng), không
// dòng tiêu đề nhóm, không dòng cộng. Nhóm "156" và các dòng cộng bên dưới do AG Grid
// tự dựng bằng row grouping + aggregation. Bản VFP trộn dòng dữ liệu với dòng trình bày
// trong cùng một cursor, nên sắp xếp lại là vỡ bố cục.
//
// BR-BC-01 — màn hình này KHÔNG BAO GIỜ tự ghi. Mọi hành động sửa (dời ngày, đánh dấu
// phải sửa, tính lại giá) thuộc module khác; ở đây chỉ gọi sang rồi nạp lại.
//
// ---------------------------------------------------------------------------------
// VÌ SAO SỐ HIỆN RA CHƯA ĐÚNG (trạng thái 17/08/2026) — đọc trước khi báo lỗi:
//   • gia_von trống sạch trên toàn bộ dữ liệu → mọi cột GIÁ TRỊ bằng 0. Sẽ đúng khi
//     engine giá thành chạy.
//   • ma_hang mới chỉ có 'H0' (mã tạm) hoặc rỗng → cả báo cáo gom về một dòng. Sẽ tách
//     ra khi chức năng định khoản gán mã hàng thật.
//   • TON_KHO thang=0 chưa có dòng nào → tồn đầu năm bằng 0, nên tồn đầu kỳ có thể ÂM.
// Chốt Trường 17/08: dựng form + logic trước, kiểm đúng/sai sau khi có định khoản.
// ---------------------------------------------------------------------------------

const THANG_HIEN_TAI = new Date().getMonth() + 1;

const optThang = [
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` })),
  { value: 13, label: "Cả năm" },
];

// Dòng của lưới trên: hoặc là một mặt hàng thật, hoặc là dòng CỘNG do frontend chèn.
// Cờ laDongCong dùng để tô đậm và để chặn mở chi tiết khi bấm vào.
type DongLuoi = TonKhoTongHopRow & { laDongCong?: boolean };

// Khuôn dòng cộng rỗng — mọi cột số bắt đầu từ 0 rồi cộng dồn.
const RONG: DongLuoi = {
  maTk: "", maHang: "", tenHang: null, maNh: null, tenNh: null, maNgan: null,
  quyCach: null, slTd: 0, gtTd: 0, slNo: 0, gtNo: 0, slCo: 0, gtCo: 0,
  slTc: 0, gtTc: 0, giaNhap: 0, loLai: 0, phaiSua: false, ngayPs: null,
};

// Ngày dd/MM/yy như lưới VFP. Backend trả ISO nên cắt phần ngày trước khi tách.
function ngayNgan(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : "";
}

export default function BaoCaoTonKho() {
  const [thang, setThang] = useState<number>(THANG_HIEN_TAI);
  const [loLai, setLoLai] = useState(true);
  const [rows, setRows] = useState<TonKhoTongHopRow[]>([]);
  const [canTinhLaiGia, setCanTinhLaiGia] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [daNap, setDaNap] = useState(false);

  const [hangChon, setHangChon] = useState<string | null>(null);
  const [chiTiet, setChiTiet] = useState<TonKhoChiTietRow[]>([]);
  const [dangTaiCt, setDangTaiCt] = useState(false);

  const [tuKhoa, setTuKhoa] = useState("");
  // Lọc "hàng bán lỗ/lãi ≥ ngưỡng" — đúng nút 50.000 của VFP. Client-side hoàn toàn,
  // không round-trip: dữ liệu đã nằm sẵn trong trình duyệt (spec mục 5.4).
  const [nguongLoLai, setNguongLoLai] = useState<number | null>(null);

  const capNhat = async () => {
    setDangTai(true);
    try {
      const r = await layTonKho(thang, loLai);
      setRows(r.data.rows);
      setCanTinhLaiGia(r.data.canTinhLaiGia);
      setDaNap(true);
      // Đổi kỳ thì phát sinh của mặt hàng đang mở cũng thuộc kỳ khác — dọn đi, thà
      // trống còn hơn để số của tháng trước nằm dưới tên kỳ mới.
      setHangChon(null);
      setChiTiet([]);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được báo cáo tồn kho"));
    } finally {
      setDangTai(false);
    }
  };

  const xemChiTiet = async (maHang: string) => {
    setHangChon(maHang);
    setDangTaiCt(true);
    try {
      const r = await layTonKhoChiTiet(maHang, thang);
      setChiTiet(r.data);
    } catch (e) {
      setChiTiet([]);
      message.error(loiApi(e, "Không đọc được phát sinh của mặt hàng"));
    } finally {
      setDangTaiCt(false);
    }
  };

  // Giữ hàm qua ref và gán trong useEffect — cùng khuôn với DanhSachHoaDon.hamRef.
  // Gán thẳng trong thân render là "đọc/ghi ref lúc render", ESLint react-hooks/refs bắt.
  const hamRef = useRef({ xemChiTiet });
  useEffect(() => { hamRef.current = { xemChiTiet }; });

  const dsLoc = useMemo(() => {
    const k = tuKhoa.trim().toLowerCase();
    return rows.filter((x) => {
      if (nguongLoLai != null && Math.abs(x.loLai) < nguongLoLai) return false;
      if (!k) return true;
      return [x.maHang, x.tenHang, x.maNgan, x.maTk]
        .some((v) => (v ?? "").toLowerCase().includes(k));
    });
  }, [rows, tuKhoa, nguongLoLai]);

  // Dòng CỘNG theo từng TK kho, tự dựng ở đây.
  //
  // Spec gợi ý dùng row grouping + aggregation của grid, nhưng repo chỉ có AG Grid
  // COMMUNITY — rowGroup/aggFunc/grandTotalRow/autoGroupColumnDef đều thuộc bản
  // ENTERPRISE. Khai chúng với bản community thì grid lặng lẽ bỏ qua, và cột đặt
  // hide:true để nhường chỗ cho cột nhóm sẽ biến mất luôn.
  // Vẫn đúng BR-BC-09: server trả dữ liệu sạch, phần trình bày do frontend dựng —
  // spec chỉ định "grid tự render", không bắt buộc phải là tính năng của AG Grid.
  const dsHienThi = useMemo(() => {
    const ra: DongLuoi[] = [];
    let tkTruoc: string | null = null;
    let cong: DongLuoi | null = null;

    const chot = () => { if (cong) ra.push(cong); cong = null; };

    for (const x of dsLoc) {
      if (x.maTk !== tkTruoc) {
        chot();
        tkTruoc = x.maTk;
        cong = { ...RONG, maTk: x.maTk, maHang: `Cộng ${x.maTk}`, laDongCong: true };
      }
      ra.push(x);
      if (cong) {
        cong.slTd += x.slTd; cong.gtTd += x.gtTd;
        cong.slNo += x.slNo; cong.gtNo += x.gtNo;
        cong.slCo += x.slCo; cong.gtCo += x.gtCo;
        cong.slTc += x.slTc; cong.gtTc += x.gtTc;
        cong.loLai += x.loLai;
      }
    }
    chot();
    return ra;
  }, [dsLoc]);

  // Dòng TỔNG TẤT CẢ ghim đáy lưới — pinnedBottomRowData có ở bản community.
  const dongTong = useMemo<DongLuoi[]>(() => {
    if (dsLoc.length === 0) return [];
    const t: DongLuoi = { ...RONG, maHang: "TỔNG CỘNG", laDongCong: true };
    for (const x of dsLoc) {
      t.slTd += x.slTd; t.gtTd += x.gtTd;
      t.slNo += x.slNo; t.gtNo += x.gtNo;
      t.slCo += x.slCo; t.gtCo += x.gtCo;
      t.slTc += x.slTc; t.gtTc += x.gtTc;
      t.loLai += x.loLai;
    }
    return [t];
  }, [dsLoc]);

  // Cột SỐ LƯỢNG dùng 4 số lẻ, cột TIỀN dùng 2 — cùng quy ước với màn hóa đơn.
  const soLuong = (p: { value: unknown }) => dinhDang4SoLe(Number(p.value ?? 0));
  const tien = (p: { value: unknown }) => dinhDangTien(Number(p.value ?? 0));

  const cotTong = useMemo<(ColDef<DongLuoi> | ColGroupDef<DongLuoi>)[]>(() => [
    // KHÔNG dùng rowGroup: đó là tính năng Enterprise (xem ghi chú ở dsHienThi).
    // Dữ liệu đã sắp theo TK từ server, cộng theo nhóm do frontend chèn.
    { colId: "maTk", headerName: "TK kho", field: "maTk", width: 90, pinned: "left" },
    { colId: "maHang", headerName: "Mã hàng", field: "maHang", width: 130, pinned: "left" },
    { colId: "tenHang", headerName: "Tên hàng", field: "tenHang", width: 260,
      tooltipField: "tenHang" },
    { colId: "maNgan", headerName: "Mã ngắn", field: "maNgan", width: 90 },
    { colId: "quyCach", headerName: "Quy cách", field: "quyCach", width: 110 },
    {
      headerName: "Tồn đầu",
      children: [
        { colId: "slTd", headerName: "SL", field: "slTd", width: 110,
          type: "numericColumn", valueFormatter: soLuong },
        { colId: "gtTd", headerName: "Giá trị", field: "gtTd", width: 130,
          type: "numericColumn", valueFormatter: tien },
      ],
    },
    {
      headerName: "Nhập trong kỳ",
      children: [
        { colId: "slNo", headerName: "SL", field: "slNo", width: 110,
          type: "numericColumn", valueFormatter: soLuong },
        { colId: "gtNo", headerName: "Giá trị", field: "gtNo", width: 130,
          type: "numericColumn", valueFormatter: tien },
      ],
    },
    {
      headerName: "Xuất trong kỳ",
      children: [
        { colId: "slCo", headerName: "SL", field: "slCo", width: 110,
          type: "numericColumn", valueFormatter: soLuong },
        { colId: "gtCo", headerName: "Giá trị", field: "gtCo", width: 130,
          type: "numericColumn", valueFormatter: tien },
      ],
    },
    {
      headerName: "Tồn cuối",
      children: [
        // Tồn cuối ÂM là dấu hiệu phải xử lý (xuất nhiều hơn nhập) — tô đỏ để khỏi phải
        // dò bằng mắt qua hàng trăm dòng.
        { colId: "slTc", headerName: "SL", field: "slTc", width: 110,
          type: "numericColumn", valueFormatter: soLuong,
          cellStyle: (p) => ({ color: Number(p.value ?? 0) < 0 ? "#cf1322" : "inherit",
                               fontWeight: Number(p.value ?? 0) < 0 ? 600 : 400 }) },
        { colId: "gtTc", headerName: "Giá trị", field: "gtTc", width: 130,
          type: "numericColumn", valueFormatter: tien },
      ],
    },
    { colId: "giaNhap", headerName: "Giá nhập", field: "giaNhap", width: 120,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(Number(p.value ?? 0)),
      headerTooltip: "Đơn giá dòng nhập mua gần nhất trong kỳ; không nhập thì suy từ tồn đầu" },
    { colId: "loLai", headerName: "Lỗ / Lãi", field: "loLai", width: 130,
      type: "numericColumn", valueFormatter: tien,
      headerTooltip: "Σ (đơn giá − giá vốn) × SL trên dòng xuất bán. "
                   + "Giá vốn còn trống thì con số này bằng doanh thu, chưa phải lãi thật.",
      cellStyle: (p) => ({ color: Number(p.value ?? 0) < 0 ? "#cf1322" : "inherit" }) },
    { colId: "ngayPs", headerName: "Ngày nhập cuối", width: 120,
      valueGetter: (p) => ngayNgan(p.data?.ngayPs ?? null),
      headerTooltip: "Chỉ hiện với mặt hàng CÓ nhập mà KHÔNG bán trong kỳ" },
  ], []);

  const cotChiTiet = useMemo<ColDef<TonKhoChiTietRow>[]>(() => [
    { colId: "ngayNh", headerName: "Ngày NH", width: 92,
      valueGetter: (p) => ngayNgan(p.data?.ngayNh ?? null) },
    { colId: "soHd", headerName: "Số HĐ", field: "soHd", width: 120 },
    { colId: "tenKh", headerName: "Đối tác", field: "tenKh", width: 280,
      tooltipField: "tenKh" },
    { colId: "ghiNo", headerName: "Nợ", field: "ghiNo", width: 60 },
    { colId: "ghiCo", headerName: "Có", field: "ghiCo", width: 60 },
    { colId: "slNo", headerName: "SL nhập", field: "slNo", width: 100,
      type: "numericColumn", valueFormatter: soLuong },
    { colId: "gtNo", headerName: "GT nhập", field: "gtNo", width: 120,
      type: "numericColumn", valueFormatter: tien },
    { colId: "slCo", headerName: "SL xuất", field: "slCo", width: 100,
      type: "numericColumn", valueFormatter: soLuong },
    { colId: "gtCo", headerName: "GT xuất", field: "gtCo", width: 120,
      type: "numericColumn", valueFormatter: tien },
    { colId: "donGia", headerName: "Đơn giá", field: "donGia", width: 120,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(Number(p.value ?? 0)) },
    { colId: "giaVon", headerName: "Giá vốn", field: "giaVon", width: 120,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(Number(p.value ?? 0)) },
    { colId: "dvt", headerName: "ĐVT", field: "dvt", width: 70 },
    { colId: "maHd", headerName: "Mã HĐ", field: "maHd", width: 220, tooltipField: "maHd" },
    { colId: "ghiChu", headerName: "Ghi chú", field: "ghiChu", width: 200,
      tooltipField: "ghiChu" },
  ], []);

  const moiGiaTriBang0 = daNap && rows.length > 0
    && rows.every((x) => x.gtNo === 0 && x.gtCo === 0 && x.gtTd === 0);

  return (
    <div className="bc-ton-kho">
      <div className="thanh-loc">
        <span className="nhan">Kỳ</span>
        <Select size="small" style={{ width: 130 }} value={thang}
                onChange={(v) => setThang(v)} options={optThang} />
        <Checkbox checked={loLai} onChange={(e) => setLoLai(e.target.checked)}>
          Tính lỗ/lãi
        </Checkbox>
        <Button size="small" type="primary" loading={dangTai} onClick={capNhat}>
          Cập nhật
        </Button>

        <span className="nhan nhan-xanh">Tìm</span>
        <Input.Search size="small" allowClear style={{ width: 260 }}
               placeholder="Mã hàng, tên hàng, mã ngắn"
               value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)} />

        {/* Đúng nút 50.000 của VFP — lọc trên dữ liệu đã tải, không gọi lại server */}
        <Checkbox checked={nguongLoLai != null}
                  onChange={(e) => setNguongLoLai(e.target.checked ? 50000 : null)}>
          Chỉ lỗ/lãi ≥ 50.000
        </Checkbox>

        <span className="dem">
          {daNap ? `${dsLoc.length}/${rows.length} dòng` : "chưa nạp"}
        </span>
      </div>

      {/* BR-BC-11 — banner khi sổ đã đổi mà giá vốn chưa tính lại. Chưa có chỗ lưu cờ nên
          hiện chưa bao giờ bật; giữ sẵn để engine giá thành nối vào. */}
      {canTinhLaiGia && (
        <Alert type="warning" showIcon banner
               message="Dữ liệu giá vốn đã thay đổi — cần tính lại giá rồi nạp lại báo cáo" />
      )}

      {moiGiaTriBang0 && (
        <Alert
          type="info" showIcon banner
          message="Mọi cột GIÁ TRỊ đang bằng 0 vì sổ chưa có giá vốn"
          description={"Số lượng đã đúng theo chứng từ. Phần giá trị sẽ có sau khi chức "
                     + "năng định khoản gán mã hàng và engine giá thành tính giá vốn."}
        />
      )}

      <div className="luoi-tren">
        <AgGridReact<DongLuoi>
          theme={themeVfp}
          {...luoiVfpProps}
          rowData={dsHienThi}
          defaultColDef={colVfp}
          columnDefs={cotTong}
          {...nhoDoRongCot("ton_kho")}
          // Dòng TỔNG CỘNG ghim đáy — pinnedBottomRowData có ở bản community,
          // khác grandTotalRow (Enterprise).
          pinnedBottomRowData={dongTong}
          getRowStyle={(p) => (p.data?.laDongCong
            ? { fontWeight: 700, background: "#f0f5ff" } : undefined)}
          overlayNoRowsTemplate={daNap
            ? "Không có mặt hàng nào trong kỳ này"
            : "Chọn kỳ rồi bấm Cập nhật"}
          loading={dangTai}
          onRowClicked={(e) => {
            // Bấm vào dòng CỘNG thì không có mặt hàng nào để xem phát sinh.
            if (e.data && !e.data.laDongCong)
              void hamRef.current.xemChiTiet(e.data.maHang);
          }}
        />
      </div>

      <div className="thanh-ct">
        {hangChon == null
          ? "Bấm một mặt hàng ở bảng trên để xem phát sinh"
          : <>Phát sinh — <b>{hangChon || "(chưa có mã hàng)"}</b>
              {" · "}{chiTiet.length} dòng</>}
      </div>

      <div className="luoi-duoi">
        <AgGridReact<TonKhoChiTietRow>
          theme={themeVfp}
          {...luoiVfpProps}
          rowData={chiTiet}
          defaultColDef={colVfp}
          columnDefs={cotChiTiet}
          {...nhoDoRongCot("ton_kho_ct")}
          overlayNoRowsTemplate="Chưa chọn mặt hàng"
          loading={dangTaiCt}
        />
      </div>

      <Typography.Paragraph type="secondary" className="chu-thich">
        Kỳ tính theo <b>ngày nhập hàng</b> của hóa đơn, không theo ngày hóa đơn. Chuyển động
        kho phân loại theo tài khoản ghi Nợ/Có của từng dòng, không theo tài khoản đăng ký
        trong danh mục hàng.
      </Typography.Paragraph>
    </div>
  );
}
