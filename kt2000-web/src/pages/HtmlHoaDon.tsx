import { useEffect, useState } from "react";
import { Modal, Empty, Typography } from "antd";
import "./html-hoa-don.css";
import DangTai from "../components/DangTai";

interface Props {
  mo: boolean;
  onDong: () => void;
  nhan?: string;
  tai: () => Promise<{ html: string | null; duongDan?: string | null }>;
}

type TrangThai =
  | { loai: "trong" }
  | { loai: "dangTai" }
  | { loai: "xong"; html: string | null; duongDan?: string | null }
  | { loai: "loi"; thongBao: string };

export default function HtmlHoaDon({ mo, onDong, nhan, tai }: Props) {
  const [tt, setTt] = useState<TrangThai>({ loai: "trong" });

  useEffect(() => {
    if (!mo) return;
    let conHieuLuc = true;
    queueMicrotask(() => {
      if (!conHieuLuc) return;
      setTt({ loai: "dangTai" });
      tai()
        .then((r) => {
          if (conHieuLuc)
            setTt({ loai: "xong", html: r.html, duongDan: r.duongDan });
        })
        .catch((e: unknown) => {
          if (!conHieuLuc) return;
          setTt({ loai: "loi",
                  thongBao: e instanceof Error ? e.message
                                               : "Không mở được bản HTML" });
        });
    });
    return () => { conHieuLuc = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo]);

  const html = tt.loai === "xong" ? tt.html : null;
  const duongDan = tt.loai === "xong" ? tt.duongDan : null;

  return (
    <Modal
      title={
        <div className="xhd-tieude">
          <div>Bản gốc hóa đơn{nhan ? <> — <b>{nhan}</b></> : null}</div>
          {duongDan && (
            <div className="xhd-duongdan" title={duongDan}>{duongDan}</div>
          )}
        </div>
      }
      open={mo}
      onCancel={onDong}
      width="min(840px, 96vw)"
      style={{ top: 20, marginRight: 8, marginLeft: "auto", paddingBottom: 0 }}
      footer={null}
      styles={{ body: { height: "calc(100vh - 120px)", padding: 0, overflow: "hidden" } }}
    >
      {tt.loai === "dangTai" || tt.loai === "trong" ? (
        <DangTai loi="Đang tải bản gốc" dayKhung co="default" />
      ) : tt.loai === "loi" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                 description={<Typography.Text type="danger">{tt.thongBao}</Typography.Text>} />
        </div>
      ) : html ? (
        <iframe
          srcDoc={html}
          title="Bản gốc hóa đơn"
          sandbox=""
          style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                 description="Hóa đơn này không có bản HTML kèm theo" />
        </div>
      )}
    </Modal>
  );
}
