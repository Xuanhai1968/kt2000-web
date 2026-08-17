import { useEffect, useState } from "react";
import {
  Card, Table, Button, Select, Input, Space, Tag, Typography, Alert, message,
} from "antd";
import {
  getActivityLog, getActivityActions, getAdminTenants, loiApi,
  type NhatKyDong, type AdminTenant,
} from "../api";
import { useAuth } from "../AuthContext";
import "./luoi-gon.css";

// Nhãn tiếng Việt cho các mã hành động đang ghi. Mã lạ thì hiện nguyên mã —
// thà thấy mã thô còn hơn giấu mất một dòng nhật ký.
const NHAN: Record<string, string> = {
  TAO_USER: "Tạo người dùng",
  XOA_USER: "Xóa người dùng",
  KHOA_USER: "Khóa người dùng",
  MO_KHOA_USER: "Mở khóa người dùng",
  RESET_MAT_KHAU: "Đặt lại mật khẩu",
  XEM_MAT_KHAU: "Xem mật khẩu đã cấp",
  DOI_MAT_KHAU: "Người dùng tự đổi mật khẩu",
  CAP_QUYEN: "Cấp quyền",
  GO_QUYEN: "Gỡ quyền",
  DOI_MK_TCT: "Đổi mật khẩu cổng TCT",
  TAO_DON_VI: "Tạo đơn vị",
  MO_NAM: "Mở năm làm việc",
  MO_NAM_LOI: "Mở năm làm việc THẤT BẠI",
  NAP_HD_DONE: "Nạp hóa đơn (cả lô)",
  NAP_HD_TAY: "Nạp một hóa đơn (sửa tay)",
};

// Hành động đụng tới quyền hoặc mật khẩu thì tô đỏ — đúng loại cần soi khi có chuyện
const NHAY_CAM = new Set([
  "XOA_USER", "XEM_MAT_KHAU", "RESET_MAT_KHAU",
  "CAP_QUYEN", "GO_QUYEN", "DOI_MK_TCT",
]);

export default function NhatKyHeThong() {
  const { session } = useAuth();
  const laAdmin = !!session?.user.isAdmin;

  const [ds, setDs] = useState<NhatKyDong[]>([]);
  const [tong, setTong] = useState(0);
  const [trang, setTrang] = useState(1);
  const [soDong, setSoDong] = useState(50);
  const [dangTai, setDangTai] = useState(false);

  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [hanhDongCo, setHanhDongCo] = useState<string[]>([]);

  const [tuNgay, setTuNgay] = useState("");
  const [denNgay, setDenNgay] = useState("");
  const [nguoiDung, setNguoiDung] = useState("");
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [hanhDong, setHanhDong] = useState<string | undefined>();

  // Nhận bộ lọc qua tham số thay vì đọc state: setState của React chưa có hiệu lực
  // trong cùng vòng render, nên "Bỏ lọc" hoặc đổi số dòng mà gọi thẳng thì vẫn gửi
  // đi giá trị CŨ. soDong nằm trong đây đúng vì lý do đó.
  const tai = (
    soTrang = trang,
    loc?: Partial<{
      tuNgay: string; denNgay: string; nguoiDung: string;
      tenantId?: string; hanhDong?: string; soDong: number;
    }>,
  ) => {
    const l = {
      tuNgay, denNgay, nguoiDung, tenantId, hanhDong, soDong, ...loc,
    };
    setDangTai(true);
    getActivityLog({
      tuNgay: l.tuNgay || undefined,
      denNgay: l.denNgay || undefined,
      nguoiDung: l.nguoiDung || undefined,
      tenantId: l.tenantId,
      hanhDong: l.hanhDong,
      trang: soTrang,
      soDong: l.soDong,
    })
      .then((r) => { setDs(r.data.ds); setTong(r.data.tong); setTrang(r.data.trang); })
      .catch((e) => message.error(loiApi(e, "Không đọc được nhật ký")))
      .finally(() => setDangTai(false));
  };

  // setTimeout 0: tai() bật cờ "đang tải" NGAY khi được gọi, mà setState đồng bộ trong
  // thân effect bị React coi là render dây chuyền. Đẩy sang lượt sau là hết — cùng lối
  // với BaoCaoThue/ToKhaiXml.
  useEffect(() => {
    if (!laAdmin) return;
    getActivityActions().then((r) => setHanhDongCo(r.data)).catch(() => {});
    getAdminTenants(true).then((r) => setTenants(r.data)).catch(() => {});
    const id = setTimeout(() => tai(1), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laAdmin]);

  const boLoc = () => {
    setTuNgay(""); setDenNgay(""); setNguoiDung("");
    setTenantId(undefined); setHanhDong(undefined);
    tai(1, { tuNgay: "", denNgay: "", nguoiDung: "", tenantId: undefined, hanhDong: undefined });
  };

  if (!laAdmin) {
    return (
      <Card title="Nhật ký hệ thống">
        <Alert type="warning" showIcon
               message="Chỉ quản trị viên được xem nhật ký hệ thống" />
      </Card>
    );
  }

  return (
    <Card
      title="Nhật ký hệ thống"
      extra={<Button onClick={() => tai(trang)} loading={dangTai}>Đọc lại</Button>}
    >
      <Space wrap style={{ marginBottom: 10 }}>
        Từ ngày:
        <Input type="date" style={{ width: 150 }} value={tuNgay}
               onChange={(e) => setTuNgay(e.target.value)} />
        Đến ngày:
        <Input type="date" style={{ width: 150 }} value={denNgay}
               onChange={(e) => setDenNgay(e.target.value)} />
        <Input placeholder="Người dùng" style={{ width: 150 }} value={nguoiDung}
               onChange={(e) => setNguoiDung(e.target.value)}
               onPressEnter={() => tai(1)} allowClear />
        <Select placeholder="Đơn vị" style={{ width: 200 }} allowClear
                showSearch optionFilterProp="label"
                value={tenantId} onChange={setTenantId}
                options={tenants.map((t) => ({
                  value: t.id, label: `${t.code} — ${t.name}`,
                }))} />
        <Select placeholder="Hành động" style={{ width: 200 }} allowClear
                value={hanhDong} onChange={setHanhDong}
                options={hanhDongCo.map((a) => ({ value: a, label: NHAN[a] ?? a }))} />
        <Button type="primary" onClick={() => tai(1)}>Lọc</Button>
        <Button onClick={boLoc}>Bỏ lọc</Button>
      </Space>

      <Typography.Text type="secondary"
                       style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
        {tong.toLocaleString("vi-VN")} dòng khớp bộ lọc. Nhật ký chỉ ghi thêm —
        không sửa, không xóa, kể cả quản trị viên.
      </Typography.Text>

      <Table
        className="luoi-gon" rowKey="id" size="small" loading={dangTai} dataSource={ds}
        pagination={{
          current: trang, pageSize: soDong, total: tong, showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          onChange: (p, s) => { setSoDong(s); setTrang(p); tai(p, { soDong: s }); },
          showTotal: (t, r) => `${r[0]}–${r[1]} trên ${t}`,
        }}
        columns={[
          {
            title: "Thời điểm", dataIndex: "at", width: 165,
            render: (v: string) => new Date(v).toLocaleString("vi-VN"),
          },
          { title: "Người dùng", dataIndex: "userName", width: 130 },
          {
            title: "Hành động", dataIndex: "action", width: 195,
            render: (v: string) => (
              <Tag color={NHAY_CAM.has(v) ? "red" : undefined} title={v}>
                {NHAN[v] ?? v}
              </Tag>
            ),
          },
          {
            title: "Đơn vị", dataIndex: "donVi", width: 130,
            render: (v: string | null) =>
              v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: "Kỳ", width: 90,
            render: (_: unknown, r: NhatKyDong) =>
              r.nam ? `T${r.thang ?? "?"}/${r.nam}` : "—",
          },
          {
            title: "Chi tiết", dataIndex: "detail", ellipsis: true,
            render: (v: string | null) => <span title={v ?? ""}>{v}</span>,
          },
        ]}
      />
    </Card>
  );
}
