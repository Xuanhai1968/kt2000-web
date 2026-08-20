// DANH MỤC KHUYẾN MÃI (DM_KM_NB, script 018) — "mua N tặng M".
//
// Bê từ USA_Meva (pages/PromotionPage.tsx) nhưng CẮT theo dữ liệu thật: bên nguồn bảng
// Promotions có 26 cột đủ kiểu KM, mà 27/27 dòng đều là BUY_GET, bộ cột giảm giá NULL
// sạch. Nên màn này chỉ làm "mua N tặng M"; thêm kiểu KM khác thì mở rộng sau.
//
// HAI ĐIỀU DỄ HIỂU NHẦM, đã dựng hẳn vào giao diện:
//
// 1) KM GẮN THEO QUY CÁCH, không phải theo mặt hàng. H00021 có BA khuyến mãi:
//    mua 10 thùng tặng 2, mua 5 thùng tặng 1, và mua 3 hộp 5L tặng 1 hộp 5L.
//    Vì vậy ô "Quy cách mua" là bắt buộc, và bảng gom nhóm theo mặt hàng cho dễ soi.
//
// 2) QUY CÁCH TẶNG CÓ THỂ KHÁC QUY CÁCH MUA (KM0018: mua 3 thùng 18L tặng 1 hộp 5L).
//    Ô "Quy cách tặng" để trống = tặng đúng quy cách đã mua (26/27 dòng gốc như vậy).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, DatePicker, Space, Tag,
  Typography, Popconfirm, message, Tooltip, Select,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { nbTimKm, nbLuuKm, nbXoaKm, nbTimHang } from "../../../api";
import type { DmKmNb, DmHangNb, QuyCachNb } from "../../../api";
import OGoiYUsa, { type LuaChon } from "./OGoiYUsa";

const kieuSo: React.CSSProperties = {
  fontFamily: "ui-monospace, Consolas, monospace",
  fontVariantNumeric: "tabular-nums",
};

const loiApi = (e: unknown, mac: string) => {
  const r = e as { response?: { data?: { message?: string } } };
  return r?.response?.data?.message ?? mac;
};

// KM còn hiệu lực theo mốc hôm nay. Backend cũng lọc được (chiConHieuLuc) nhưng màn này
// lấy HẾT để còn sửa KM đã hết hạn — nên trạng thái phải tự tính ở đây.
const trangThai = (k: DmKmNb): { chu: string; mau: string } | null => {
  const nay = dayjs().startOf("day");
  if (k.tuNgay && dayjs(k.tuNgay).isAfter(nay)) return { chu: "chưa tới", mau: "blue" };
  if (k.denNgay && dayjs(k.denNgay).isBefore(nay)) return { chu: "hết hạn", mau: "default" };
  return null;   // đang chạy — không cần thẻ, đỡ rối mắt
};

export default function KhuyenMaiUsa() {
  const [ds, setDs] = useState<DmKmNb[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [tu, setTu] = useState("");
  const [mo, setMo] = useState(false);
  const [dangSua, setDangSua] = useState<DmKmNb | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [form] = Form.useForm();

  // Quy cách của mặt hàng đang chọn trong modal — nuôi hai ô ĐVT.
  // Nhớ theo mã hàng: mở sửa dòng khác cùng mặt hàng thì không phải gọi lại.
  const [cacQuyCach, setCacQuyCach] = useState<QuyCachNb[]>([]);
  const [tenHangHien, setTenHangHien] = useState("");

  // KHÔNG đặt setDangTai(true) ở đầu hàm: lần nạp đầu gọi từ trong useEffect, mà đặt
  // state đồng bộ ngay trong thân effect sẽ vẽ thừa một lượt (react-hooks/
  // set-state-in-effect chặn đúng chỗ này). Cờ tải bật ở NGƯỜI GỌI khi bấm tay, còn
  // lần đầu thì dangTai đã là true sẵn từ useState.
  const nap = useCallback(async (tuKhoa?: string) => {
    try {
      const r = await nbTimKm(tuKhoa || undefined, 500, 0, false);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không tải được danh sách khuyến mãi"));
    } finally {
      setDangTai(false);
    }
  }, []);

  // Nạp lại có hiện vòng quay — dùng cho nút Tải lại / tìm kiếm / sau khi lưu.
  const napLai = useCallback((tuKhoa?: string) => {
    setDangTai(true);
    void nap(tuKhoa);
  }, [nap]);

  // nap() gọi API rồi mới setState trong nhánh await — KHÔNG phải setState đồng bộ
  // trong thân effect. Luật lint không phân biệt được nên phải tắt đúng dòng này
  // (cùng cách DanhSachPhieuUsa.tsx đang làm).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void nap(); }, [nap]);

  // Ô gợi ý mặt hàng — dùng lại đúng ô của form đánh đơn để nhịp gõ giống nhau.
  const timHang = useCallback(async (chu: string, boQua = 0): Promise<LuaChon<string>[]> => {
    const r = await nbTimHang(chu, 100, boQua);
    return r.data.filter((h) => h.maHang).map((h) => ({
      giaTri: h.maHang!,
      nhan: `${h.tenHang} ${h.maHang ?? ""} ${h.tenTat ?? ""}`,
      nhanHien: h.tenHang,
      cot: [h.tenHang, h.dvt ?? ""],
    }));
  }, []);

  // Chọn mặt hàng -> nạp quy cách của nó vào hai ô ĐVT.
  // nbTimHang trả kèm quyCach2 nên không phải gọi thêm vòng nào.
  const chonHang = useCallback(async (maHang: string | null) => {
    form.setFieldsValue({ maHang, maDvt: undefined, maDvtTang: undefined });
    if (!maHang) { setCacQuyCach([]); setTenHangHien(""); return; }
    try {
      const r = await nbTimHang(maHang, 20, 0);
      const h: DmHangNb | undefined = r.data.find((x) => x.maHang === maHang);
      setCacQuyCach(h?.quyCach2 ?? []);
      setTenHangHien(h?.tenHang ?? "");
      // Chỉ một quy cách thì chọn sẵn — đỡ một thao tác cho 23/50 mặt hàng như vậy.
      const qc = h?.quyCach2 ?? [];
      if (qc.length === 1) form.setFieldValue("maDvt", qc[0].maDvt);
      else {
        const goc = qc.find((x) => x.laDvtGoc);
        if (goc) form.setFieldValue("maDvt", goc.maDvt);
      }
    } catch {
      setCacQuyCach([]);
    }
  }, [form]);

  const moThem = () => {
    setDangSua(null);
    setCacQuyCach([]);
    setTenHangHien("");
    form.resetFields();
    setMo(true);
  };

  const moSua = async (k: DmKmNb) => {
    setDangSua(k);
    setTenHangHien(k.tenHang ?? "");
    form.setFieldsValue({
      tenKm: k.tenKm,
      maHang: k.maHang,
      maDvt: k.maDvt,
      maDvtTang: k.maDvtTang,
      slMua: k.slMua,
      slTang: k.slTang,
      khoangNgay: k.tuNgay || k.denNgay
        ? [k.tuNgay ? dayjs(k.tuNgay) : null, k.denNgay ? dayjs(k.denNgay) : null]
        : undefined,
      ghiChu: k.ghiChu,
    });
    setMo(true);
    // Nạp quy cách SAU khi đã đổ form: chonHang() xóa hai ô ĐVT nên gọi trước sẽ mất
    // giá trị vừa đặt. Ở đây chỉ lấy danh sách, không đụng vào form.
    try {
      const r = await nbTimHang(k.maHang, 20, 0);
      setCacQuyCach(r.data.find((x) => x.maHang === k.maHang)?.quyCach2 ?? []);
    } catch {
      setCacQuyCach([]);
    }
  };

  const luu = async () => {
    const v = await form.validateFields();
    setDangLuu(true);
    try {
      const [tuN, denN] = (v.khoangNgay ?? []) as (dayjs.Dayjs | null)[];
      await nbLuuKm({
        maKm: dangSua?.maKm ?? null,
        tenKm: v.tenKm,
        maHang: v.maHang,
        maDvt: v.maDvt,
        // Bỏ trống = tặng đúng quy cách đã mua (backend cũng tự bù, gửi rỗng cho rõ ý)
        maDvtTang: v.maDvtTang || v.maDvt,
        slMua: Number(v.slMua) || 0,
        slTang: Number(v.slTang) || 0,
        tuNgay: tuN ? tuN.format("YYYY-MM-DD") : null,
        denNgay: denN ? denN.format("YYYY-MM-DD") : null,
        ghiChu: v.ghiChu || null,
      });
      message.success(dangSua ? "Đã cập nhật khuyến mãi" : "Đã thêm khuyến mãi");
      setMo(false);
      napLai(tu);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được khuyến mãi"));
    } finally {
      setDangLuu(false);
    }
  };

  const xoa = async (k: DmKmNb) => {
    if (!k.maKm) return;
    try {
      await nbXoaKm(k.maKm);
      message.success(`Đã xóa ${k.maKm}`);
      napLai(tu);
    } catch (e) {
      message.error(loiApi(e, "Không xóa được khuyến mãi"));
    }
  };

  // Gợi ý tên KM theo số vừa gõ ("Mua 10 tặng 2") — người khai gần như luôn đặt vậy,
  // và bên nguồn 27/27 dòng đều theo mẫu này.
  const tuDatTen = () => {
    const mua = form.getFieldValue("slMua");
    const tang = form.getFieldValue("slTang");
    if (mua > 0 && tang > 0 && !form.getFieldValue("tenKm"))
      form.setFieldValue("tenKm", `Mua ${mua} tặng ${tang}`);
  };

  const cot = useMemo(() => [
    {
      title: "Mã KM", dataIndex: "maKm", width: 90,
      render: (v: string) => <span style={{ ...kieuSo, fontWeight: 600 }}>{v}</span>,
    },
    {
      title: "Mặt hàng", dataIndex: "tenHang", ellipsis: true,
      render: (v: string | null, r: DmKmNb) => (
        <Tooltip title={r.maHang}>{v || <i style={{ color: "#b91c1c" }}>
          {r.maHang} (không còn trong danh mục)</i>}</Tooltip>
      ),
    },
    {
      title: "Điều kiện", width: 200,
      render: (_: unknown, r: DmKmNb) => (
        <span>
          Mua <b style={kieuSo}>{r.slMua}</b>{" "}
          <Tag>{r.tenDvt || r.maDvt}</Tag>
        </span>
      ),
    },
    {
      title: "Được tặng", width: 200,
      render: (_: unknown, r: DmKmNb) => (
        <span>
          <b style={{ ...kieuSo, color: "#15803d" }}>{r.slTang}</b>{" "}
          <Tag color={r.maDvtTang !== r.maDvt ? "green" : undefined}>
            {r.tenDvtTang || r.maDvtTang}
          </Tag>
        </span>
      ),
    },
    {
      title: "Hiệu lực", width: 190,
      render: (_: unknown, r: DmKmNb) => {
        const t = trangThai(r);
        if (!r.tuNgay && !r.denNgay)
          return <span style={{ color: "#94a3b8" }}>không giới hạn</span>;
        return (
          <Space size={4}>
            <span style={{ fontSize: 12 }}>
              {r.tuNgay ? dayjs(r.tuNgay).format("DD/MM/YYYY") : "…"}
              {" – "}
              {r.denNgay ? dayjs(r.denNgay).format("DD/MM/YYYY") : "…"}
            </span>
            {t && <Tag color={t.mau}>{t.chu}</Tag>}
          </Space>
        );
      },
    },
    { title: "Ghi chú", dataIndex: "ghiChu", ellipsis: true },
    {
      title: "", width: 80, align: "center" as const,
      render: (_: unknown, r: DmKmNb) => (
        <Space size={0}>
          <Tooltip title="Sửa">
            <Button size="small" type="link" icon={<EditOutlined />}
                    onClick={() => void moSua(r)} />
          </Tooltip>
          <Popconfirm title={`Xóa ${r.maKm}?`}
                      description="Đơn đã lập không bị ảnh hưởng."
                      okText="Xóa" cancelText="Thôi"
                      onConfirm={() => void xoa(r)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tu]);

  return (
    <Card
      size="small"
      style={{ borderTop: "4px solid #7c3aed" }}
      title={
        <Space>
          <Typography.Text strong
                           style={{ fontSize: 19, color: "#7c3aed", letterSpacing: 0.4 }}>
            KHUYẾN MÃI
          </Typography.Text>
          <Tag>{ds.length}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="Tìm theo mã KM / tên / mặt hàng"
            style={{ width: 280 }}
            onSearch={(v) => { setTu(v); napLai(v); }}
          />
          <Tooltip title="Tải lại">
            <Button icon={<ReloadOutlined />} onClick={() => napLai(tu)} />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={moThem}>
            Thêm khuyến mãi
          </Button>
        </Space>
      }
    >
      <Table<DmKmNb>
        size="small"
        rowKey={(r) => r.maKm ?? ""}
        loading={dangTai}
        dataSource={ds}
        columns={cot}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} khuyến mãi` }}
      />

      <Modal
        open={mo}
        title={dangSua ? `Sửa khuyến mãi ${dangSua.maKm}` : "Thêm khuyến mãi"}
        onCancel={() => setMo(false)}
        onOk={() => void luu()}
        confirmLoading={dangLuu}
        okText="Lưu"
        cancelText="Hủy"
        width={620}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item label="Mặt hàng" required
                     help={tenHangHien || undefined}>
            <Form.Item name="maHang" noStyle
                       rules={[{ required: true, message: "Chưa chọn mặt hàng" }]}>
              <input type="hidden" />
            </Form.Item>
            {/* Sửa KM thì KHÔNG cho đổi mặt hàng: đổi sang hàng khác là một KM khác
                hẳn, mà số lượng/quy cách cũ ở lại thì thành cấu hình vô nghĩa.
                Muốn đổi thì xóa rồi thêm mới. */}
            {dangSua ? (
              <Input value={`${dangSua.maHang} — ${tenHangHien}`} readOnly />
            ) : (
              <OGoiYUsa
                giaTri={null}
                timKiem={timHang}
                kieuCot="hh3"
                rongToiThieu={520}
                goiY="Gõ tên hàng để chọn"
                onChon={(v) => void chonHang(v)}
              />
            )}
          </Form.Item>

          <Space align="start" size={12} style={{ display: "flex" }}>
            <Form.Item label="Quy cách phải mua" name="maDvt" style={{ width: 190 }}
                       rules={[{ required: true, message: "Chưa chọn quy cách" }]}>
              <Select
                placeholder={cacQuyCach.length ? "Chọn quy cách" : "Chọn mặt hàng trước"}
                disabled={!cacQuyCach.length}
                options={cacQuyCach.map((q) => ({
                  value: q.maDvt,
                  label: q.tenTat || q.tenDvt || q.maDvt,
                }))}
              />
            </Form.Item>
            <Form.Item label="Số lượng mua" name="slMua" style={{ width: 130 }}
                       rules={[{ required: true, message: "Nhập số lượng" }]}>
              <InputNumber min={0.001} style={{ width: "100%" }} onBlur={tuDatTen} />
            </Form.Item>
          </Space>

          <Space align="start" size={12} style={{ display: "flex" }}>
            <Form.Item
              label="Quy cách tặng" name="maDvtTang" style={{ width: 190 }}
              tooltip="Để trống = tặng đúng quy cách đã mua"
            >
              <Select
                allowClear
                placeholder="Như quy cách mua"
                disabled={!cacQuyCach.length}
                options={cacQuyCach.map((q) => ({
                  value: q.maDvt,
                  label: q.tenTat || q.tenDvt || q.maDvt,
                }))}
              />
            </Form.Item>
            <Form.Item label="Số lượng tặng" name="slTang" style={{ width: 130 }}
                       rules={[{ required: true, message: "Nhập số lượng" }]}>
              <InputNumber min={0.001} style={{ width: "100%" }} onBlur={tuDatTen} />
            </Form.Item>
          </Space>

          <Form.Item label="Tên khuyến mãi" name="tenKm"
                     rules={[{ required: true, message: "Nhập tên khuyến mãi" }]}>
            <Input placeholder="vd: Mua 10 tặng 2" />
          </Form.Item>

          <Form.Item label="Hiệu lực" name="khoangNgay"
                     tooltip="Để trống = chạy vô thời hạn. Hết KM thì đặt ngày kết thúc.">
            <DatePicker.RangePicker format="DD/MM/YYYY" allowEmpty={[true, true]}
                                    style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="Ghi chú" name="ghiChu">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
