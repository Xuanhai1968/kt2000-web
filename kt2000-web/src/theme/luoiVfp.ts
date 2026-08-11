import {
  ModuleRegistry, AllCommunityModule, themeBalham,
  type ColDef, type GridOptions, type GridReadyEvent, type ColumnResizedEvent,
} from "ag-grid-community";

// AG Grid v33 trở lên KHÔNG tự đăng ký module nữa — thiếu dòng này thì lưới dựng ra
// trắng trơn mà không báo lỗi gì. Đăng ký ở đây, chỗ nào import cũng có, khỏi rải rác.
ModuleRegistry.registerModules([AllCommunityModule]);

// Balham là chủ đề dày đặc nhất trong bộ có sẵn — gần lưới VFP hơn Quartz.
// Từ v33 dùng Theming API, không import file CSS nào cả.
export const themeVfp = themeBalham.withParams({
  fontSize: 12,
  headerFontSize: 12,
  rowVerticalPaddingScale: 0.5,   // dồn dòng sát lại
  cellHorizontalPadding: 6,
  headerVerticalPaddingScale: 0.6,
});

export const CHIEU_CAO_DONG = 22;
export const CHIEU_CAO_HEADER = 26;

// Hành vi bàn phím kiểu GRID của VFP. Ba dòng đầu là phần cốt lõi: thiếu chúng thì
// lưới chạy kiểu web — Enter không xuống dòng, phải bấm hai lần mới sửa được ô.
export const luoiVfpProps = {
  singleClickEdit: true,              // bấm một cái vào ô là sửa
  enterNavigatesVertically: true,     // Enter nhảy XUỐNG dòng, không sang phải
  enterNavigatesVerticallyAfterEdit: true,
  stopEditingWhenCellsLoseFocus: true,
  rowHeight: CHIEU_CAO_DONG,
  headerHeight: CHIEU_CAO_HEADER,
  animateRows: false,                 // lưới nhập liệu, hoạt hình chỉ làm chậm mắt
} satisfies Partial<GridOptions>;

// Ô CHỈ ĐỌC phải nhìn ra ngay là chỉ đọc. Trong lưới mọi ô trông giống nhau; không
// phân biệt thì người dùng gõ vào cột tự tính rồi thắc mắc sao không ăn — đúng quy
// ước nền xám mà chính VFP vẫn dùng. Dùng cellStyle thay class để khỏi đẻ thêm file CSS.
const NEN_CHI_DOC = { backgroundColor: "#f5f5f5" };

export const colVfp = {
  resizable: true,
  sortable: false,      // thứ tự dòng phải khớp file gốc, xáo lên là mất dấu
  filter: false,
  suppressMovable: true,
  editable: false,
  cellStyle: NEN_CHI_DOC,
} satisfies ColDef;

// Cột cho SỬA: bỏ nền xám, bật editable
export const colSua = { ...colVfp, editable: true, cellStyle: undefined } satisfies ColDef;

// Cột SỐ: canh phải, và phải có valueParser — không thì AG Grid trả về CHUỖI và mọi
// phép tính phía sau âm thầm ra NaN.
export const colSo = {
  ...colSua,
  type: "numericColumn",
  valueParser: (p) => {
    const v = Number(String(p.newValue ?? "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  },
} satisfies ColDef;

export const dinhDangTien = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

// Nhớ bề rộng cột theo MÁY, cùng cách với checkbox "Cả vào và ra" (NT-06 Q2).
// Trả về hai handler để rải thẳng vào <AgGridReact {...nhoDoRongCot("ten")} />.
//
// LƯU Ý người dùng sau: bề rộng chỉ giữ được nếu columnDefs được useMemo. Truyền
// mảng cột dựng mới mỗi lần render thì AG Grid coi là bộ cột KHÁC và đặt lại bề
// rộng — triệu chứng là "bấm vào ô để sửa cũng làm cột nhảy về như cũ".
export function nhoDoRongCot(ten: string) {
  const khoa = `kt2000_cot_${ten}`;
  return {
    onGridReady: (e: GridReadyEvent) => {
      try {
        const luu = localStorage.getItem(khoa);
        if (!luu) return;
        const rong = JSON.parse(luu) as Record<string, number>;
        e.api.applyColumnState({
          state: Object.entries(rong).map(([colId, width]) => ({ colId, width })),
        });
      } catch {
        // Dữ liệu lưu hỏng thì dùng bề rộng mặc định — không đáng để chặn cả lưới
      }
    },
    onColumnResized: (e: ColumnResizedEvent) => {
      // Chỉ ghi khi người dùng thả chuột; kéo một cái bắn ra hàng chục sự kiện
      if (!e.finished || e.source === "api") return;
      const rong: Record<string, number> = {};
      for (const c of e.api.getColumnState())
        if (c.colId && c.width) rong[c.colId] = c.width;
      try { localStorage.setItem(khoa, JSON.stringify(rong)); } catch { /* hết chỗ */ }
    },
  };
}
