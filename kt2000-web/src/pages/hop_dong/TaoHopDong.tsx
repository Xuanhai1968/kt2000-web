import { useEffect, useState } from "react";
import {
  Modal, Button, Space, Input, InputNumber, Form, DatePicker, Select,
  Typography, message,
} from "antd";
import {
  FileAddOutlined, PrinterOutlined, EyeOutlined,
  DeleteOutlined, ExclamationCircleFilled,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { nsDanhSach, hdThem, hdSua, hdXoa, loiApi } from "../../api";
import type { NhanSu, HopDong } from "../../api";
import { inHopDong, xemTruocHopDong, htmlHopDong, CSS_HD } from "./mauInHopDong";

interface Props {
  mo: boolean;
  onDong: () => void;
  onDaLuu: () => void;
  /** Bỏ trống = đơn vị đang đăng nhập. Chỉ MDN_NB mới truyền mã khác. */
  maDonVi?: string;
  tenDonVi?: string | null;
  /** Có giá trị = đang SỬA hợp đồng đó; null = tạo mới. */
  hopDong: HopDong | null;
}

const sangNgay = (s: string | null | undefined) =>
  s ? dayjs(s.slice(0, 10)) : null;

const raNgay = (v: unknown) =>
  v ? dayjs(v as dayjs.Dayjs).format("YYYY-MM-DD") : null;

// Mặc định lấy từ khuôn Excel gốc — điền sẵn để kế toán không phải gõ lại mỗi lần.
// Đây là những câu CỐ ĐỊNH ở cả 12 sheet đã kiểm.
const MAC_DINH = {
  loaiHd: "Có thời hạn",
  thoiGianLv: "48 giờ/tuần.",
  phuongTien: "Cá nhân tự túc",
  hinhThucTra: "Thanh toán lương theo tháng từ ngày 03 đến ngày 10 hàng tháng.",
  baoHoLd: "Không",
  congViec: "+ Các công việc khác khi được công ty phân công",
  quocTich: "Việt Nam",
};

const LOAI_HD = [
  "Có thời hạn", "Không thời hạn", "Thử việc", "Thời vụ", "Khoán việc",
].map((v) => ({ value: v, label: v }));

export default function TaoHopDong({
  mo, onDong, onDaLuu, maDonVi, tenDonVi, hopDong,
}: Props) {
  const [dsNs, setDsNs] = useState<NhanSu[]>([]);
  const [dangLuu, setDangLuu] = useState(false);
  const [form] = Form.useForm();

  // MỌI giá trị của form, cập nhật mỗi lần gõ. Form của antd giữ giá trị bên trong nó
  // nên gõ một chữ KHÔNG làm component vẽ lại — useWatch chính là chỗ antd bắn ra tín
  // hiệu đó. Nhờ vậy tờ hợp đồng bên phải là giá trị DẪN XUẤT, không phải state chép
  // lại (chép thì phải setState trong effect, sinh vòng vẽ thừa).
  const giaTri = Form.useWatch([], form);

  // Bản đang soạn — nút In/Xem trước cần dữ liệu ngay cả khi CHƯA lưu, nên đọc thẳng
  // từ form thay vì chờ round-trip qua server.
  const banHienTai = (): HopDong => {
    const v = (giaTri ?? form.getFieldsValue()) as Record<string, unknown>;
    const ns = dsNs.find((n) => n.id === v.nhanSuId);
    return {
      id: hopDong?.id ?? 0,
      nhanSuId: Number(v.nhanSuId ?? 0),
      soHd: (v.soHd as string) ?? null,
      ngayKy: raNgay(v.ngayKy),
      loaiHd: (v.loaiHd as string) ?? null,
      tuNgay: raNgay(v.tuNgay),
      denNgay: raNgay(v.denNgay),
      diaDiemLv: (v.diaDiemLv as string) ?? null,
      congViec: (v.congViec as string) ?? null,
      thoiGianLv: (v.thoiGianLv as string) ?? null,
      phuongTien: (v.phuongTien as string) ?? null,
      luongChinh: (v.luongChinh as number) ?? null,
      pcAnCa: (v.pcAnCa as number) ?? null,
      pcDienThoai: (v.pcDienThoai as number) ?? null,
      pcXangXe: (v.pcXangXe as number) ?? null,
      pcKhac: (v.pcKhac as number) ?? null,
      hinhThucTra: (v.hinhThucTra as string) ?? null,
      baoHoLd: (v.baoHoLd as string) ?? null,
      thoaThuan: (v.thoaThuan as string) ?? null,
      nsdldHoTen: (v.nsdldHoTen as string) ?? null,
      nsdldChucVu: (v.nsdldChucVu as string) ?? null,
      nsdldDaiDien: (v.nsdldDaiDien as string) ?? null,
      nsdldDiaChi: (v.nsdldDiaChi as string) ?? null,
      trangThai: (v.trangThai as string) ?? null,
      ghiChu: (v.ghiChu as string) ?? null,
      // Thông tin người lao động lấy từ nhân sự đang chọn — form in cần đủ một lượt
      hoTen: ns?.hoTen ?? hopDong?.hoTen ?? null,
      ngaySinh: ns?.ngaySinh ?? hopDong?.ngaySinh ?? null,
      soCmnd: ns?.soCmnd ?? hopDong?.soCmnd ?? null,
      quocTich: ns?.quocTich ?? hopDong?.quocTich ?? null,
      ngheNghiep: ns?.ngheNghiep ?? hopDong?.ngheNghiep ?? null,
      chucDanh: ns?.chucDanh ?? hopDong?.chucDanh ?? null,
    };
  };

  useEffect(() => {
    if (!mo) return;
    void nsDanhSach(maDonVi, false)
      .then((r) => setDsNs(r.data))
      .catch((e) => message.error(loiApi(e, "Không đọc được danh sách nhân sự")));
  }, [mo, maDonVi]);

  useEffect(() => {
    if (!mo) return;
    if (hopDong) {
      form.setFieldsValue({
        ...hopDong,
        ngayKy: sangNgay(hopDong.ngayKy),
        tuNgay: sangNgay(hopDong.tuNgay),
        denNgay: sangNgay(hopDong.denNgay),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        ...MAC_DINH,
        nsdldDaiDien: tenDonVi ?? "",
        ngayKy: dayjs(),
        trangThai: "hieu_luc",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, hopDong, tenDonVi]);

  const luu = async () => {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); } catch { return; }

    const than = {
      ...v,
      ngayKy: raNgay(v.ngayKy),
      tuNgay: raNgay(v.tuNgay),
      denNgay: raNgay(v.denNgay),
    } as Partial<HopDong>;

    setDangLuu(true);
    try {
      const r = hopDong
        ? await hdSua(hopDong.id, than, maDonVi)
        : await hdThem(than, maDonVi);
      message.success(r.data.message);
      onDaLuu();
      onDong();
    } catch (e) {
      message.error(loiApi(e, "Không lưu được hợp đồng"));
    } finally {
      setDangLuu(false);
    }
  };

  const xoa = () => {
    if (!hopDong) return;
    Modal.confirm({
      title: "Xóa hợp đồng?",
      icon: <ExclamationCircleFilled style={{ color: "#cf1322" }} />,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div><b>{hopDong.soHd ?? ""}</b> — {hopDong.hoTen}</div>
          <div style={{ marginTop: 8, color: "#cf1322" }}>
            Hợp đồng là chứng từ đã ký — xóa rồi <b>không lấy lại được</b>.
          </div>
        </div>
      ),
      okText: "Xóa", okButtonProps: { danger: true }, cancelText: "Hủy",
      onOk: async () => {
        try {
          const r = await hdXoa(hopDong.id, maDonVi);
          message.success(r.data.message);
          onDaLuu();
          onDong();
        } catch (e) {
          message.error(loiApi(e, "Không xóa được hợp đồng"));
        }
      },
    });
  };

  const inHd = () => {
    const x = banHienTai();
    if (!x.hoTen) { message.info("Chọn nhân sự trước khi in"); return; }
    inHopDong(x, tenDonVi);
  };

  const xemTruoc = () => {
    const x = banHienTai();
    if (!x.hoTen) { message.info("Chọn nhân sự trước khi xem"); return; }
    xemTruocHopDong(x, tenDonVi);
  };

  // Chọn nhân sự thì điền sẵn địa điểm làm việc bằng địa chỉ công ty — khuôn Excel để
  // hai chỗ này giống nhau ở cả 12 sheet.
  const chonNhanSu = (id: number) => {
    const ns = dsNs.find((n) => n.id === id);
    if (!ns) return;
    const dc = form.getFieldValue("nsdldDiaChi");
    if (dc && !form.getFieldValue("diaDiemLv")) {
      form.setFieldsValue({ diaDiemLv: dc });
    }
  };

  // Dựng lại mỗi lần vẽ. Rẻ: chỉ đọc mấy chục trường rồi nối chuỗi, mà đổi lại tờ
  // hợp đồng luôn khớp đúng thứ đang có trong form.
  const banXem = banHienTai();

  return (
    <Modal
      title={
        <span>
          <FileAddOutlined style={{ marginRight: 8 }} />
          {hopDong ? "Sửa hợp đồng lao động" : "Tạo hợp đồng lao động"}
          {maDonVi && <> — <b>{maDonVi}</b></>}
          {tenDonVi && <span className="hd-ten-dv"> · {tenDonVi}</span>}
        </span>
      }
      open={mo}
      onCancel={onDong}
      width="96vw"
      style={{ top: 16, maxWidth: "96vw" }}
      styles={{ body: { height: "calc(100vh - 170px)", overflowY: "auto", padding: 12 } }}
      footer={
        <Space wrap>
          {hopDong && (
            <Button danger icon={<DeleteOutlined />} onClick={xoa}>Xóa</Button>
          )}
          <span style={{ flex: 1 }} />
          <Button icon={<EyeOutlined />} onClick={xemTruoc}>Xem trước</Button>
          <Button icon={<PrinterOutlined />} onClick={inHd}>Print</Button>
          <Button onClick={onDong}>Hủy</Button>
          <Button type="primary" loading={dangLuu} onClick={() => void luu()}>
            Lưu hợp đồng
          </Button>
        </Space>
      }
    >
      <div className="hd-tao">
      {/* HAI CỘT: trái là ô nhập, phải là TỜ HỢP ĐỒNG THẬT vẽ sống theo từng chữ gõ.
          Dùng lại đúng htmlHopDong + CSS_HD của bản in, không dựng bản thứ hai — hai
          bộ trình bày là bắt đầu lệch nhau, mà cái người dùng tin là cái họ nhìn thấy. */}
      <Form form={form} layout="vertical" size="small" className="hd-form">
        <div className="hd-nhom">
          <h4>Thông tin hợp đồng</h4>
          <div className="hd-luoi-form">
            <Form.Item name="nhanSuId" label="Người lao động"
                       rules={[{ required: true, message: "Phải chọn nhân sự" }]}>
              <Select showSearch placeholder="Chọn nhân sự"
                      onChange={chonNhanSu}
                      filterOption={(nhap, opt) =>
                        (opt?.label ?? "").toLowerCase().includes(nhap.toLowerCase())}
                      options={dsNs.map((n) => ({
                        value: n.id,
                        label: n.chucDanh ? `${n.hoTen} — ${n.chucDanh}` : n.hoTen,
                      }))} />
            </Form.Item>
            <Form.Item name="soHd" label="Số hợp đồng"
                       tooltip="Như khuôn Excel: 01.2025">
              <Input placeholder="01.2025" />
            </Form.Item>
            <Form.Item name="ngayKy" label="Ngày ký">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="loaiHd" label="Loại hợp đồng lao động">
              <Select options={LOAI_HD} allowClear />
            </Form.Item>
            <Form.Item name="tuNgay" label="Thời gian từ">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="denNgay" label="Đến ngày"
                       tooltip="Để trống nếu hợp đồng không thời hạn">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="trangThai" label="Trạng thái">
              <Select allowClear options={[
                { value: "hieu_luc", label: "Hiệu lực" },
                { value: "het_han", label: "Hết hạn" },
                { value: "da_huy", label: "Đã hủy" },
              ]} />
            </Form.Item>
          </div>
        </div>

        <div className="hd-nhom">
          <h4>Bên sử dụng lao động</h4>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Chụp lại tại thời điểm ký — giám đốc đổi người thì hợp đồng cũ vẫn in đúng
            tên người đã ký.
          </Typography.Text>
          <div className="hd-luoi-form">
            <Form.Item name="nsdldHoTen" label="Ông/Bà"><Input /></Form.Item>
            <Form.Item name="nsdldChucVu" label="Chức vụ">
              <Input placeholder="Giám Đốc" />
            </Form.Item>
          </div>
          <Form.Item name="nsdldDaiDien" label="Đại diện cho"><Input /></Form.Item>
          <Form.Item name="nsdldDiaChi" label="Địa chỉ"><Input /></Form.Item>
        </div>

        <div className="hd-nhom">
          <h4>Điều 1 &amp; 2 — Công việc và chế độ làm việc</h4>
          <Form.Item name="diaDiemLv" label="Địa điểm làm việc"><Input /></Form.Item>
          <Form.Item name="congViec" label="Công việc phải làm">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div className="hd-luoi-form">
            <Form.Item name="thoiGianLv" label="Thời gian làm việc"><Input /></Form.Item>
            <Form.Item name="phuongTien" label="Phương tiện đi lại"><Input /></Form.Item>
          </div>
        </div>

        <div className="hd-nhom">
          <h4>Điều 3 — Lương và phụ cấp</h4>
          <div className="hd-luoi-form">
            <Form.Item name="luongChinh" label="Mức lương chính (đ/tháng)">
              <InputNumber style={{ width: "100%" }} min={0} step={100000}
                           formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
            </Form.Item>
            <Form.Item name="pcAnCa" label="Phụ cấp ăn ca (đ/ngày công)">
              <InputNumber style={{ width: "100%" }} min={0} step={5000}
                           formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
            </Form.Item>
            <Form.Item name="pcDienThoai" label="Phụ cấp điện thoại (đ/tháng)">
              <InputNumber style={{ width: "100%" }} min={0} step={100000}
                           formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
            </Form.Item>
            <Form.Item name="pcXangXe" label="Phụ cấp xăng xe (đ/tháng)">
              <InputNumber style={{ width: "100%" }} min={0} step={100000}
                           formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
            </Form.Item>
            <Form.Item name="pcKhac" label="Phụ cấp khác (đ/tháng)">
              <InputNumber style={{ width: "100%" }} min={0} step={100000}
                           formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
            </Form.Item>
            <Form.Item name="baoHoLd" label="Bảo hộ lao động"><Input /></Form.Item>
          </div>
          <Form.Item name="hinhThucTra" label="Hình thức trả lương"><Input /></Form.Item>
          <Form.Item name="thoaThuan" label="Những thoả thuận khác"
                     tooltip="Để trống thì in ra dùng nguyên ba gạch đầu dòng của khuôn Excel">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú (không in ra hợp đồng)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </div>
      </Form>

      <div className="hd-xem">
        <div className="hd-xem-dau">
          Mặt hợp đồng — đúng bản sẽ in ra giấy
        </div>
        <div className="hd-xem-giay">
          {banXem.nhanSuId > 0 ? (
            <>
              <style>{CSS_HD}</style>
              {/* Chuỗi do CHÍNH mình dựng từ mauInHopDong, mọi giá trị người dùng nhập
                  đều đã qua esc() ở đó — không phải HTML lạ từ ngoài vào. */}
              <div dangerouslySetInnerHTML={{ __html: htmlHopDong(banXem, tenDonVi) }} />
            </>
          ) : (
            <div className="hd-xem-trong">
              Chọn người lao động ở cột bên trái để dựng tờ hợp đồng
            </div>
          )}
        </div>
      </div>
      </div>
    </Modal>
  );
}
