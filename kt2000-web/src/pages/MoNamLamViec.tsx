import { useEffect, useState } from "react";
import { Card, Table, Button, InputNumber, Space, Tag, message } from "antd";
import { getAdminTenants, openFiscalYears } from "../api";
import type { AdminTenant, OpenYearResult } from "../api";

export default function MoNamLamViec() {
    const [tenants, setTenants] = useState<AdminTenant[]>([]);
    const [selected, setSelected] = useState<React.Key[]>([]);
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<OpenYearResult[]>([]);

    useEffect(() => { getAdminTenants().then((r) => setTenants(r.data)); }, []);
    const run = async () => {
        setRunning(true);
        try {
        const r = await openFiscalYears(year, selected as string[]);
        setResults(r.data);
        const ok = r.data.filter((x) => x.status === "ok").length;
        const skip = r.data.filter((x) => x.status === "skip").length;
        const err = r.data.filter((x) => x.status === "error").length;
        if (err > 0) message.error(`Xong: ${ok} tạo mới, ${skip} đã có, ${err} LỖI — xem bảng dưới`);
        else if (ok === 0) message.warning(`Không tạo gì mới — cả ${skip} đơn vị đều đã có năm ${year}`);
        else message.success(`Đã tạo năm ${year} cho ${ok} đơn vị (${skip} đã có từ trước)`);
        } catch (e: any) {
        message.error(e?.response?.data?.message ?? "Lỗi khi mở năm");
        } finally {
        setRunning(false);
        }
    };
//   const run = async () => {
//     setRunning(true);
//     try {
//       const r = await openFiscalYears(year, selected as string[]);
//       setResults(r.data);
//       message.success("Chạy xong — xem kết quả từng đơn vị bên dưới");
//     } catch (e: any) {
//       message.error(e?.response?.data?.message ?? "Lỗi khi mở năm");
//     } finally {
//       setRunning(false);
//     }
//   };

  const colorOf = (s: string) => (s === "ok" ? "green" : s === "skip" ? "orange" : "red");

  return (
    <Card title="Mở năm làm việc mới (hàng loạt)">
      <Space style={{ marginBottom: 12 }}>
        Năm cần mở:
        <InputNumber min={2000} max={2100} value={year}
                     onChange={(v) => setYear(v ?? year)} />
        <Button type="primary" loading={running}
                disabled={selected.length === 0} onClick={run}>
          Mở năm {year} cho {selected.length} đơn vị
        </Button>
      </Space>
      <Table
        rowKey="id" size="small" dataSource={tenants.filter((t) => t.isActive)}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 150 },
          { title: "Tên đơn vị", dataIndex: "name" },
          { title: "Các năm", dataIndex: "fiscalYears", width: 220,
            render: (ys: number[]) => ys.map((y) => <Tag key={y}>{y}</Tag>) },
        ]}
      />
      {results.length > 0 && (
        <Table
          rowKey="code" size="small" dataSource={results}
          pagination={false} style={{ marginTop: 16 }}
          columns={[
            { title: "Đơn vị", dataIndex: "code", width: 150 },
            { title: "Kết quả", dataIndex: "status", width: 100,
              render: (s: string) => <Tag color={colorOf(s)}>{s}</Tag> },
            { title: "Chi tiết", dataIndex: "message" },
            
          ]}
        />
      )}
    </Card>
  );
}