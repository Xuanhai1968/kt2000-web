// DÙNG LẠI ĐƠN TRƯỚC — bê từ USA_Meva (ReusePrevInvoiceModal + PrevInvoicePreviewModal),
// gộp hai modal vào một file vì chúng luôn đi cặp với nhau.
//
// Vì sao đáng bê: khách quen tuần nào cũng lấy gần đúng một giỏ hàng. Gõ lại từ đầu 15
// dòng cho mỗi lần giao là việc thừa — chép đơn lần trước rồi sửa vài con số nhanh hơn hẳn.
//
// Chuyển khuôn dữ liệu: bản gốc chạy trên Delivery (GUID, có màu/tinh màu/nhãn hàng).
// Bên NB đơn hàng nằm trong HOA_DON nên ở đây dùng thẳng DonNb/DonNbLine (SPEC mục 4).
//
// LUẬT: "dùng lại" chỉ chép PHẦN RUỘT (dòng hàng + đối tác). Số đơn và ngày KHÔNG chép —
// số đơn do backend cấp lúc lưu (chốt 9.7), ngày là ngày lập đơn mới. Chép cả số đơn
// thì thành sửa đè lên đơn cũ, mất đơn đã giao.
// ngayNh cũng KHÔNG chép: mốc rời kho của chuyến trước không nói gì về chuyến này (BR-NB-07).

import { Modal, Button, Table, Typography, Tag } from "antd";
import { CopyOutlined, EyeOutlined } from "@ant-design/icons";
import type { DonNb, DonNbLine } from "../../api";

const soTien = (n: number) => (Number(n) || 0).toLocaleString("vi-VN");

const ngayVn = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("vi-VN") : "—";

// ============================ HỎI: có dùng lại không? ============================
export function ModalHoiDungLai({ mo, tenKh, don, onDong, onDungLai, onXem }: {
  mo: boolean;
  tenKh?: string;
  don: DonNb | null;
  onDong: () => void;
  onDungLai: () => void;
  onXem: () => void;
}) {
  return (
    <Modal
      open={mo}
      onCancel={onDong}
      title="Dùng lại đơn trước?"
      width={460}
      footer={[
        <Button key="dong" onClick={onDong}>Thôi</Button>,
        <Button key="xem" icon={<EyeOutlined />} onClick={onXem}>Xem đơn trước</Button>,
        <Button key="dung" type="primary" icon={<CopyOutlined />} onClick={onDungLai}>
          Dùng lại
        </Button>,
      ]}
    >
      <Typography.Paragraph style={{ marginBottom: 4 }}>
        Khách {tenKh ? <Typography.Text strong>{tenKh}</Typography.Text> : "này"} đã có đơn
        trước đó. Chép lại các dòng hàng của đơn cũ sang đơn đang lập?
      </Typography.Paragraph>
      {don && (
        <Typography.Text type="secondary">
          Đơn gần nhất: <b>{don.maHd}</b> · {ngayVn(don.ngay)} · {soTien(don.tongTien)}
        </Typography.Text>
      )}
      <Typography.Paragraph type="secondary"
        style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
        Chỉ chép dòng hàng và đối tác. <b>Số đơn và ngày vẫn là của đơn mới</b> — đơn cũ
        không bị đụng tới.
      </Typography.Paragraph>
    </Modal>
  );
}

// ============================ XEM TRƯỚC nội dung đơn cũ ============================
// Xem NGAY TẠI CHỖ, không chuyển trang: người dùng đang gõ dở đơn mới, đá sang màn khác
// là mất phần đang gõ.
export function ModalXemDonTruoc({ mo, don, onDong, onDungLai }: {
  mo: boolean;
  don: DonNb | null;
  onDong: () => void;
  onDungLai?: () => void;
}) {
  const dong = don?.lines ?? [];

  return (
    <Modal
      open={mo}
      onCancel={onDong}
      title={don ? `Xem đơn ${don.maHd}` : "Xem đơn trước"}
      width={820}
      footer={[
        <Button key="dong" onClick={onDong}>Đóng</Button>,
        onDungLai
          ? <Button key="dung" type="primary" icon={<CopyOutlined />} onClick={onDungLai}>
              Dùng lại
            </Button>
          : null,
      ]}
    >
      {don && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
          Ngày {ngayVn(don.ngay)}
          {don.tenNvkd ? ` · NVKD: ${don.tenNvkd}` : ""}
          {/* BR-NB-07: chưa có ngayNh = hàng chưa rời kho */}
          {don.ngayNh
            ? ` · Xuất kho ${ngayVn(don.ngayNh)}`
            : <> · <Tag color="orange">chưa giao</Tag></>}
        </Typography.Paragraph>
      )}
      <Table<DonNbLine>
        rowKey="sttLine"
        size="small"
        pagination={false}
        dataSource={dong}
        scroll={{ y: 360 }}
        columns={[
          { title: "STT", width: 48, align: "center", render: (_v, _r, i) => i + 1 },
          { title: "Tên hàng", dataIndex: "tenHang", ellipsis: true },
          { title: "ĐVT", dataIndex: "dvt", width: 80, align: "center" },
          { title: "SL", dataIndex: "soLuong", width: 80, align: "right",
            render: (v: number) => soTien(v) },
          { title: "Đơn giá", dataIndex: "donGia", width: 110, align: "right",
            render: (v: number) => soTien(v) },
          { title: "%VAT", dataIndex: "ptVat", width: 64, align: "right" },
          { title: "Thành tiền", dataIndex: "thanhTien", width: 120, align: "right",
            render: (v: number) => soTien(v) },
        ]}
      />
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Typography.Text type="secondary">Tiền hàng: {soTien(don?.tienHang ?? 0)}</Typography.Text>
        <Typography.Text type="secondary" style={{ marginLeft: 16 }}>
          Thuế GTGT: {soTien(don?.tienVat ?? 0)}
        </Typography.Text>
        <Typography.Text strong style={{ marginLeft: 16, fontSize: 16 }}>
          Tổng cộng: {soTien(don?.tongTien ?? 0)}
        </Typography.Text>
      </div>
    </Modal>
  );
}
