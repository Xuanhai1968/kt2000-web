import { useEffect, useState } from "react";
import { Modal, Spin, Empty, Typography } from "antd";

interface Props {
  mo: boolean;
  onDong: () => void;
  nhan?: string;
  tai: () => Promise<string | null>;
}

// MỘT state cho cả ba trạng thái thay vì ba cờ rời: ba cờ luôn đẻ ra những tổ
// hợp vô nghĩa (đang tải mà đã có lỗi…) và mỗi lần đổi phải nhớ dọn hai cái kia.
// Ở đây đổi trạng thái là thay nguyên khối.
type TrangThai =
  | { loai: "trong" }
  | { loai: "dangTai" }
  | { loai: "xong"; html: string | null }   // null = không có bản gốc kèm theo
  | { loai: "loi"; thongBao: string };

export default function XemHtmlHoaDon({ mo, onDong, nhan, tai }: Props) {
  const [tt, setTt] = useState<TrangThai>({ loai: "trong" });

  // Tải lại mỗi lần mở. Giữ lượt bằng biến cục bộ: đóng/mở nhanh hai hóa đơn
  // khác nhau thì lượt cũ về sau không được ghi đè nội dung lượt mới.
  useEffect(() => {
    if (!mo) return;
    let conHieuLuc = true;
    // queueMicrotask: đặt state thẳng trong thân effect là ép React vẽ lại ngay
    // giữa lượt commit. Hoãn một nhịp vi mô cho lượt vẽ hiện tại xong đã.
    queueMicrotask(() => {
      if (!conHieuLuc) return;
      setTt({ loai: "dangTai" });
      tai()
        .then((s) => { if (conHieuLuc) setTt({ loai: "xong", html: s }); })
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

  return (
    <Modal
      title={<>Bản gốc hóa đơn{nhan ? <> — <b>{nhan}</b></> : null}</>}
      open={mo}
      onCancel={onDong}
      width="min(840px, 96vw)"
      style={{ top: 20 }}
      footer={null}
      styles={{ body: { height: "calc(100vh - 120px)", padding: 0, overflow: "hidden" } }}
    >
      {tt.loai === "dangTai" || tt.loai === "trong" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%" }}>
          <Spin tip="Đang tải bản gốc" />
        </div>
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
          // sandbox RỖNG = khóa hết: không script, không same-origin, không form.
          // Hóa đơn là tài liệu tĩnh để đọc, và đây là HTML do cổng TCT sinh —
          // nội dung ngoài, không cho nó chạy gì chung nguồn với ứng dụng.
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
