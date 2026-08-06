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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem("kt2000_session");
    return raw ? (JSON.parse(raw) as Session) : null;
  });

  const signIn = (s: Session) => {
    localStorage.setItem("kt2000_token", s.accessToken);      // thay KT2000.INI
    localStorage.setItem("kt2000_session", JSON.stringify(s));
    setSession(s);
  };

  const signOut = () => {
    localStorage.removeItem("kt2000_token");
    localStorage.removeItem("kt2000_session");
    setSession(null);
  };

  const xongDoiMatKhau = () => {
    setSession((cu) => {
      if (!cu) return cu;
      const moi = { ...cu, user: { ...cu.user, mustChangePassword: false } };
      localStorage.setItem("kt2000_session", JSON.stringify(moi));
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