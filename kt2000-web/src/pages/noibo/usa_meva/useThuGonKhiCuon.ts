// THU GỌN KHỐI ĐẦU KHI CUỘN (điện thoại) — bê từ USA_Meva (hooks/useCollapseOnScroll.ts).
//
// Trên điện thoại, khối thông tin chung (số đơn, ngày, khách, NVKD...) ăn gần hết màn,
// lưới hàng chỉ còn hở vài dòng. Cuộn xuống để gõ hàng thì tự thu khối đó lại, cuộn
// ngược lên đầu thì mở ra. Máy tính bàn KHÔNG áp dụng — màn rộng, thu vào chỉ gây giật.
//
// Khác bản gốc một chỗ: bản gốc bám window scroll là chính. Trong kt2000, AppShell đặt
// Layout height:100vh + overflow:hidden nên CẢ TRANG KHÔNG BAO GIỜ TRÔI — khung cuộn thật
// là Layout.Content (hoặc .pxn__luoi-body). Vì vậy phải dò lên cha để tìm đúng khung
// cuộn; bám window sẽ không nhận được sự kiện nào cả.

import { useCallback, useEffect, useRef, useState } from "react";

export function useThuGonKhiCuon(tuyChon?: { nguong?: number; manToiDa?: number }) {
  const nguong = tuyChon?.nguong ?? 80;
  const manToiDa = tuyChon?.manToiDa ?? 768;

  const [thuGon, setThuGon] = useState(false);
  const mocRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const laDienThoai = () => window.matchMedia(`(max-width: ${manToiDa}px)`).matches;

    // Xoay ngang / kéo rộng cửa sổ ra khỏi ngưỡng điện thoại thì mở lại ngay,
    // không để khối đầu kẹt ở trạng thái thu gọn trên màn rộng.
    const khiDoiCo = () => { if (!laDienThoai()) setThuGon(false); };

    const timKhungCuon = (el: HTMLElement | null): HTMLElement | Window => {
      let nut = el?.parentElement ?? null;
      while (nut) {
        const st = getComputedStyle(nut);
        if (/(auto|scroll)/.test(st.overflowY) && nut.scrollHeight > nut.clientHeight) return nut;
        nut = nut.parentElement;
      }
      return window;
    };

    const khung = timKhungCuon(mocRef.current);
    const viTri = () => khung === window
      ? (window.scrollY || document.documentElement.scrollTop)
      : (khung as HTMLElement).scrollTop;

    let truoc = viTri();
    const khiCuon = () => {
      if (!laDienThoai()) return;
      const y = viTri();
      const xuong = y > truoc;
      truoc = y;
      // Thu khi đã cuộn qua ngưỡng; chỉ mở lại khi về sát đỉnh, để nó không rung
      // liên tục lúc người dùng đẩy qua đẩy lại quanh mốc.
      if (xuong && y > nguong) setThuGon(true);
      else if (!xuong && y <= nguong) setThuGon(false);
    };

    khung.addEventListener("scroll", khiCuon, { passive: true });
    window.addEventListener("resize", khiDoiCo);
    return () => {
      khung.removeEventListener("scroll", khiCuon);
      window.removeEventListener("resize", khiDoiCo);
    };
  }, [nguong, manToiDa]);

  // Bấm thẳng vào tiêu đề để đóng/mở bằng tay
  const bat = useCallback(() => setThuGon((t) => !t), []);

  // Cho form tự thu gọn theo lý do khác (vd lưới đã dài quá, cần chỗ cho dòng hàng).
  // Trả ra thay vì nhét luật đó vào hook: hook này chỉ biết chuyện CUỘN, không biết
  // lưới có bao nhiêu dòng — đó là việc của form.
  return { thuGon, bat, datThuGon: setThuGon, mocRef };
}
