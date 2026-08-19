import { useState } from "react";
import { Modal, Table, Button, Alert, Empty, Tag, Tooltip, message, Space } from "antd";
import { SearchOutlined, SaveOutlined, CopyOutlined,
         FileTextOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueHdLienQuanKhacKy, loiApi } from "../api";
import type { DongLienQuan, KetQuaLienQuan } from "../api";

// ============ HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ (BR-TK-20) ============
//
// Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10.4 trường hợp 2 và §10bis.7.
//
// Hóa đơn thay thế/điều chỉnh mà HÓA ĐƠN GỐC thuộc kỳ khác thì engine KHÔNG kê vào
// tờ khai kỳ này (BR-TK-06b) — đúng như bản tờ khai cổng TCT trả về. Nhưng "không
// kê" mà im lặng thì kế toán không biết còn khoản nào treo ở kỳ gốc.
//
// Màn này làm HAI BƯỚC, cố ý tách rời:
//   1. XEM TRƯỚC (mặc định) — chỉ liệt kê + xuất file .txt, KHÔNG đụng sổ.
//   2. ĐÁNH DẤU — mới thật sự ghi [TK-LQ] vào HOA_DON.ghi_chu.
// Đúng tinh thần "bấm lần 1 không ghi gì" của spec §10.4: cho kế toán nhìn thấy
// phạm vi ảnh hưởng trước khi quyết định.

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "";
};

interface Props {
  mo: boolean;
  onDong: () => void;
  nam: number;
  thang: number;
}

export default function HdLienQuanKhacKy({ mo, onDong, nam, thang }: Props) {
  const [kq, setKq] = useState<KetQuaLienQuan | null>(null);
  const [dangChay, setDangChay] = useState(false);

  // Đổi kỳ thì bỏ kết quả cũ: giữ lại là người dùng đọc số của kỳ trước mà tưởng
  // của kỳ đang chọn. Chỉnh state ngay trong render (lối React khuyên khi state
  // phải bám theo prop) thay vì useEffect — effect gây cascading render.
  const [kyTruoc, setKyTruoc] = useState(`${thang}/${nam}`);
  const kyHienTai = `${thang}/${nam}`;
  if (kyHienTai !== kyTruoc) {
    setKyTruoc(kyHienTai);
    if (kq) setKq(null);
  }

  const chay = async (chiXem: boolean) => {
    setDangChay(true);
    try {
      const r = await thueHdLienQuanKhacKy(thang, nam, undefined, chiXem);
      setKq(r.data);
      if (r.data.soHoaDon === 0) message.info(r.data.message);
      else if (chiXem) message.success(r.data.message);
      else message.success(r.data.message);
    } catch (e) {
      message.error(loiApi(e, "Không chạy được"));
    } finally {
      setDangChay(false);
    }
  };

  const chepDuong = (s: string) => {
    navigator.clipboard.writeText(s)
      .then(() => message.success("Đã chép đường dẫn — dán vào Explorer để mở"))
      .catch(() => message.warning("Trình duyệt không cho chép"));
  };

  const cot: ColumnsType<DongLienQuan> = [
    { title: "STT", width: 56, align: "center", fixed: "left",
      render: (_v, _m, i) => i + 1 },
    { title: "Đơn vị", dataIndex: "maDonVi", width: 130, fixed: "left" },
    { title: "Hướng", dataIndex: "huong", width: 78, align: "center",
      render: (v: string) => v === "RA"
        ? <Tag color="blue">Bán ra</Tag> : <Tag color="gold">Mua vào</Tag> },
    { title: "Ký hiệu", dataIndex: "khhd", width: 92 },
    { title: "Số HĐ", dataIndex: "soHd", width: 92 },
    { title: "Ngày", dataIndex: "ngay", width: 92, align: "center",
      render: (v: string | null) => ngayNgan(v) },
    { title: "Đối tác", dataIndex: "tenKh", width: 220, ellipsis: true },
    { title: "Loại", dataIndex: "loaiXuLy", width: 118,
      render: (v: string, m) => (
        <Tooltip title={m.trangThai}>
          <Tag color={v === "Thay thế" ? "red"
                    : v === "Điều chỉnh" ? "orange" : "magenta"}>{v}</Tag>
        </Tooltip>) },
    { title: "HĐ gốc", width: 190,
      render: (_: unknown, m) => m.soHdGoc
        ? `${m.khhdGoc}/${m.soHdGoc}`
        : <span style={{ color: "#c41d7f" }}>không tìm thấy bản thay thế</span> },
    { title: "Kỳ gốc", width: 110, align: "center",
      render: (_: unknown, m) => !m.soHdGoc
        ? <Tag color="magenta">chưa rõ</Tag>
        : m.thangGoc === 0
          ? <Tooltip title="Sổ không có ngày hóa đơn gốc">
              <Tag color="volcano">thiếu ngày</Tag></Tooltip>
          : <Tag color="purple">
              {String(m.thangGoc).padStart(2, "0")}/{m.namGoc}
            </Tag> },
    { title: "Tiền hàng", dataIndex: "tienHang", width: 140, align: "right",
      render: tien },
    { title: "Tiền VAT", dataIndex: "tienVat", width: 130, align: "right",
      render: tien },
    { title: "Trạng thái", dataIndex: "daCoGhiChu", width: 150,
      render: (v: boolean) => v
        ? <Tag color="green">Đã đánh dấu</Tag>
        : <Tag>Chưa đánh dấu</Tag> },
  ];

  const RONG = 56 + 130 + 78 + 92 + 92 + 92 + 220 + 118 + 190 + 110 + 140 + 130 + 150;

  return (
    <Modal
      title={`Hóa đơn thay thế / điều chỉnh KHÁC KỲ — kỳ ${String(thang).padStart(2, "0")}/${nam}`}
      open={mo}
      onCancel={onDong}
      footer={null}
      width="94vw"
      style={{ top: 20, maxWidth: "94vw" }}
      styles={{ body: { height: "calc(100vh - 180px)", overflow: "auto", padding: 12 } }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Tờ khai kỳ này ĐÚNG — nhưng có hóa đơn cần tra lại"
        description={
          <>
            <div>
              <Tag color="red">Thay thế</Tag><Tag color="orange">Điều chỉnh</Tag>
              {" "}gốc ở <b>kỳ khác</b> — kỳ này không kê, nhưng <b>kỳ gốc phải khai
              bổ sung</b> (hệ thống không tự làm).
            </div>
            <div style={{ marginTop: 4 }}>
              <Tag color="magenta">Gốc mồ côi</Tag>
              không tìm thấy bản thay thế — nó nằm ở <b>kỳ khác hoặc chưa nạp</b>,
              cần tra xem đã khai chưa.
            </div>
            <div style={{ marginTop: 6, color: "#8c8c8c" }}>
              <b>Xem trước</b>: chỉ liệt kê và xuất file · <b>Đánh dấu vào sổ</b>:
              ghi chú vào cột Ghi chú của từng hóa đơn.
            </div>
          </>}
      />

      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<SearchOutlined />}
                loading={dangChay}
                onClick={() => void chay(true)}>
          Xem trước (không ghi)
        </Button>
        <Tooltip title={!kq ? "Bấm Xem trước"
                      : kq.soHoaDon === 0 ? "Kỳ này không có hóa đơn nào"
                      : "Ghi [TK-LQ] vào cột Ghi chú của các hóa đơn dưới đây"}>
          <Button icon={<SaveOutlined />}
                  danger
                  loading={dangChay}
                  disabled={!kq || kq.soHoaDon === 0}
                  onClick={() => Modal.confirm({
                    title: "Đánh dấu vào sổ?",
                    icon: <WarningOutlined style={{ color: "#faad14" }} />,
                    width: 560,
                    content: (
                      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                        <div>Sẽ ghi chú vào <b>{kq?.soHoaDon ?? 0} hóa đơn</b> trên{" "}
                          <b>{kq?.soDonVi ?? 0} đơn vị</b>.</div>
                        <div style={{ marginTop: 8, color: "#8c8c8c" }}>
                          Chỉ <b>nối thêm</b> vào cột Ghi chú, không xóa nội dung cũ.
                          Chạy lại nhiều lần không nhân đôi ghi chú.
                        </div>
                      </div>),
                    okText: "Đánh dấu",
                    okButtonProps: { danger: true },
                    cancelText: "Hủy",
                    onOk: () => chay(false),
                  })}>
            Đánh dấu vào sổ
          </Button>
        </Tooltip>

        {kq?.duongDanFile && (
          <Tooltip title={`${kq.duongDanFile} — bấm để chép`}>
            <Button icon={<FileTextOutlined />}
                    onClick={() => chepDuong(kq.duongDanFile!)}>
              File tổng hợp <CopyOutlined />
            </Button>
          </Tooltip>
        )}
      </Space>

      {kq && (
        <Alert
          type={kq.soHoaDon === 0 ? "success" : kq.chiXem ? "warning" : "success"}
          showIcon
          style={{ marginBottom: 12 }}
          message={kq.message}
          description={
            <>
              Quét <b>{kq.soDonVi}</b> đơn vị · tìm thấy <b>{kq.soHoaDon}</b> hóa đơn
              {kq.soDaGhi > 0 && <> · đã ghi <b>{kq.soDaGhi}</b></>}
              {kq.soBoQua > 0 && <> · bỏ qua <b>{kq.soBoQua}</b> (đã đánh dấu từ trước)</>}
              {kq.duongDanFile && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  File tổng hợp: <code>{kq.duongDanFile}</code>
                </div>)}
              {kq.loi.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", color: "#d46b08" }}>
                    {kq.loi.length} đơn vị không đọc được (chưa mở sổ năm {kq.nam}…)
                  </summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                    {kq.loi.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </details>)}
            </>}
        />
      )}

      <Table<DongLienQuan>
        size="small"
        rowKey={(m) => `${m.maDonVi}|${m.khhd}|${m.soHd}`}
        dataSource={kq?.dong ?? []}
        columns={cot}
        loading={dangChay}
        pagination={false}
        scroll={{ x: RONG, y: "calc(100vh - 460px)" }}
        summary={(ds) => ds.length === 0 ? null : (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={10}>
                <b>Cộng {ds.length} hóa đơn</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} align="right">
                <b>{tien(ds.reduce((s, x) => s + x.tienHang, 0))}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={11} align="right">
                <b>{tien(ds.reduce((s, x) => s + x.tienVat, 0))}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={12} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
        locale={{ emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                 description={kq
                   ? `Kỳ ${String(thang).padStart(2, "0")}/${nam} không có hóa đơn thay thế/điều chỉnh khác kỳ nào`
                   : "Bấm Xem trước để quét"} />) }}
      />
    </Modal>
  );
}
