import { useEffect, useMemo, useState } from "react";
import { Card, Table, Button, InputNumber, Space, Tag, message, Alert } from "antd";
import { getAdminTenants, openFiscalYears, taoBangLuong, loiApi } from "../api";
import type { AdminTenant, OpenYearResult } from "../api";
import { useAuth } from "../AuthContext";
import { mauDonVi, damDonVi } from "../theme/donViColors";
import "./luoi-gon.css";

export default function MoNamLamViec() {
    // Mở năm = CREATE DATABASE nên chỉ quản trị viên được bấm. Người khác vẫn vào xem
    // được danh sách đơn vị và các năm đã mở — khóa nút chứ không khóa màn hình.
    // Đây chỉ là lớp tiện dụng; chặn thật nằm ở backend (403).
    const { session } = useAuth();
    const laAdmin = !!session?.user.isAdmin;
    const [tenants, setTenants] = useState<AdminTenant[]>([]);
    const [selected, setSelected] = useState<React.Key[]>([]);
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [running, setRunning] = useState(false);
    const [dangTaoBang, setDangTaoBang] = useState(false);
    const [results, setResults] = useState<OpenYearResult[]>([]);

    // QT-02: màn này là chỗ DUY NHẤT cần thấy MDN_NB — mở năm cho chính tenant quản lý
    // đi chung đường OpenYears, không đặc cách. Các màn khác vẫn giữ mặc định (ẩn).
    useEffect(() => { getAdminTenants(true).then((r) => setTenants(r.data)); }, []);

    const dsHoatDong = useMemo(
      () => tenants.filter((t) => t.isActive)
                   .sort((a, b) => a.code.localeCompare(b.code, "vi")),
      [tenants]);
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
        } catch (e) {
        message.error(loiApi(e, "Lỗi khi mở năm"));
        } finally {
        setRunning(false);
        }
    };

    // Dựng bảng module Hợp đồng + Lương cho các đơn vị đang tích, ở ĐÚNG năm đang gõ
    // trong ô bên trái. Việc riêng, không gộp vào nút Mở năm: phần lớn khách chỉ thuê
    // làm kế toán thuế, dựng sẵn 4 bảng rỗng cho mọi đơn vị là rác.
    const taoBang = async () => {
        setDangTaoBang(true);
        try {
            const r = await taoBangLuong(year, selected as string[]);
            setResults(r.data);
            const ok = r.data.filter((x) => x.status === "ok").length;
            const skip = r.data.filter((x) => x.status === "skip").length;
            const err = r.data.filter((x) => x.status === "error").length;
            if (err > 0)
                message.error(
                    `Xong: ${ok} tạo mới, ${skip} bỏ qua, ${err} LỖI, xem bảng dưới`);
            else if (ok === 0)
                message.warning(`Không tạo mới — cả ${skip} đơn vị đều đã có bảng`);
            else
                message.success(
                    `Đã tạo bảng Hợp đồng + Lương cho ${ok} đơn vị năm ${year}`
                    + (skip > 0 ? ` (${skip} đã có từ trước)` : ""));
        } catch (e) {
            message.error(loiApi(e, "Lỗi khi tạo bảng Hợp đồng + Lương"));
        } finally {
            setDangTaoBang(false);
        }
    };

  const colorOf = (s: string) => (s === "ok" ? "green" : s === "skip" ? "orange" : "red");

  return (
    <Card title="Mở năm làm việc mới (hàng loạt)">
      {!laAdmin && (
        <Alert style={{ marginBottom: 12 }} type="info" showIcon
               message="Bạn xem được danh sách và các năm đã mở, nhưng chỉ quản trị viên mới mở được năm mới" />
      )}
      <Space style={{ marginBottom: 12 }}>
        Năm cần mở:
        <InputNumber min={2000} max={2100} value={year}
                     onChange={(v) => setYear(v ?? year)} />
        <Button type="primary" loading={running}
                disabled={!laAdmin || selected.length === 0} onClick={run}
                title={laAdmin ? undefined : "Chỉ quản trị viên được mở năm làm việc mới"}>
          Mở năm {year} cho {selected.length} đơn vị
        </Button>

        <Button loading={dangTaoBang}
                disabled={!laAdmin || selected.length === 0} onClick={taoBang}
                title={laAdmin
                  ? "Dựng 4 bảng NHAN_SU / HOP_DONG / CHAM_CONG / BANG_LUONG vào"
                    + ` database năm ${year} của các đơn vị đang tích.`
                    + "\nPhải Mở năm trước. Đơn vị chưa tạo bảng sẽ không hiện ở màn"
                    + " Hợp đồng lao động."
                  : "Chỉ quản trị viên được tạo bảng"}>
          Tạo bảng Hợp đồng + Lương
        </Button>
      </Space>
      <Table
        className="luoi-gon"
        rowKey="id" size="small"
        dataSource={dsHoatDong}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={false}
        scroll={{ y: "calc(100vh - 340px)" }}
        columns={[
          { title: "STT", width: 46, align: "center",
            render: (_: unknown, __: AdminTenant, i: number) => i + 1 },
          // BR-GD-01: màu áp lên chữ cột Mã + Tên, mã màu lấy từ theme/donViColors
          { title: "Mã", dataIndex: "code", width: 150,
            render: (v: string, r: AdminTenant) =>
              <span style={{ color: mauDonVi(r), fontWeight: damDonVi(r) }}>{v}</span> },
          { title: "Tên đơn vị", dataIndex: "name",
            render: (v: string, r: AdminTenant) =>
              <span style={{ color: mauDonVi(r) }}>{v}</span> },
          { title: "Kỳ khai", dataIndex: "khaiQuy", width: 100,
            render: (q: boolean, r: AdminTenant) =>
              r.tenantType === "noibo" || r.tenantType === "internal"
                ? <span style={{ color: "#8c8c8c" }}>—</span>
                : q ? <Tag>Quý</Tag> : <Tag color="red">Tháng</Tag> },
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