import { useEffect, useState } from "react";
import { Card, Table, Button, message, Typography, Input,Select, Space, InputNumber, Tag, Checkbox } from "antd";
import { getAdminTenants } from "../api";
import type { ImportJobResult } from "../api";
import { importJob } from "../api";
import type { AdminTenant } from "../api";
import { useAuth } from "../AuthContext";

// ============ RUỘT 1: console NỘI BỘ (MDN_NB) ============
function ConsoleLayHoaDon() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminTenants()
      .then((r) => setTenants(r.data))
      .catch(() => message.error("Không tải được danh sách đơn vị"))
      .finally(() => setLoading(false));
  }, []);

  const [napTenant, setNapTenant] = useState<string | undefined>();
  const [napNam, setNapNam] = useState(2025);
  const [napThang, setNapThang] = useState(1);
  const [napKq, setNapKq] = useState<ImportJobResult | null>(null);
  const [naping, setNaping] = useState(false);
  const [xoaTruoc, setXoaTruoc] = useState(false);

  const chayNap = async () => {
    if (!napTenant) return;
    setNaping(true);
    setNapKq(null);
    try {
      const r = await importJob(napTenant, napNam, napThang, xoaTruoc);
      
      setNapKq(r.data);
      message.success(`Nạp xong: ${r.data.inserted} mới, ${r.data.updated} cập nhật`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không nạp được — xem terminal backend");
    } finally {
      setNaping(false);
    }
  };

  return (
    <Card title="Lấy hóa đơn điện tử — chọn đơn vị">
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={tenants.filter((t) => t.isActive)}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 140 },
          { title: "Tên đơn vị", dataIndex: "name" },
          { title: "MST", dataIndex: "taxCode", width: 140 },
        ]}
      />
      <Button
        type="primary"
        disabled={selected.length === 0}
        onClick={() =>
          message.info(
            `Đã nhận lệnh cho ${selected.length} đơn vị — hàng đợi tải HĐĐT sẽ chạy ở gói WP-03`
          )
        }
      >
        Lấy HĐ điện tử ({selected.length} đơn vị)
      </Button>

      <Card size="small" title="Nạp từ thư mục job (đường chạy lại / nạp tay)"
            style={{ marginTop: 16 }}>
        <Space wrap>
          <Select
            placeholder="Chọn đơn vị" style={{ width: 260 }}
            value={napTenant} onChange={setNapTenant}
            options={tenants.filter((t) => t.isActive)
              .map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))}
          />
          Năm: <InputNumber min={2000} max={2100} value={napNam}
                            onChange={(v) => setNapNam(v ?? napNam)} />
          Tháng: <InputNumber min={1} max={12} value={napThang}
                              onChange={(v) => setNapThang(v ?? napThang)} />
          <Button type="primary" loading={naping} disabled={!napTenant} onClick={chayNap}>
            Nạp vào database
          </Button>
          <Checkbox checked={xoaTruoc} onChange={(e) => setXoaTruoc(e.target.checked)}>
            <span style={{ color: xoaTruoc ? "#cf1322" : undefined }}>
              Gặp HĐ trùng: XÓA hẳn rồi ghi mới (mất dữ liệu đã hạch toán trên HĐ đó)
            </span>
          </Checkbox>
        </Space>
        {napKq && (
          <div style={{ marginTop: 12 }}>
            <Space size="large">
              <Tag color="green">Mới: {napKq.inserted}</Tag>
              <Tag color="blue">Cập nhật: {napKq.updated}</Tag>
              <Tag color="orange">Lệch năm (bỏ qua): {napKq.skippedYear}</Tag>
              <Tag color="orange">Không rõ ngày: {napKq.skippedNoDate}</Tag>
              <Tag>File đã chuyển SCAN_DOC: {napKq.moved}</Tag>
              <Tag color={napKq.errors.length ? "red" : "green"}>Lỗi: {napKq.errors.length}</Tag>
            </Space>
            {napKq.errors.length > 0 && (
              <Table
                size="small" style={{ marginTop: 8 }} rowKey="maHd"
                dataSource={napKq.errors} pagination={{ pageSize: 10 }}
                columns={[
                  { title: "MA_HD", dataIndex: "maHd", width: 320 },
                  { title: "Lý do (file nằm lại raw\\)", dataIndex: "reason" },
                ]}
              />
            )}
          </div>
        )}
      </Card>
    </Card>
  );
}

// ============ RUỘT 2: đơn vị thường (TUAN_NGA…) ============
function HoaDonCuaDonVi() {
  const { session } = useAuth();
  return (
    <Card title={`Hóa đơn GTGT đầu vào — ${session?.tenant.name}`}>
      <Input.Search placeholder="Tìm theo số HĐ, MST, tên người bán…" disabled />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Danh sách hóa đơn của đơn vị sẽ hiện ở đây sau khi có dữ liệu từ chức
        năng Lấy HĐ điện tử (WP-03) và màn hình làm kho (WP-04).
      </Typography.Paragraph>
    </Card>
  );
}

// ============ BỘ CHIA: nhìn claim tenant_type để chọn ruột ============
export default function HoaDonDauVao() {
  const { session } = useAuth();
  return session?.tenant.tenantType === "internal"
    ? <ConsoleLayHoaDon />
    : <HoaDonCuaDonVi />;
}
