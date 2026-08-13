import { useState } from "react";
import {
  Modal, Upload, Button, Input, Select, Space, Table, Tabs, Alert, Typography,
  Statistic, Row, Col, message,
} from "antd";
import { InboxOutlined, FolderOpenOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueRaSoat, thueRaSoatThuMuc, loiApi } from "../api";
import type { HoaDonFile, KetQuaRaSoat, VanDeRaSoat } from "../api";

// ============ RÀ SOÁT DỮ LIỆU TRƯỚC KHI KHAI THUẾ ============
// Đối chiếu hóa đơn trong FILE (XML cổng TCT) với hóa đơn đã có trong SỔ, để biết
// còn thiếu/lệch gì trước khi nộp tờ khai.
//
// CHỈ XEM — KHÔNG GHI. Modal này không có nút nào ghi vào sổ (chốt với Trường
// 13/08): nó soi sổ đang chạy thật ngay trước kỳ khai thuế, thấy vấn đề thì kế
// toán tự quyết cách xử lý. Muốn nạp thì dùng màn Lấy HĐĐT như mọi khi.
//
// XML đọc NGAY TẠI TRÌNH DUYỆT bằng DOMParser: không phải tải file lên server,
// nên chọn cả trăm file cũng không nghẽn mạng, và file gốc không rời khỏi máy
// người dùng. Server chỉ nhận danh sách đã rút gọn (định danh + hai con số tiền).

interface Props {
  mo: boolean;
  onDong: () => void;
  thang: number | undefined;      // kỳ đang soát; undefined = cả năm
  nhanKy: string;
}

// Cột chung cho mọi bảng vấn đề. Trường nào không hợp với loại đó thì để trống.
const COT: ColumnsType<VanDeRaSoat> = [
  { title: "Hướng", dataIndex: "huong", width: 70 },
  { title: "Ký hiệu", dataIndex: "khhd", width: 100 },
  { title: "Số HĐ", dataIndex: "soHd", width: 100 },
  { title: "Ngày", dataIndex: "ngay", width: 110 },
  { title: "MST", dataIndex: "mst", width: 130 },
  { title: "Đối tác", dataIndex: "tenDoiTac", ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "Vấn đề", dataIndex: "moTa", width: 300, ellipsis: true,
    render: (v: string) => <span title={v}>{v}</span> },
];

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Riêng bảng LỆCH TIỀN cần thấy cả hai bên để biết lệch bao nhiêu
const COT_LECH: ColumnsType<VanDeRaSoat> = [
  { title: "Ký hiệu", dataIndex: "khhd", width: 100 },
  { title: "Số HĐ", dataIndex: "soHd", width: 100 },
  { title: "Đối tác", dataIndex: "tenDoiTac", ellipsis: true },
  { title: "Tiền hàng (file)", dataIndex: "tienHangFile", width: 140,
    align: "right", render: tien },
  { title: "Tiền hàng (sổ)", dataIndex: "tienHangSo", width: 140,
    align: "right", render: tien },
  { title: "VAT (file)", dataIndex: "tienVatFile", width: 130,
    align: "right", render: tien },
  { title: "VAT (sổ)", dataIndex: "tienVatSo", width: 130,
    align: "right", render: tien },
];

// Đọc một file XML hóa đơn của cổng TCT. File hỏng trả null — một file rác không
// được phép làm chết cả mẻ.
function docXml(noiDung: string, tenFile: string, huong: string): HoaDonFile | null {
  try {
    const doc = new DOMParser().parseFromString(noiDung, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const lay = (cha: Element | null, ten: string) =>
      cha?.getElementsByTagName(ten)[0]?.textContent?.trim() ?? "";
    const so = (cha: Element | null, ten: string) => {
      const v = Number(lay(cha, ten));
      return Number.isFinite(v) ? v : 0;
    };

    const dl = doc.getElementsByTagName("DLHDon")[0] ?? null;
    const chung = dl?.getElementsByTagName("TTChung")[0] ?? null;
    const nd = dl?.getElementsByTagName("NDHDon")[0] ?? null;
    if (!chung || !nd) return null;

    const ban = nd.getElementsByTagName("NBan")[0] ?? null;
    const tt = nd.getElementsByTagName("TToan")[0] ?? null;

    const tienVat = so(tt, "TgTThue");
    const tongTien = so(tt, "TgTTTBSo");
    let tienHang = so(tt, "TgTCThue");
    // HĐ không chịu thuế thường không khai TgTCThue — suy ngược từ tổng, giống
    // cách ImportService làm. Không có bước này thì mọi HĐ loại đó báo lệch oan.
    if (tienHang === 0) tienHang = tongTien - tienVat;

    return {
      tenFile,
      huong,
      mst: lay(ban, "MST"),
      khhd: lay(chung, "KHHDon"),
      soHd: lay(chung, "SHDon"),
      ngay: lay(chung, "NLap"),
      tenDoiTac: lay(ban, "Ten"),
      tienHang,
      tienVat,
    };
  } catch {
    return null;
  }
}

export default function ModalRaSoat({ mo, onDong, thang, nhanKy }: Props) {
  const [huong, setHuong] = useState<"VAO" | "RA">("VAO");
  const [thuMuc, setThuMuc] = useState("");
  const [dangSoat, setDangSoat] = useState(false);
  const [kq, setKq] = useState<KetQuaRaSoat | null>(null);
  const [soFileHong, setSoFileHong] = useState(0);
  const [tab, setTab] = useState("thieu-so");

  const soatDanhSach = async (ds: HoaDonFile[], hong: number) => {
    if (ds.length === 0) {
      message.warning("Không đọc được hóa đơn nào từ các file đã chọn");
      return;
    }
    setDangSoat(true);
    try {
      const r = await thueRaSoat(thang, ds);
      setKq(r.data);
      setSoFileHong(hong);
      setTab("thieu-so");
    } catch (e) {
      message.error(loiApi(e, "Không rà soát được"));
    } finally {
      setDangSoat(false);
    }
  };

  // Người dùng chọn file: đọc hết ở trình duyệt rồi mới gửi một lượt
  const nhanFile = async (files: File[]) => {
    const ds: HoaDonFile[] = [];
    let hong = 0;
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".xml")) { hong++; continue; }
      const hd = docXml(await f.text(), f.name, huong);
      if (hd) ds.push(hd); else hong++;
    }
    await soatDanhSach(ds, hong);
  };

  const soatThuMuc = async () => {
    if (!thuMuc.trim()) {
      message.warning("Chưa nhập đường dẫn thư mục");
      return;
    }
    setDangSoat(true);
    try {
      const r = await thueRaSoatThuMuc(thang, thuMuc.trim(), huong);
      setKq(r.data);
      setSoFileHong(0);
      setTab("thieu-so");
    } catch (e) {
      message.error(loiApi(e, "Không quét được thư mục"));
    } finally {
      setDangSoat(false);
    }
  };

  const bang = (ds: VanDeRaSoat[], cot: ColumnsType<VanDeRaSoat>, trong: string) => (
    <Table<VanDeRaSoat>
      size="small"
      rowKey={(m, i) => `${m.loai}-${m.khhd}-${m.soHd}-${i}`}
      dataSource={ds}
      columns={cot}
      pagination={false}
      scroll={{ y: 320 }}
      locale={{ emptyText: trong }}
    />
  );

  const tongVanDe = kq
    ? kq.thieuTrongSo.length + kq.lechTien.length + kq.trung.length + kq.saiKy.length
    : 0;

  return (
    <Modal
      title={`Rà soát dữ liệu — ${nhanKy}`}
      open={mo}
      onCancel={onDong}
      footer={<Button onClick={onDong}>Đóng</Button>}
      width="80vw"
      style={{ top: 40, maxWidth: 1400 }}
      styles={{ body: { maxHeight: "calc(100vh - 200px)", overflow: "auto" } }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Chỉ đối chiếu, không ghi vào sổ"
        description="Màn này so hóa đơn trong file với hóa đơn đã có trong sổ để bạn biết còn thiếu hay lệch gì. Muốn nạp hóa đơn thì dùng màn Lấy HĐ điện tử."
      />

      {/* ----- Nguồn dữ liệu ----- */}
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Typography.Text type="secondary">Hướng hóa đơn</Typography.Text>
          {/* File XML không tự nói vào hay ra — cùng một file là HĐ ra của bên bán
              và HĐ vào của bên mua, nên phải hỏi. */}
          <Select value={huong} onChange={setHuong} style={{ width: 150 }}
                  options={[
                    { value: "VAO", label: "Mua vào" },
                    { value: "RA", label: "Bán ra" },
                  ]} />
        </Space>

        <Upload.Dragger
          multiple
          accept=".xml"
          showUploadList={false}
          disabled={dangSoat}
          // Đọc file ngay tại trình duyệt, KHÔNG tải lên server
          beforeUpload={(_, danhSach) => {
            void nhanFile(danhSach as File[]);
            return Upload.LIST_IGNORE;
          }}
          style={{ padding: "10px 0" }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Kéo thả hoặc bấm để chọn file XML hóa đơn</p>
          <p className="ant-upload-hint" style={{ fontSize: 12 }}>
            Chọn được nhiều file cùng lúc. File đọc ngay tại máy bạn, không tải lên máy chủ.
          </p>
        </Upload.Dragger>

        <Space.Compact style={{ width: "100%" }}>
          <Input
            prefix={<FolderOpenOutlined />}
            placeholder="…hoặc gõ đường dẫn thư mục XML có sẵn trên máy chủ"
            value={thuMuc}
            onChange={(e) => setThuMuc(e.target.value)}
            onPressEnter={soatThuMuc}
            disabled={dangSoat}
          />
          <Button type="primary" onClick={soatThuMuc} loading={dangSoat}>
            Quét thư mục
          </Button>
        </Space.Compact>
      </Space>

      {/* ----- Kết quả ----- */}
      {kq && (
        <>
          <Row gutter={16} style={{ margin: "16px 0 4px" }}>
            <Col><Statistic title="HĐ trong file" value={kq.soHdFile} /></Col>
            <Col><Statistic title="HĐ trong sổ" value={kq.soHdSo} /></Col>
            <Col>
              <Statistic
                title="Vấn đề cần xem"
                value={tongVanDe}
                styles={{ content: { color: tongVanDe > 0 ? "#cf1322" : "#389e0d" } }}
              />
            </Col>
            {soFileHong > 0 && (
              <Col>
                <Statistic title="File bỏ qua" value={soFileHong}
                           styles={{ content: { color: "#d46b08" } }} />
              </Col>
            )}
          </Row>

          {tongVanDe === 0 && (
            <Alert type="success" showIcon style={{ marginBottom: 8 }}
                   message="Không tìm thấy vấn đề nào — dữ liệu khớp giữa file và sổ" />
          )}

          <Tabs
            activeKey={tab}
            onChange={setTab}
            size="small"
            items={[
              {
                key: "thieu-so",
                label: `Thiếu trong sổ (${kq.thieuTrongSo.length})`,
                children: bang(kq.thieuTrongSo, COT,
                  "Mọi hóa đơn trong file đều đã có trong sổ"),
              },
              {
                key: "lech",
                label: `Lệch số tiền (${kq.lechTien.length})`,
                children: bang(kq.lechTien, COT_LECH,
                  "Không có hóa đơn nào lệch tiền"),
              },
              {
                key: "trung",
                label: `Trùng (${kq.trung.length})`,
                children: bang(kq.trung, COT, "Không có hóa đơn trùng"),
              },
              {
                key: "sai-ky",
                label: `Sai kỳ kê khai (${kq.saiKy.length})`,
                children: bang(kq.saiKy, COT,
                  "Mọi hóa đơn đều đúng kỳ đang soát"),
              },
              {
                key: "thieu-file",
                label: `Chỉ có trong sổ (${kq.thieuTrongFile.length})`,
                children: bang(kq.thieuTrongFile, COT,
                  "Mọi hóa đơn trong sổ đều có file tương ứng"),
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
