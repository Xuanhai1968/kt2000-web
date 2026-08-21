import { useEffect, useState } from "react";
import {
  Modal, Table, Button, Space, Input, Form, DatePicker, Checkbox, Tag, Tooltip,
  Typography, message,
} from "antd";
import {
  TeamOutlined, PlusOutlined, PrinterOutlined,
  EditOutlined, DeleteOutlined, ExclamationCircleFilled,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { nsDanhSach, nsThem, nsSua, nsXoa, loiApi } from "../../api";
import type { NhanSu } from "../../api";
import { useChieuCaoBang } from "./dungBang";
import { inGiay, esc, khoiDau } from "../inGiay";
import { ngayNgan } from "./dinhDang";
import "./hop-dong.css";

interface Props {
  mo: boolean;
  onDong: () => void;
  maDonVi?: string;
  tenDonVi?: string | null;
  xemTruoc?: NhanSu[] | null;
}

// Ngày trong DB là ISO, còn DatePicker cần dayjs — đổi qua lại ở một chỗ để form
// không rải dayjs() khắp nơi.
const sangNgay = (s: string | null | undefined) =>
  s ? dayjs(s.slice(0, 10)) : null;

export default function DanhSachNhanSu(
  { mo, onDong, maDonVi, tenDonVi, xemTruoc }: Props,
) {
  // Chế độ xem trước: dữ liệu tới từ nháp, chưa nằm trong sổ.
  const laXemTruoc = xemTruoc != null;
  // maDonVi trống nghĩa là đơn vị đang đăng nhập — vẫn cần một nhãn để đặt tên file
  // và in lên đầu trang, nên lùi dần: tên → mã → chữ chung.
  const nhanDonVi = tenDonVi || maDonVi || "đơn vị";

  // Chiều cao thân bảng: trừ lề modal + đầu modal + thanh nút + hàng tiêu đề.
  // Truyền vào scroll.y chứ không ép bằng CSS — xem dungBang.ts.
  const caoBang = useChieuCaoBang(210);
  const maFile = (maDonVi || "DON_VI").replace(/[^\w]/g, "_");
  const [ds, setDs] = useState<NhanSu[]>([]);
  const [tai, setTai] = useState(false);
  const [caNguoiDaNghi, setCaNguoiDaNghi] = useState(false);
  const [timKiem, setTimKiem] = useState("");

  const [moForm, setMoForm] = useState(false);
  const [dangSua, setDangSua] = useState<NhanSu | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [form] = Form.useForm();

  const nap = async () => {
    // Nháp: lấy thẳng, không gọi API. Vẫn lọc "đã nghỉ" cho giống hệt lúc đã lưu.
    if (xemTruoc) {
      setDs(caNguoiDaNghi ? xemTruoc : xemTruoc.filter((x) => x.dangLam));
      return;
    }

    setTai(true);
    try {
      const r = await nsDanhSach(maDonVi, caNguoiDaNghi);
      setDs(r.data);
    } catch (e) {
      setDs([]);
      message.error(loiApi(e, "Không đọc được danh sách nhân sự"));
    } finally {
      setTai(false);
    }
  };

  useEffect(() => {
    if (!mo) return;
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, caNguoiDaNghi, xemTruoc]);

  const loc = ds.filter((x) => {
    const k = timKiem.trim().toLowerCase();
    if (!k) return true;
    return [x.hoTen, x.maNs, x.soCmnd, x.chucDanh, x.ngheNghiep, x.boPhan]
      .some((v) => (v ?? "").toLowerCase().includes(k));
  });

  const moThem = () => {
    setDangSua(null);
    form.resetFields();
    form.setFieldsValue({ quocTich: "Việt Nam", dangLam: true });
    setMoForm(true);
  };

  const moSua = (x: NhanSu) => {
    setDangSua(x);
    form.setFieldsValue({
      ...x,
      ngaySinh: sangNgay(x.ngaySinh),
      ngayCap: sangNgay(x.ngayCap),
      ngayVao: sangNgay(x.ngayVao),
      ngayNghi: sangNgay(x.ngayNghi),
    });
    setMoForm(true);
  };

  const luu = async () => {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); } catch { return; }

    // DatePicker trả dayjs, backend cần ISO — đổi ngay trước khi gửi.
    const than = {
      ...v,
      ngaySinh: v.ngaySinh ? dayjs(v.ngaySinh as dayjs.Dayjs).format("YYYY-MM-DD") : null,
      ngayCap: v.ngayCap ? dayjs(v.ngayCap as dayjs.Dayjs).format("YYYY-MM-DD") : null,
      ngayVao: v.ngayVao ? dayjs(v.ngayVao as dayjs.Dayjs).format("YYYY-MM-DD") : null,
      ngayNghi: v.ngayNghi ? dayjs(v.ngayNghi as dayjs.Dayjs).format("YYYY-MM-DD") : null,
    } as Partial<NhanSu>;

    setDangLuu(true);
    try {
      const r = dangSua
        ? await nsSua(dangSua.id, than, maDonVi)
        : await nsThem(than, maDonVi);
      message.success(r.data.message);
      setMoForm(false);
      await nap();
    } catch (e) {
      message.error(loiApi(e, "Không lưu được nhân sự"));
    } finally {
      setDangLuu(false);
    }
  };

  const xoa = (x: NhanSu) => {
    Modal.confirm({
      title: "Xóa nhân sự?",
      icon: <ExclamationCircleFilled style={{ color: "#cf1322" }} />,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div><b>{x.hoTen}</b>{x.chucDanh ? ` — ${x.chucDanh}` : ""}</div>
          {x.soHopDong > 0 && (
            <div style={{ marginTop: 8, color: "#d46b08" }}>
              Người này đã có <b>{x.soHopDong}</b> hợp đồng — phải xóa hợp đồng trước,
              hoặc chỉ cần bỏ tích <b>Đang làm</b> để đánh dấu đã nghỉ.
            </div>
          )}
        </div>
      ),
      okText: "Xóa", okButtonProps: { danger: true }, cancelText: "Hủy",
      onOk: async () => {
        try {
          const r = await nsXoa(x.id, maDonVi);
          message.success(r.data.message);
          await nap();
        } catch (e) {
          message.error(loiApi(e, "Không xóa được nhân sự"));
        }
      },
    });
  };

  const inDs = () => {
    if (loc.length === 0) { message.info("Không có dòng nào để in"); return; }

    const hang = loc.map((x, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(x.maNs ?? "")}</td>
        <td>${esc(x.hoTen)}</td>
        <td class="c">${ngayNgan(x.ngaySinh)}</td>
        <td class="c">${esc(x.gioiTinh ?? "")}</td>
        <td>${esc(x.soCmnd ?? "")}</td>
        <td>${esc(x.chucDanh ?? x.ngheNghiep ?? "")}</td>
        <td>${esc(x.boPhan ?? "")}</td>
        <td class="c">${ngayNgan(x.ngayVao)}</td>
        <td class="c">${x.dangLam ? "x" : ""}</td>
      </tr>`).join("");

    inGiay(`DS_NHAN_SU_${maFile}`, `
      <div class="pxk">
        ${khoiDau(nhanDonVi)}
        <div class="pxk__title">DANH SÁCH NHÂN SỰ</div>
        <div class="pxk__subtitle">${esc(nhanDonVi)} — ${loc.length} người</div>
        <table class="pxk__items">
          <thead>
            <tr>
              <th style="width:36px">STT</th>
              <th style="width:60px">Mã NS</th>
              <th>Họ và tên</th>
              <th style="width:80px">Ngày sinh</th>
              <th style="width:52px">G.tính</th>
              <th style="width:110px">Số CMND</th>
              <th style="width:130px">Chức danh</th>
              <th style="width:100px">Bộ phận</th>
              <th style="width:80px">Ngày vào</th>
              <th style="width:56px">Đang làm</th>
            </tr>
          </thead>
          <tbody>${hang}</tbody>
        </table>
      </div>`, "A4 landscape");
  };

  const COT: ColumnsType<NhanSu> = [
    { title: "STT", width: 50, align: "center",
      render: (_, __, i) => i + 1 },
    { title: "Mã NS", dataIndex: "maNs", width: 80 },
    { title: "Họ và tên", dataIndex: "hoTen", width: 200, ellipsis: true,
      render: (v: string) => <b>{v}</b> },
    { title: "Ngày sinh", dataIndex: "ngaySinh", width: 100, align: "center",
      render: (v: string | null) => ngayNgan(v) },
    { title: "Số CMND/CCCD", dataIndex: "soCmnd", width: 130 },
    { title: "Chức danh", dataIndex: "chucDanh", width: 150, ellipsis: true },
    { title: "Bộ phận", dataIndex: "boPhan", width: 120, ellipsis: true },
    { title: "Điện thoại", dataIndex: "dienThoai", width: 110 },
    { title: "Số HĐ", dataIndex: "soHopDong", width: 70, align: "center",
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : "" },
    { title: "Đang làm", dataIndex: "dangLam", width: 90, align: "center",
      render: (v: boolean) => v ? <Tag color="green">Đang làm</Tag>
                                : <Tag color="default">Đã nghỉ</Tag> },
    { title: "", width: 76, align: "center", fixed: "right",
      render: (_, m) => (
        <Space size={0}>
          <Tooltip title={laXemTruoc
            ? "Đang xem trước nháp — chưa sửa được" : "Sửa nhân sự"}>
            <Button type="text" size="small" icon={<EditOutlined />}
                    disabled={laXemTruoc} onClick={() => moSua(m)} />
          </Tooltip>
          <Tooltip title={laXemTruoc
            ? "Đang xem trước nháp — chưa xóa được" : "Xóa nhân sự"}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    disabled={laXemTruoc} onClick={() => xoa(m)} />
          </Tooltip>
        </Space>
      ) },
  ];

  return (
    <>
      <Modal
        className="danh-sach-nhan-su"
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Danh sách nhân sự
            {maDonVi && <> — <b>{maDonVi}</b></>}
            {tenDonVi && <span className="hd-ten-dv"> · {tenDonVi}</span>}
            {/* Nhãn ngay trên tiêu đề: mở modal ra là biết đang xem nháp hay xem sổ,
                không phải đoán qua việc mấy nút bị mờ. */}
            {laXemTruoc && (
              <Tag color="orange" style={{ marginLeft: 10 }}>
                XEM TRƯỚC — chưa lưu vào sổ
              </Tag>
            )}
          </span>
        }
        open={mo}
        onCancel={onDong}
        footer={null}
        width="96vw"
        style={{ top: 12, maxWidth: "96vw" }}
        styles={{
        // Vỏ modal cao CỐ ĐỊNH hết màn, không co theo nội dung: bảng bên
        // trong tự ăn hết phần còn lại. Để antd tự tính thì modal cao theo
        // nội dung, mà nội dung lại chờ modal — bảng teo còn vài dòng.
        // "container" = khối .ant-modal-content trong antd bản này (không phải
        // "content" — tên đó không có trong styles).
        container: { display: "flex", flexDirection: "column",
                     height: "calc(100vh - 32px)" },
        body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 8 },
      }}
      >
        <div className="hd-modal">
          <Space size={8} wrap className="hd-thanh">
            <Button type="primary" icon={<PlusOutlined />} onClick={moThem}
                    disabled={laXemTruoc}
                    title={laXemTruoc
                      ? "Đang xem trước nháp — lưu vào sổ rồi mới thêm được"
                      : "Thêm một nhân sự vào sổ"}>
              Thêm nhân sự
            </Button>
            <Input.Search size="small" allowClear style={{ width: 300 }}
                   placeholder="Tìm theo tên, mã, CMND, chức danh"
                   value={timKiem}
                   onChange={(e) => setTimKiem(e.target.value)} />
            <Checkbox checked={caNguoiDaNghi}
                      onChange={(e) => setCaNguoiDaNghi(e.target.checked)}>
              Hiện cả người đã nghỉ
            </Checkbox>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {loc.length}/{ds.length} người
            </Typography.Text>
            <span style={{ flex: 1 }} />
            <Button icon={<PrinterOutlined />} onClick={inDs}
                    title="In danh sách đang lọc">
              Print
            </Button>
          </Space>

          <div className="hd-vung-bang">
            <Table<NhanSu>
              className="hd-bang"
              size="small"
              rowKey="id"
              dataSource={loc}
              columns={COT}
              loading={tai}
              pagination={false}
              scroll={{ x: 1250, y: caoBang }}
              onRow={(m) => ({
                onDoubleClick: () => { if (!laXemTruoc) moSua(m); },
              })}
              locale={{ emptyText: ds.length === 0
                ? (laXemTruoc
                    ? "File vừa đọc không có nhân sự nào"
                    : "Đơn vị này chưa có nhân sự nào — bấm Thêm nhân sự")
                : "Không ai khớp từ khóa đang tìm" }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={dangSua ? `Sửa nhân sự — ${dangSua.hoTen}` : "Thêm nhân sự"}
        open={moForm}
        onCancel={() => setMoForm(false)}
        onOk={() => void luu()}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={dangLuu}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" className="hd-form">
          <div className="hd-luoi-form">

            <Form.Item name="maNs" label="Mã NS">
              <Input placeholder={dangSua ? "" : "Bỏ trống = tự cấp NS00001"} />
            </Form.Item>
            <Form.Item name="hoTen" label="Họ và tên"
                       rules={[{ required: true, message: "Phải có họ tên" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="ngaySinh" label="Ngày sinh">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="gioiTinh" label="Giới tính"><Input /></Form.Item>
            <Form.Item name="quocTich" label="Quốc tịch"><Input /></Form.Item>
            <Form.Item name="soCmnd" label="Số CMND/CCCD"><Input /></Form.Item>
            <Form.Item name="ngayCap" label="Ngày cấp">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="noiCap" label="Nơi cấp"><Input /></Form.Item>
            <Form.Item name="ngheNghiep" label="Nghề nghiệp"><Input /></Form.Item>
            <Form.Item name="chucDanh" label="Chức danh chuyên môn"><Input /></Form.Item>
            <Form.Item name="chucVu" label="Chức vụ"><Input /></Form.Item>
            <Form.Item name="boPhan" label="Bộ phận"><Input /></Form.Item>
            <Form.Item name="dienThoai" label="Điện thoại"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="soBhxh" label="Số BHXH"><Input /></Form.Item>
            <Form.Item name="mstNs" label="MST cá nhân"><Input /></Form.Item>
            <Form.Item name="ngayVao" label="Ngày vào làm">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="ngayNghi" label="Ngày nghỉ">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item name="diaChi" label="Địa chỉ"><Input /></Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="dangLam" valuePropName="checked" noStyle>
            <Checkbox>Đang làm việc</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
