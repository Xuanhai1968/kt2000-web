// Màn hình GÓI HÀNG (BR-NB-08) — mục RIÊNG trên màn hình chính, không nằm trong
// Phiếu giao hàng, vì vòng đời gói kéo dài sang cả THU TIỀN theo gói (SPEC mục 1).
//
// Gói = nhóm đơn giao cùng chuyến / cùng khu vực (vd "gói phố Đại Từ"), một NVVC phụ trách.
//
// VÒNG ĐỜI (bốn nấc, không nhảy cóc) — BR-NB-08:
//   moi   — vừa lập, còn ghép/rút đơn thoải mái
//   chot  — sinh PHIẾU GÓI (snapshot gộp mặt hàng); đơn con BỊ KHÓA SỬA
//   xuat  — đóng dấu ngay_nh hàng loạt cho mọi đơn con -> lúc này kho mới thật sự mất hàng
//   huy   — bỏ gói
//
// Vì sao CHỐT rồi mới XUẤT: chốt sinh tờ phiếu cho kho đi gom hàng; xuất là lúc xe lăn
// bánh. Muốn sửa đơn đã vào gói chốt thì phải RÚT đơn ra, gói tự lùi về 'moi' và snapshot
// cũ bị xóa — nhờ vậy tờ phiếu cầm trên tay không bao giờ lệch với xe chở.
//
// Hạch toán tồn kho / giá vốn / công nợ vẫn chạy theo TỪNG ĐƠN CON (BR-NB-07): gói chỉ
// là chứng từ TÁC NGHIỆP KHO, vì mỗi đơn là nợ của một khách khác nhau.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, Row, Col, Space, Button, Tag, Typography, Input, Table, Modal,
  message, Popconfirm, Empty, Tooltip, Select,
} from "antd";
import { EditOutlined, DeleteOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  nbDanhSachGoi, nbLayGoi, nbGhepDonVaoGoi, nbRutDonKhoiGoi,
  nbChotGoi, nbXuatGoi, nbDanhSachDon, loiApi,
} from "../api";
import type { GoiHd, DonNb, TrangThaiGoi } from "../api";
import { useAuth } from "../AuthContext";
import { inPhieuSoanGoi } from "./mauInPhieu";
import "./phieu-xuat-nhap.css";

const soTien = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const soLuong = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const ngayVn = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("vi-VN") : "";

const homNayIso = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Nhãn + màu cho từng nấc vòng đời
const NHAN_TT: Record<TrangThaiGoi, { chu: string; mau: string }> = {
  moi:  { chu: "Mới lập",   mau: "default" },
  chot: { chu: "Đã chốt",   mau: "processing" },
  xuat: { chu: "Đã xuất",   mau: "success" },
  huy:  { chu: "Đã hủy",    mau: "error" },
};

export default function GoiHang() {
  const { session } = useAuth();
  const [ds, setDs] = useState<GoiHd[]>([]);
  const [tai, setTai] = useState(false);
  const [chon, setChon] = useState<GoiHd | null>(null);   // gói đang mở chi tiết
  const [locTt, setLocTt] = useState<TrangThaiGoi | undefined>();
  const [moGhep, setMoGhep] = useState(false);
  const [dangChay, setDangChay] = useState(false);

  const docDs = useCallback(async (tt?: TrangThaiGoi) => {
    setTai(true);
    try {
      const r = await nbDanhSachGoi(undefined, tt, 200);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách gói"));
    } finally {
      setTai(false);
    }
  }, []);

  useEffect(() => {
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void docDs(locTt); });
    return () => { huy = true; };
  }, [docDs, locTt]);

  // Mở lại chi tiết sau mỗi thao tác: server là nguồn sự thật, không tự đoán state mới
  const moChiTiet = useCallback(async (maGoi: string) => {
    try {
      const r = await nbLayGoi(maGoi);
      setChon(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không mở được gói"));
    }
  }, []);

  // Gói bọc chung cho 4 thao tác vòng đời: chạy -> báo -> nạp lại cả list lẫn chi tiết
  const chayThaoTac = useCallback(async (
    // Kết quả của viec() không dùng tới — chỉ cần biết nó xong hay ném lỗi,
    // nên `Promise<unknown>` là đủ, không phải nới thành any.
    viec: () => Promise<unknown>, thanhCong: string, maGoi?: string
  ) => {
    setDangChay(true);
    try {
      await viec();
      message.success(thanhCong);
      await docDs(locTt);
      if (maGoi) await moChiTiet(maGoi);
    } catch (e) {
      message.error(loiApi(e));
    } finally {
      setDangChay(false);
    }
  }, [docDs, locTt, moChiTiet]);

  // ---------- IN PHIẾU SOẠN HÀNG (BR-NB-08) ----------
  // Tờ giấy KHO cầm đi gom hàng. In từ GOI_HD_LINE — snapshot đã chốt, KHÔNG tính lại
  // từ đơn con lúc in: nếu tính lại thì tờ giấy có thể khác lúc chốt, kho gom sai.
  //
  // Cột "Đã soạn" để trống có chủ ý: thủ kho tick tay bằng bút khi gom xong từng mặt hàng.
  const inPhieuSoan = useCallback((g: GoiHd) => {
    if (g.trangThai === "moi") {
      message.warning("Phải CHỐT gói trước — chốt xong mới in được phiếu gói");
      return;
    }
    if (!g.lines?.length) { message.warning("Gói chưa có dòng hàng nào"); return; }
    inPhieuSoanGoi(g, { ten: session?.tenant.name });
  }, [session]);

  // In từ DANH SÁCH: dòng trong lưới chỉ có phần đầu gói, chưa có lines/donCon —
  // phải gọi chi tiết rồi mới in được.
  const [dangIn, setDangIn] = useState<string | null>(null);
  const inTuDanhSach = useCallback(async (maGoi: string) => {
    setDangIn(maGoi);
    try {
      const r = await nbLayGoi(maGoi);
      inPhieuSoan(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không in được phiếu gói"));
    } finally {
      setDangIn(null);
    }
  }, [inPhieuSoan]);

  const cot = useMemo(() => [
    { title: "Mã gói", dataIndex: "maGoi", width: 90 },
    { title: "Khu vực", dataIndex: "khuVuc", width: 150, ellipsis: true },
    {
      title: "Ngày", dataIndex: "ngay", width: 100,
      render: (v: string | null) => ngayVn(v) || "—",
    },
    { title: "Người giao", dataIndex: "tenNvvc", width: 140, ellipsis: true },
    { title: "Số đơn", dataIndex: "soDon", width: 75, align: "center" as const },
    {
      title: "Trạng thái", dataIndex: "trangThai", width: 110,
      render: (v: TrangThaiGoi) => {
        const n = NHAN_TT[v] ?? NHAN_TT.moi;
        return <Tag color={n.mau}>{n.chu}</Tag>;
      },
    },
    {
      // Nút biểu tượng cho gọn cột; tooltip giữ chữ để không phải đoán hình vẽ.
      title: "", width: 80, align: "center" as const,
      render: (_: unknown, r: GoiHd) => (
        <Space size={0}>
          <Tooltip title="Chỉnh sửa gói">
            <Button size="small" type="link" icon={<EditOutlined />}
                    onClick={() => moChiTiet(r.maGoi!)} />
          </Tooltip>
          {/* In ngay tại danh sách: dòng ở đây CHƯA có lines/donCon (API danh sách chỉ
              trả phần đầu gói) nên phải gọi chi tiết trước rồi mới in được. */}
          <Tooltip title={r.trangThai === "moi"
            ? "Phải CHỐT gói trước mới in được" : "In phiếu gói"}>
            <Button size="small" type="link" icon={<PrinterOutlined />}
                    loading={dangIn === r.maGoi}
                    disabled={r.trangThai === "moi"}
                    onClick={() => inTuDanhSach(r.maGoi!)} />
          </Tooltip>
        </Space>
      ),
    },
  ], [moChiTiet, inTuDanhSach, dangIn]);

  return (
    // KHÔNG dùng .pxn ở đây: .pxn ghim cao đúng bằng khung và overflow:hidden — hợp với
    // màn phiếu (lưới tự cuộn bên trong), nhưng màn này là một bảng dài, dùng .pxn là
    // bị cắt cụt mà không cuộn được. Ở đây cứ để cao theo nội dung, vùng nội dung của
    // AppShell lo phần cuộn.
    <div className="pxn-trang">
      <Card
        size="small"
        style={{ borderTop: "4px solid #7c3aed" }}
        title={
          <Typography.Text strong style={{ fontSize: 19, color: "#7c3aed", letterSpacing: 0.4 }}>
            GÓI HÀNG
          </Typography.Text>
        }
        extra={
          <Space>
            <Select
              allowClear
              placeholder="Lọc trạng thái"
              style={{ width: 160 }}
              value={locTt}
              onChange={(v) => setLocTt(v)}
              options={(Object.keys(NHAN_TT) as TrangThaiGoi[])
                .map((k) => ({ value: k, label: NHAN_TT[k].chu }))}
            />
          </Space>
        }
        styles={{ body: { padding: "10px 14px" } }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Gói là chứng từ tác nghiệp kho. Ghép đơn → <b>chốt</b> để in phiếu gói →
          <b> xuất</b> khi xe lăn bánh (lúc này kho mới bị trừ). Công nợ vẫn tính theo từng đơn.
        </Typography.Text>
        <Table
          rowKey="maGoi"
          size="small"
          style={{ marginTop: 10 }}
          loading={tai}
          dataSource={ds}
          columns={cot}
          pagination={{ pageSize: 12 }}
          locale={{ emptyText: <Empty description="Chưa có gói nào" /> }}
        />
      </Card>

      <ModalChiTiet
        goi={chon}
        dangChay={dangChay}
        onDong={() => setChon(null)}
        onGhep={() => setMoGhep(true)}
        onIn={() => chon && inPhieuSoan(chon)}
        onChot={() => chon && chayThaoTac(
          () => nbChotGoi(chon.maGoi!),
          `Đã chốt gói ${chon.maGoi} — in phiếu gói được rồi`, chon.maGoi!)}
        onXuat={() => chon && chayThaoTac(
          () => nbXuatGoi(chon.maGoi!, homNayIso()), `Đã xuất gói ${chon.maGoi}`, chon.maGoi!)}
        onRut={(maHd) => chon && chayThaoTac(
          () => nbRutDonKhoiGoi([maHd]), `Đã rút đơn ${maHd} khỏi gói`, chon.maGoi!)}
      />

      <ModalGhepDon
        key={moGhep ? `ghep-${chon?.maGoi}` : "ghep-dong"}
        mo={moGhep}
        maGoi={chon?.maGoi ?? null}
        onDong={() => setMoGhep(false)}
        onXong={async () => {
          setMoGhep(false);
          await docDs(locTt);
          if (chon?.maGoi) await moChiTiet(chon.maGoi);
        }}
      />
    </div>
  );
}

// ============================ MODAL: chi tiết gói ============================
function ModalChiTiet({ goi, dangChay, onDong, onGhep, onIn, onChot, onXuat, onRut }: {
  goi: GoiHd | null;
  dangChay: boolean;
  onDong: () => void;
  onGhep: () => void;
  onIn: () => void;
  onChot: () => void;
  onXuat: () => void;
  onRut: (maHd: string) => void;
}) {
  if (!goi) return null;
  const tt = goi.trangThai;
  const daChot = tt === "chot" || tt === "xuat";
  const daXuat = tt === "xuat";
  const coDon = (goi.donCon?.length ?? 0) > 0;
  const tongTien = (goi.donCon ?? []).reduce((s, d) => s + (Number(d.tongTien) || 0), 0);

  return (
    <Modal
      open={!!goi}
      onCancel={onDong}
      footer={null}
      width={1050}
      title={
        <Space>
          <span>Gói {goi.maGoi}</span>
          {goi.tenGoi && <Typography.Text type="secondary">{goi.tenGoi}</Typography.Text>}
          <Tag color={(NHAN_TT[tt] ?? NHAN_TT.moi).mau}>{(NHAN_TT[tt] ?? NHAN_TT.moi).chu}</Tag>
        </Space>
      }
    >
      <Row gutter={[10, 6]} style={{ marginBottom: 10 }}>
        <Col span={6}><b>Khu vực:</b> {goi.khuVuc || "—"}</Col>
        <Col span={6}><b>Người giao:</b> {goi.tenNvvc || "—"}</Col>
        <Col span={6}><b>Ngày lập:</b> {ngayVn(goi.ngay) || "—"}</Col>
        <Col span={6}><b>Tổng tiền:</b> {soTien(tongTien)}</Col>
      </Row>

      {/* Bốn nấc BR-NB-08: ghép đơn -> CHỐT (sinh phiếu gói, khóa sửa đơn con)
          -> XUẤT (đóng dấu ngày xuất kho). Gói đã chốt muốn đổi thì rút đơn ra trước. */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Tooltip title={daChot ? "Gói đã chốt — rút đơn ra trước nếu muốn đổi" : ""}>
          <Button onClick={onGhep} disabled={daChot || dangChay}>Ghép đơn vào gói</Button>
        </Tooltip>
        <Tooltip title={daXuat ? "Gói đã xuất, không chốt lại được"
          : coDon ? "Sinh phiếu gói + khóa sửa đơn con" : "Gói chưa có đơn nào"}>
          <Button type="primary" onClick={onChot} loading={dangChay}
                  disabled={daXuat || !coDon}>
            {tt === "chot" ? "Chốt lại" : "CHỐT GÓI"}
          </Button>
        </Tooltip>
        <Tooltip title={!daChot ? "Phải chốt gói trước khi xuất"
          : daXuat ? "Gói đã xuất rồi" : "Đóng dấu ngày xuất kho cho mọi đơn con"}>
          <Button onClick={onXuat} loading={dangChay}
                  disabled={!daChot || daXuat}>XUẤT GÓI</Button>
        </Tooltip>
        <Tooltip title={!daChot ? "Chốt gói xong mới in được phiếu gói" : ""}>
          <Button onClick={onIn} disabled={!daChot}>In phiếu gói</Button>
        </Tooltip>
      </Space>

      <Typography.Title level={5} style={{ marginBottom: 4 }}>
        Phiếu gói {daChot ? "" : "(chưa có — chốt gói để sinh)"}
      </Typography.Title>
      <Table
        rowKey={(r) => `${r.sttLine}-${r.maHang}`}
        size="small"
        dataSource={goi.lines ?? []}
        pagination={false}
        locale={{ emptyText: <Empty description="Chốt gói để sinh phiếu gói" /> }}
        columns={[
          { title: "STT", dataIndex: "sttLine", width: 55, align: "center" as const },
          { title: "Tên hàng", dataIndex: "tenHang", ellipsis: true },
          { title: "ĐVT", dataIndex: "dvt", width: 80 },
          {
            title: "TỔNG SL", dataIndex: "soLuong", width: 100, align: "right" as const,
            render: (v: number) => <b>{soLuong(Number(v) || 0)}</b>,
          },
          { title: "Gộp từ", dataIndex: "soDonGop", width: 80, align: "center" as const,
            render: (v: number) => `${v ?? 0} đơn` },
        ]}
      />

      <Typography.Title level={5} style={{ marginTop: 14, marginBottom: 4 }}>
        Đơn trong gói ({goi.donCon?.length ?? 0})
      </Typography.Title>
      <Table
        rowKey="maHd"
        size="small"
        dataSource={goi.donCon ?? []}
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa ghép đơn nào" /> }}
        columns={[
          { title: "Mã đơn", dataIndex: "maHd", width: 80 },
          { title: "Khách hàng", dataIndex: "tenKh", ellipsis: true },
          { title: "Địa chỉ", dataIndex: "diaChi", ellipsis: true },
          {
            title: "Ngày xuất kho", dataIndex: "ngayNh", width: 125,
            render: (v: string | null) => v
              ? ngayVn(v)
              : <Tag color="orange">chưa giao</Tag>,
          },
          {
            title: "Tổng tiền", dataIndex: "tongTien", width: 120, align: "right" as const,
            render: (v: number) => <b>{soTien(Number(v) || 0)}</b>,
          },
          {
            title: "", width: 60, align: "center" as const,
            render: (_: unknown, r: DonNb) => (
              // Rút đơn là đường DUY NHẤT để sửa lại đơn đã vào gói chốt (BR-NB-08).
              // Gói đã xuất thì thôi — hàng đi rồi, rút ra là sai sự thật kho.
              <Popconfirm
                title={`Rút đơn ${r.maHd} khỏi gói?`}
                description={daChot ? "Gói sẽ lùi về 'Mới lập', phiếu gói cũ bị xóa." : undefined}
                okText="Rút ra" cancelText="Thôi"
                onConfirm={() => onRut(r.maHd!)}
              >
                <Tooltip title="Rút đơn khỏi gói">
                  <Button size="small" type="link" danger icon={<DeleteOutlined />}
                          disabled={daXuat || dangChay} />
                </Tooltip>
              </Popconfirm>
            ),
          },
        ]}
      />
    </Modal>
  );
}

// ============================ MODAL: ghép đơn vào gói ============================
// Chỉ hiện đơn RA (đơn giao hàng) CHƯA thuộc gói nào — mỗi đơn thuộc tối đa MỘT gói,
// một đơn không lên hai xe (BR-NB-08).
function ModalGhepDon({ mo, maGoi, onDong, onXong }: {
  mo: boolean;
  maGoi: string | null;
  onDong: () => void;
  onXong: () => void;
}) {
  const [ds, setDs] = useState<DonNb[]>([]);
  const [tai, setTai] = useState(false);
  const [tu, setTu] = useState("");
  const [chon, setChon] = useState<string[]>([]);
  const [luu, setLuu] = useState(false);

  const doc = useCallback(async (kw?: string) => {
    setTai(true);
    try {
      const r = await nbDanhSachDon("RA", undefined, kw, 200);
      setDs(r.data.filter((d) => !d.maGoi));   // bỏ đơn đã thuộc gói khác
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách đơn"));
    } finally {
      setTai(false);
    }
  }, []);

  useEffect(() => {
    if (!mo) return;
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void doc(); });
    return () => { huy = true; };
  }, [mo, doc]);

  const chay = async () => {
    if (chon.length === 0) { message.warning("Chưa tích đơn nào"); return; }
    setLuu(true);
    try {
      const r = await nbGhepDonVaoGoi(maGoi!, chon);
      message.success(r.data.message);
      onXong();
    } catch (e) {
      message.error(loiApi(e, "Không ghép được đơn"));
    } finally {
      setLuu(false);
    }
  };

  return (
    <Modal title={`Ghép đơn vào gói ${maGoi ?? ""}`} open={mo} onCancel={onDong}
           onOk={chay} okText={`Ghép ${chon.length} đơn`} cancelText="Thôi"
           confirmLoading={luu} width={900}>
      <Input.Search
        placeholder="Tìm theo số đơn hoặc tên khách"
        value={tu}
        onChange={(e) => setTu(e.target.value)}
        onSearch={(v) => doc(v)}
        style={{ width: 340, marginBottom: 10 }}
        allowClear
      />
      <Table
        rowKey="maHd"
        size="small"
        loading={tai}
        dataSource={ds}
        pagination={{ pageSize: 10 }}
        rowSelection={{
          selectedRowKeys: chon,
          onChange: (k) => setChon(k as string[]),
        }}
        locale={{ emptyText: <Empty description="Không còn đơn nào chưa vào gói" /> }}
        columns={[
          { title: "Mã đơn", dataIndex: "maHd", width: 80 },
          {
            title: "Ngày", dataIndex: "ngay", width: 100,
            render: (v: string | null) => ngayVn(v) || "—",
          },
          { title: "Khách hàng", dataIndex: "tenKh", ellipsis: true },
          { title: "Địa chỉ", dataIndex: "diaChi", ellipsis: true },
          {
            title: "Tổng tiền", dataIndex: "tongTien", width: 120, align: "right" as const,
            render: (v: number) => soTien(Number(v) || 0),
          },
        ]}
      />
    </Modal>
  );
}
