// Màn hình DANH SÁCH PHIẾU — tổng hợp CẢ phiếu nhập LẪN phiếu xuất hàng.
//
// Vì sao cần một màn riêng: hai form nhập liệu mỗi cái chỉ thấy chiều của mình, mà việc
// thường ngày là "tra lại xem hôm qua đã lập những gì", "đơn nào chưa giao", "đơn nào
// còn ngoài gói". Nhìn một chiều thì phải mở hai màn rồi tự đối chiếu.
//
// Dữ liệu lấy trong MỘT lượt gọi (/nb/don/tat-ca) chứ không gọi hai chiều rồi trộn:
// trộn ở frontend thì mỗi chiều tự cắt TOP N của riêng nó, đơn ở giữa bị mất.
//
// Màn này CHỈ ĐỌC + mở sang form để sửa. Mọi luật nghiệp vụ (khóa đơn trong gói đã
// chốt — BR-NB-08) vẫn do backend giữ, đây chỉ hiện trạng thái cho người dùng biết trước.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, Space, Button, Tag, Typography, Input, Table, Select, message, Empty, Row, Col,
  Tooltip,
} from "antd";
import { EditOutlined, PrinterOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import {
  nbDanhSachDonTatCa, nbLuuGoi, nbGhepDonVaoGoi,
  nbLayDon, loiApi,
} from "../api";
import type { DonNb, HuongDon } from "../api";
import { useAuth } from "../AuthContext";
import { inPhieuDon } from "./mauInPhieu";
import "./phieu-xuat-nhap.css";

const soTien = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const ngayVn = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("vi-VN") : "";

const homNayIso = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const kieuSo: React.CSSProperties = {
  fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
  fontVariantNumeric: "tabular-nums",
};

// Nhãn theo chiều. RA = hàng đi ra (giao cho khách), VAO = hàng đi vào (nhập về).
const NHAN_HUONG: Record<HuongDon, { chu: string; mau: string; doiTac: string }> = {
  RA:  { chu: "Xuất hàng", mau: "red",  doiTac: "Khách hàng" },
  VAO: { chu: "Nhập hàng", mau: "blue", doiTac: "Nhà cung cấp" },
};

const THANG = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1, label: `Tháng ${i + 1}`,
}));

export default function DanhSachPhieu() {
  const nav = useNavigate();
  const { session } = useAuth();   // tên đơn vị in lên đầu tờ phiếu
  const [ds, setDs] = useState<DonNb[]>([]);
  const [tai, setTai] = useState(false);
  const [tu, setTu] = useState("");
  const [thang, setThang] = useState<number | undefined>();
  const [locHuong, setLocHuong] = useState<HuongDon | undefined>();
  // Tích chọn để GHÉP GÓI (BR-NB-08). Chọn ở đây chứ không phải trong màn Gói: người
  // dùng đang xem danh sách đơn thì chọn ngay tại chỗ mới thuận, chứ không phải nhớ
  // số đơn rồi sang màn khác gõ lại.
  const [dsChon, setDsChon] = useState<string[]>([]);

  const doc = useCallback(async (kw?: string, th?: number) => {
    setTai(true);
    try {
      const r = await nbDanhSachDonTatCa(th, kw, 500);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách phiếu"));
    } finally {
      setTai(false);
    }
  }, []);

  // Hoãn sang microtask: gọi thẳng trong thân effect thì setTai(true) chạy đồng bộ
  // ngay trong lượt render, sinh render dây chuyền.
  useEffect(() => {
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void doc(undefined, thang); });
    return () => { huy = true; };
  }, [doc, thang]);

  // Lọc chiều làm ở FE: dữ liệu đã có sẵn trong tay, bắn thêm lượt API chỉ để bỏ bớt
  // dòng là chậm hơn mà không được gì.
  const dsHien = useMemo(
    () => ds.filter((d) => !locHuong || d.huong === locHuong),
    [ds, locHuong]);

  // BR-NB-07: có ngay_nh = hàng đã rời kho, engine đã trừ tồn. Đếm để hiện
  // "đã xuất kho X / Y phiếu" — thủ kho nhìn là biết còn tồn bao nhiêu việc.
  const soDaXuat = useMemo(
    () => dsHien.filter((d) => !!d.ngayNh).length, [dsHien]);
  const soChuaGiao = dsHien.length - soDaXuat;

  // ---------- TẠO GÓI NHANH: một cú bấm, không hỏi gì ----------
  // Gói sinh ra từ CHÍNH mấy phiếu xuất đang tích, mã tự sinh G+số. KHÔNG bắt đặt tên:
  // tên/khu vực/NVVC chỉ là thứ ghi thêm cho dễ nhận ra chuyến, sửa sau ở màn Gói hàng
  // lúc nào cũng được — chặn người dùng ở đây chỉ làm chậm việc.
  const [dangTaoGoi, setDangTaoGoi] = useState(false);
  const taoGoiNhanh = useCallback(async () => {
    if (dsChon.length === 0) return;
    setDangTaoGoi(true);
    try {
      const g = await nbLuuGoi({ ngay: homNayIso() });
      const maGoi = g.data.maGoi;
      if (!maGoi) throw new Error("Không lấy được mã gói");
      await nbGhepDonVaoGoi(maGoi, dsChon);
      message.success(`Đã tạo gói ${maGoi} với ${dsChon.length} phiếu`);
      setDsChon([]);
      await doc(tu || undefined, thang);
    } catch (e) {
      message.error(loiApi(e, "Không tạo được gói"));
    } finally {
      setDangTaoGoi(false);
    }
  }, [dsChon, doc, tu, thang]);

  // Mở sang đúng form theo chiều của đơn. Form tự nhận ?maHd= rồi nạp đơn lên để sửa.
  const moDon = useCallback((d: DonNb) => {
    const duong = d.huong === "VAO" ? "/app/phieu-nhap" : "/app/phieu-xuat";
    nav(`${duong}?maHd=${encodeURIComponent(d.maHd ?? "")}`);
  }, [nav]);

  // ---------- In ngay tại danh sách, không phải mở form ----------
  // Dòng trong lưới chỉ có phần đầu đơn, KHÔNG có dòng hàng — phải gọi chi tiết
  // rồi mới in được. Ra thẳng hộp thoại in (hộp thoại đó đã có xem trước sẵn).
  const [dangIn, setDangIn] = useState<string | null>(null);
  const inDon = useCallback(async (d: DonNb) => {
    if (!d.maHd) return;
    setDangIn(d.maHd);
    try {
      // Phải gọi chi tiết mới có dòng hàng, rồi dùng ĐÚNG mẫu in dùng chung với form —
      // hai nơi in ra một tờ giấy y hệt nhau.
      const r = await nbLayDon(d.maHd);
      // Session chỉ mang name/code/dbName — KHÔNG có địa chỉ/điện thoại đơn vị, nên
      // chân trang tạm chỉ có giờ in. Muốn in đủ như Hoa_Sang thì phải bổ sung
      // Address/Phone vào LoginResponse.Tenant (backend) — chưa làm.
      inPhieuDon(r.data, { ten: session?.tenant.name });
    } catch (e) {
      message.error(loiApi(e, "Không in được phiếu"));
    } finally {
      setDangIn(null);
    }
  }, [session]);

  const cot = useMemo(() => [
    {
      title: "Loại", dataIndex: "huong", width: 110,
      render: (v: HuongDon | null) => {
        const n = v ? NHAN_HUONG[v] : null;
        return n ? <Tag color={n.mau}>{n.chu}</Tag> : "—";
      },
    },
    {
      title: "Số đơn", dataIndex: "maHd", width: 85,
      render: (v: string) => <span style={{ ...kieuSo, fontWeight: 600 }}>{v}</span>,
    },
    {
      title: "Ngày lập", dataIndex: "ngay", width: 100,
      render: (v: string | null) => ngayVn(v) || "—",
    },
    {
      // BR-NB-07: có ngày này = hàng đã rời kho, engine đã trừ tồn.
      title: "Ngày kho", dataIndex: "ngayNh", width: 115,
      render: (v: string | null) => v
        ? ngayVn(v)
        : <Tag color="orange">chưa giao</Tag>,
    },
    { title: "Đối tác", dataIndex: "tenKh", ellipsis: true },
    { title: "NV giao", dataIndex: "tenNvvc", width: 130, ellipsis: true },
    {
      title: "Gói", dataIndex: "maGoi", width: 85,
      render: (v: string | null) => (v ? <Tag color="purple">{v}</Tag> : "—"),
    },
    {
      title: "Tiền hàng", dataIndex: "tienHang", width: 120, align: "right" as const,
      render: (v: number) => <span style={kieuSo}>{soTien(Number(v) || 0)}</span>,
    },
    {
      title: "Tổng cộng", dataIndex: "tongTien", width: 130, align: "right" as const,
      render: (v: number) => <b style={kieuSo}>{soTien(Number(v) || 0)}</b>,
    },
    {
      // Nút biểu tượng cho gọn cột. Tooltip giữ lại chữ để người mới không phải đoán
      // hình vẽ nghĩa là gì.
      title: "", width: 80, align: "center" as const,
      render: (_: unknown, r: DonNb) => (
        <Space size={0}>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" type="link" icon={<EditOutlined />}
                    onClick={() => moDon(r)} />
          </Tooltip>
          <Tooltip title="In phiếu">
            <Button size="small" type="link" icon={<PrinterOutlined />}
                    loading={dangIn === r.maHd} onClick={() => inDon(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ], [moDon, inDon, dangIn]);

  return (
    <div className="pxn-trang">
      <Card
        size="small"
        style={{ borderTop: "4px solid #0f766e" }}
        title={
          <Typography.Text strong
                           style={{ fontSize: 19, color: "#0f766e", letterSpacing: 0.4 }}>
            DANH SÁCH PHIẾU
          </Typography.Text>
        }
        extra={
          <Space>
            <Button onClick={() => nav("/app/phieu-nhap")}>+ Phiếu nhập</Button>
            <Button type="primary" onClick={() => nav("/app/phieu-xuat")}>
              + Phiếu xuất hàng
            </Button>
          </Space>
        }
        styles={{ body: { padding: "10px 14px" } }}
      >
        {/* ---------- Thanh lọc ---------- */}
        <Row gutter={[10, 8]} style={{ marginBottom: 10 }}>
          <Col xs={24} md={8}>
            <div className="pxn__nhan">Tìm</div>
            <Input.Search
              placeholder="Số đơn hoặc tên đối tác"
              value={tu}
              onChange={(e) => setTu(e.target.value)}
              onSearch={(v) => doc(v, thang)}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="pxn__nhan">Tháng</div>
            <Select allowClear style={{ width: "100%" }} placeholder="Cả năm"
                    value={thang} onChange={setThang} options={THANG} />
          </Col>
          <Col xs={12} md={4}>
            <div className="pxn__nhan">Loại phiếu</div>
            <Select allowClear style={{ width: "100%" }} placeholder="Cả hai"
                    value={locHuong} onChange={setLocHuong}
                    options={[
                      { value: "RA", label: "Phiếu xuất hàng" },
                      { value: "VAO", label: "Phiếu nhập hàng" },
                    ]} />
          </Col>
          <Col xs={24} md={8}>
            {/* BR-NB-07: "đã xuất kho" = đã có ngay_nh, tức engine đã trừ tồn.
                Hiện thẳng con số thay vì nút bấm — nhìn là biết còn tồn bao nhiêu việc,
                không phải bấm lọc mới thấy. */}
            <div className="pxn__nhan">Trạng thái kho</div>
            <div style={{ height: 32, display: "flex", alignItems: "center" }}>
              <Typography.Text>
                Đã xuất kho{" "}
                <b style={{ ...kieuSo, fontSize: 16 }}>{soDaXuat}</b>
                <Typography.Text type="secondary"> / {dsHien.length} phiếu</Typography.Text>
                {soChuaGiao > 0 && (
                  <Tag color="orange" style={{ marginLeft: 8 }}>
                    còn {soChuaGiao} chưa giao
                  </Tag>
                )}
              </Typography.Text>
            </div>
          </Col>
        </Row>

        <div style={{ marginBottom: 10 }}>
          <Tooltip title={dsChon.length === 0
            ? "Tích chọn phiếu xuất ở cột đầu rồi bấm để tạo gói" : ""}>
            <Button type="primary" loading={dangTaoGoi}
                    disabled={dsChon.length === 0} onClick={taoGoiNhanh}>
              Tạo gói{dsChon.length > 0 ? ` (${dsChon.length} phiếu)` : ""}
            </Button>
          </Tooltip>
        </div>

        <Table
          rowKey="maHd"
          size="small"
          loading={tai}
          dataSource={dsHien}
          columns={cot}
          rowSelection={{
            selectedRowKeys: dsChon,
            onChange: (k) => setDsChon(k as string[]),
            getCheckboxProps: (r) => ({
              disabled: r.huong !== "RA" || !!r.maGoi,
            }),
          }}
          pagination={{ pageSize: 20, showSizeChanger: true,
                        showTotal: (t) => `${t} phiếu` }}
          locale={{ emptyText: <Empty description="Chưa có phiếu nào" /> }}
          onRow={(r) => ({ onDoubleClick: () => moDon(r) })}
        />
      </Card>

    </div>
  );
}
