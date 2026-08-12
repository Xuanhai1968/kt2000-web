import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

// Thay cho 26 bien PUBLIC trong VFP — moi thu ve phien lam viec nam o day
export interface Session {
  accessToken: string;
  user: {
    id: string; loginName: string; realName: string; isAdmin: boolean;
    mustChangePassword?: boolean;   // QT-01: bắt đổi ngay sau lần đăng nhập đầu
  };
  tenant: { id: string; code: string; name: string; tenantType: string; dbName: string };
  branches: { code: string; name: string; dbName: string }[];
  fiscalYear: number;
}

interface AuthCtx {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
  // QT-01: gọi sau khi đổi mật khẩu xong để hạ cờ bắt buộc. Phải ghi lại localStorage,
  // không thì F5 một cái là modal hiện lại dù người dùng đã đổi rồi.
  xongDoiMatKhau: () => void;
}

const Ctx = createContext<AuthCtx>({
  session: null, signIn: () => {}, signOut: () => {}, xongDoiMatKhau: () => {},
});

// sessionStorage chứ KHÔNG phải localStorage (chốt Trường 12/08). localStorage dùng
// CHUNG cho mọi tab/cửa sổ của cùng trình duyệt: mở tab thứ hai đăng nhập đơn vị khác
// là ghi đè phiên của tab đầu, F5 một cái là tab đầu nhảy sang đơn vị mới — kế toán
// đang nhập cho đơn vị A bỗng thấy số của đơn vị B. sessionStorage tách theo TAB và
// vẫn sống qua F5.
//
// Đánh đổi: mở tab mới phải đăng nhập lại. Đó đúng là cái giá của việc xem hai đơn vị
// song song mà không lẫn nhau.
//
// Chỉ chuyển HAI khóa phiên. Bề rộng cột, ô tích "Cả vào và ra", nháp phiếu vẫn ở
// localStorage — đó là thói quen của MÁY, dùng chung giữa các tab mới đúng.
const KHO = sessionStorage;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = KHO.getItem("kt2000_session");
    return raw ? (JSON.parse(raw) as Session) : null;
  });

  const signIn = (s: Session) => {
    KHO.setItem("kt2000_token", s.accessToken);      // thay KT2000.INI
    KHO.setItem("kt2000_session", JSON.stringify(s));
    setSession(s);
  };

  const signOut = () => {
    KHO.removeItem("kt2000_token");
    KHO.removeItem("kt2000_session");
    setSession(null);
  };

  const xongDoiMatKhau = () => {
    setSession((cu) => {
      if (!cu) return cu;
      const moi = { ...cu, user: { ...cu.user, mustChangePassword: false } };
      KHO.setItem("kt2000_session", JSON.stringify(moi));
      return moi;
    });
  };

  return (
    <Ctx.Provider value={{ session, signIn, signOut, xongDoiMatKhau }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);