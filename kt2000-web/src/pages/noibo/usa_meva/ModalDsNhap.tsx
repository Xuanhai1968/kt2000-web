// MODAL DANH SÁCH NHÁP CÓ TÊN — bê từ USA_Meva (components/DraftListModal.tsx).
//
// Dùng antd sẵn có của kt2000 (Modal/List/Checkbox/Popconfirm), không kéo theo bộ icon
// riêng và file CSS riêng như bản gốc — bốn dòng style ít ỏi đặt thẳng tại chỗ.
//
// Xóa theo LÔ có tích chọn (không phải nút xóa từng dòng): gác nháp cả buổi thì cuối
// ngày dọn một lượt, bấm xóa từng cái mười lần là cực hình.

import { useMemo, useState } from "react";
import { Modal, List, Button, Checkbox, Empty, Popconfirm, Typography } from "antd";
import { FolderOpenOutlined, DeleteOutlined } from "@ant-design/icons";
import type { HuongDon } from "../../../api";
import { docDsNhap, xoaNhapTheoId, type NhapCoTen } from "./nhapCoTen";

const gioPhut = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function ModalDsNhap<T>({ mo, huong, onDong, onMoNhap }: {
  mo: boolean;
  huong: HuongDon;
  onDong: () => void;
  onMoNhap: (duLieu: T) => void;
}) {
  const [chon, setChon] = useState<Set<string>>(new Set());
  // localStorage không báo thay đổi cho React. Sau khi xóa phải tự bảo useMemo đọc lại,
  // nếu không danh sách vẫn hiện bản vừa xóa cho tới lúc đóng/mở modal.
  const [lanDoc, setLanDoc] = useState(0);
  const ds = useMemo(
    () => (mo ? docDsNhap<T>(huong) : []),
    // lanDoc là khóa ép đọc lại (eslint không thấy nó được dùng trong thân hàm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mo, huong, lanDoc],
  );

  const bat = (id: string) => {
    setChon((s) => {
      const k = new Set(s);
      if (k.has(id)) k.delete(id); else k.add(id);
      return k;
    });
  };

  const dong = () => { setChon(new Set()); onDong(); };

  const xoaDaChon = () => {
    xoaNhapTheoId<T>(huong, [...chon]);
    setChon(new Set());
    setLanDoc((n) => n + 1);
  };

  return (
    <Modal
      open={mo}
      onCancel={dong}
      title="Bản nháp đã lưu"
      width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Popconfirm
            title={`Xóa ${chon.size} bản nháp đã chọn?`}
            okText="Xóa" cancelText="Thôi"
            okButtonProps={{ danger: true }}
            disabled={chon.size === 0}
            onConfirm={xoaDaChon}
          >
            <Button danger icon={<DeleteOutlined />} disabled={chon.size === 0}>
              Xóa đã chọn ({chon.size})
            </Button>
          </Popconfirm>
          <Button onClick={dong}>Đóng</Button>
        </div>
      }
    >
      {ds.length === 0 ? (
        <Empty description="Chưa có bản nháp nào" />
      ) : (
        <List<NhapCoTen<T>>
          dataSource={ds}
          style={{ maxHeight: 420, overflow: "auto" }}
          renderItem={(b) => (
            <List.Item
              key={b.id}
              actions={[
                <Button
                  key="mo" type="primary" size="small" icon={<FolderOpenOutlined />}
                  onClick={() => { onMoNhap(b.duLieu); dong(); }}
                >
                  Mở
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<Checkbox checked={chon.has(b.id)} onChange={() => bat(b.id)} />}
                title={<Typography.Text strong>{b.ten}</Typography.Text>}
                description={`Lưu lúc ${gioPhut(b.luuLuc)}`}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
}
