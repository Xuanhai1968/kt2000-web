import { useEffect, useMemo, useState } from "react";
import {
  Card, Table, Button, message, Typography, Input, Select, Space,
  Tag, Checkbox, Progress, Alert, Radio,
} from "antd";
import { getAdminTenants, importJob, getLeftoverFiles } from "../api";
import type { AdminTenant, ImportJobResult, LeftoverInfo, HuongLay } from "../api";
import { useAuth } from "../AuthContext";

// Kết quả nạp của MỘT (đơn vị × tháng) — gom lại thành nhật ký phiên chạy
interface DongKetQua {
  key: string;
  maDonVi: string;
  thang: number;
  trangThai: "ok" | "loi";
  moi: number;
  capNhat: number;
  boLai: number;
  loi: number;
  khongCoGoc: number;
  ghiChu: string;
}

// ============ RUỘT 1: console NỘI BỘ (MDN_NB) — FRM_LAY_HDDT ============
function ConsoleLayHoaDon() {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();

  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);

  // Hàng điều khiển (spec mục 2): từ tháng / đến tháng, hướng lấy, không còn chọn năm
  const [tuThang, setTuThang] = useState(1);
  const [denThang, setDenThang] = useState(1);
  const [huong, setHuong] = useState<HuongLay>("vao");
  const [xoaTruoc, setXoaTruoc] = useState(false);

  // Tiến độ phiên chạy bước 2
  const [dangChay, setDangChay] = useState(false);
  const [tienDo, setTienDo] = useState({ xong: 0, tong: 0, dangLam: "" });
  const [ketQua, setKetQua] = useState<DongKetQua[]>([]);

  // Số file gốc còn nằm lại raw\ của từng đơn vị (HĐ lệch Σ line vs master — spec 1.3.3)
  const [fileLoi, setFileLoi] = useState<Record<string, LeftoverInfo>>({});

  const docFileLoi = (ds: AdminTenant[]) => {
    if (ds.length === 0) return;
    getLeftoverFiles(ds.map((t) => t.id), namLamViec, tuThang, denThang, huong)
      .then((r) => setFileLoi(Object.fromEntries(r.data.map((x) => [x.tenantId, x]))))
      // Chưa cấu hình Paths:JobsRoot hoặc chưa có thư mục job là chuyện thường ở máy dev
      // — cột để trống, không nhảy thông báo lỗi làm phiền
      .catch(() => setFileLoi({}));
  };

  const napDanhSach = (baoOnKhiXong = false) => {
    setLoading(true);
    getAdminTenants()
      .then((r) => {
        setTenants(r.data);
        docFileLoi(r.data.filter((t) => t.isActive));
        if (baoOnKhiXong) message.success("Đã đọc lại danh sách đơn vị");
      })
      // Nói rõ hỏng ở đâu: nuốt hết thành một câu chung chung thì hết phiên, mất mạng
      // và lỗi phân quyền nhìn giống hệt nhau — dò bệnh rất mất thời gian
      .catch((e: any) =>
        message.error(
          e?.response?.data?.message ??
            (e?.response
              ? `Không tải được danh sách đơn vị (HTTP ${e.response.status})`
              : "Không gọi được máy chủ — kiểm tra backend còn chạy không")
        )
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => napDanhSach(), []);

  // Đổi khoảng tháng hoặc đổi hướng thì cột đếm phải tính lại, không thì số hiện
  // đang là của lựa chọn cũ mà tiêu đề cột lại ghi lựa chọn mới
  useEffect(() => {
    if (tenants.length) docFileLoi(tenants.filter((t) => t.isActive));
  }, [tuThang, denThang, huong, tenants]);

  const dangHoatDong = useMemo(() => tenants.filter((t) => t.isActive), [tenants]);
  const chonTheoKyKhai = (khaiQuy: boolean) =>
    setSelected(dangHoatDong.filter((t) => t.khaiQuy === khaiQuy).map((t) => t.id));

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);

  // ===== BƯỚC 2: đưa HĐ từ thư mục job vào HOA_DON / HOA_DON_LINE =====
  // Chạy tuần tự (đơn vị × tháng) để tiến độ phản ánh đúng việc đang làm,
  // và để một đơn vị hỏng không kéo cả mẻ chết theo.
  const chayBuoc2 = async () => {
    if (selected.length === 0) return;
    if (denThang < tuThang) { message.error("Đến tháng phải ≥ Từ tháng"); return; }

    const viecs: { tenant: AdminTenant; thang: number }[] = [];
    for (const id of selected) {
      const t = dangHoatDong.find((x) => x.id === id);
      if (!t) continue;
      for (let m = tuThang; m <= denThang; m++) viecs.push({ tenant: t, thang: m });
    }

    setDangChay(true);
    setKetQua([]);
    setTienDo({ xong: 0, tong: viecs.length, dangLam: "" });

    const gom: DongKetQua[] = [];
    for (let i = 0; i < viecs.length; i++) {
      const { tenant, thang } = viecs[i];
      setTienDo({ xong: i, tong: viecs.length, dangLam: `${tenant.code} — tháng ${thang}` });
      const key = `${tenant.id}-${thang}`;
      try {
        const r = await importJob(tenant.id, namLamViec, thang, huong, xoaTruoc);
        const d: ImportJobResult = r.data;
        gom.push({
          key, maDonVi: tenant.code, thang, trangThai: "ok",
          moi: d.inserted, capNhat: d.updated,
          boLai: d.skippedYear + d.skippedNoDate, loi: d.errors.length,
          khongCoGoc: d.khongCoGoc,
          ghiChu: d.errors.length
            ? d.errors.slice(0, 3).map((e) => `${e.maHd}: ${e.reason}`).join(" | ")
            : `Đã chuyển ${d.moved} file sang SCAN_DOC`,
        });
      } catch (e: any) {
        gom.push({
          key, maDonVi: tenant.code, thang, trangThai: "loi",
          moi: 0, capNhat: 0, boLai: 0, loi: 0, khongCoGoc: 0,
          ghiChu: e?.response?.data?.message ?? "Không gọi được máy chủ",
        });
      }
      setKetQua([...gom]);
    }

    setTienDo({ xong: viecs.length, tong: viecs.length, dangLam: "" });
    setDangChay(false);
    docFileLoi(dangHoatDong);   // nạp xong thì cột "file lỗi còn lại" phải cập nhật theo
    const soLoi = gom.filter((g) => g.trangThai === "loi" || g.loi > 0).length;
    if (soLoi) message.warning(`Xong ${viecs.length} lượt — ${soLoi} lượt có vấn đề, xem bảng dưới`);
    else message.success(`Xong ${viecs.length} lượt, không có lỗi`);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={`Lấy hóa đơn điện tử — năm làm việc ${namLamViec}`}
        extra={<Button onClick={() => napDanhSach(true)} loading={loading}>Đọc lại</Button>}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Button onClick={() => chonTheoKyKhai(false)}>Đánh dấu tất cả đơn vị khai Tháng</Button>
          <Button onClick={() => chonTheoKyKhai(true)}>Đánh dấu tất cả đơn vị khai Quý</Button>
          <Button onClick={() => setSelected([])} disabled={selected.length === 0}>Bỏ đánh dấu</Button>
          <Typography.Text type="secondary">
            Đơn vị <span style={{ color: "#cf1322", fontWeight: 600 }}>chữ đỏ</span> là khai THÁNG
          </Typography.Text>
        </Space>

        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={dangHoatDong}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "Mã", dataIndex: "code", width: 140,
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: r.khaiQuy ? undefined : "#cf1322", fontWeight: r.khaiQuy ? undefined : 600 }}>{v}</span> },
            { title: "Tên đơn vị", dataIndex: "name",
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: r.khaiQuy ? undefined : "#cf1322" }}>{v}</span> },
            { title: "MST", dataIndex: "taxCode", width: 140 },
            { title: "Kỳ khai", dataIndex: "khaiQuy", width: 100,
              render: (q: boolean) => q ? <Tag>Quý</Tag> : <Tag color="red">Tháng</Tag> },
            // Đếm file .xml còn nằm ở raw\ — gồm cả HĐ chưa nạp lẫn HĐ lệch Σ line phải
            // xử lý tay. Nạp xong mà vẫn còn số thì phần còn lại chính là số cần xử lý tay.
            { title: `Còn ở raw\\ (T${tuThang}–T${denThang}, ${huong === "vao" ? "vào" : "vào+ra"})`,
              width: 190,
              render: (_: unknown, r: AdminTenant) => {
                const info = fileLoi[r.id];
                if (!info) return <Typography.Text type="secondary">—</Typography.Text>;
                return info.soFileConLai === 0
                  ? <Tag color="green">Đã vào hết</Tag>
                  : <Tag color="orange"
                         title={"Chưa nạp hoặc lệch Σ line phải xử lý tay — "
                                + info.chiTiet.map((c) => `T${c.thang}: ${c.soFile}`).join(", ")}>
                      {info.soFileConLai} file
                    </Tag>;
              } },
            // Cột spec 1.3.3 yêu cầu: HĐ lệch Σ line vs master, file gốc nằm lại raw\<HUONG>\
            // Đếm từ bảng ImportError ghi lúc nạp — nhìn thư mục không suy ra được loại lỗi.
            { title: "Lệch Σ line ↔ master", width: 180,
              render: (_: unknown, r: AdminTenant) => {
                const info = fileLoi[r.id];
                if (!info) return <Typography.Text type="secondary">—</Typography.Text>;
                if (info.soLechTong === 0)
                  return info.soLoiKhac
                    ? <Tag color="gold" title="Lỗi loại khác: không rõ ngày / lỗi ghi / lỗi dời file">
                        0 (còn {info.soLoiKhac} lỗi khác)
                      </Tag>
                    : <Tag color="green">0</Tag>;
                return (
                  <Tag color="red"
                       title={"File gốc nằm lại raw\\ chờ xử lý tay — "
                              + info.lechTheoThang.map((c) => `T${c.thang}: ${c.soFile}`).join(", ")}>
                    {info.soLechTong} HĐ
                  </Tag>
                );
              } },
          ]}
        />

        <Space wrap style={{ marginTop: 12 }}>
          Từ tháng:
          <Select style={{ width: 90 }} value={tuThang} onChange={setTuThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
          Đến tháng:
          <Select style={{ width: 90 }} value={denThang} onChange={setDenThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
          <Radio.Group value={huong} onChange={(e) => setHuong(e.target.value)}
                       optionType="button" buttonStyle="solid"
                       options={[{ value: "vao", label: "Chỉ đầu vào" },
                                 { value: "all", label: "Cả vào và ra" }]} />
        </Space>
      </Card>

      <Card title="Bước 1 — Lấy HĐ từ cổng Tổng cục Thuế">
        <Alert
          type="warning" showIcon
          message="Chưa nối vào bộ tải của Tổng cục Thuế"
          // description={
          //   <>
          //     Bước này cần: bảng lưu tài khoản cổng TCT của từng đơn vị, Python + Chrome
          //     cài trên chính máy chạy backend, và file XML_MAP.xlsx. Xem SPEC-WP03 mục 5
          //     — còn 4 câu hỏi chờ Leader trả lời. Trong lúc chờ, dùng Bước 2 để nạp từ
          //     thư mục job đã tải sẵn.
          //   </>
          // }
        />
        <Button type="primary" style={{ marginTop: 12 }} disabled>
          Lấy HĐ điện tử ({selected.length} đơn vị, T{tuThang}–T{denThang},
          {huong === "vao" ? " chỉ đầu vào" : " vào + ra"})
        </Button>
      </Card>

      <Card title="Bước 2 — Đưa HĐ vào HOA_DON / HOA_DON_LINE (chạy tay)">
        <Space wrap>
          <Button type="primary" loading={dangChay}
                  disabled={selected.length === 0} onClick={chayBuoc2}>
            Nạp vào database ({selected.length} đơn vị × {Math.max(0, denThang - tuThang + 1)} tháng)
          </Button>
          <Checkbox checked={xoaTruoc} onChange={(e) => setXoaTruoc(e.target.checked)}>
            <span style={{ color: xoaTruoc ? "#cf1322" : undefined }}>
              Gặp HĐ trùng: XÓA hẳn rồi ghi mới (mất dữ liệu đã hạch toán trên HĐ đó)
            </span>
          </Checkbox>
        </Space>

        {tienDo.tong > 0 && (
          <div style={{ marginTop: 12 }}>
            <Progress
              percent={Math.round((tienDo.xong / tienDo.tong) * 100)}
              status={dangChay ? "active" : "normal"}
            />
            <Typography.Text type="secondary">
              {dangChay
                ? `Đang nạp: ${tienDo.dangLam} (${tienDo.xong}/${tienDo.tong})`
                : `Hoàn tất ${tienDo.xong}/${tienDo.tong} lượt`}
            </Typography.Text>
          </div>
        )}

        {ketQua.length > 0 && (
          <Table
            size="small" style={{ marginTop: 12 }} rowKey="key"
            dataSource={ketQua} pagination={{ pageSize: 15 }}
            columns={[
              { title: "Đơn vị", dataIndex: "maDonVi", width: 140 },
              { title: "Tháng", dataIndex: "thang", width: 70 },
              { title: "Mới", dataIndex: "moi", width: 70 },
              { title: "Cập nhật", dataIndex: "capNhat", width: 90 },
              { title: "Bỏ lại", dataIndex: "boLai", width: 80 },
              { title: "Không gốc", dataIndex: "khongCoGoc", width: 100,
                render: (n: number) => n
                  ? <Tag title="HĐ điện, viễn thông, ngân hàng — chỉ có trong Excel, không có bản gốc trên TCT">{n}</Tag>
                  : <span>0</span> },
              { title: "Lỗi", dataIndex: "loi", width: 70,
                render: (n: number, r: DongKetQua) =>
                  r.trangThai === "loi" ? <Tag color="red">hỏng</Tag>
                    : n ? <Tag color="red">{n}</Tag> : <Tag color="green">0</Tag> },
              { title: "Ghi chú", dataIndex: "ghiChu" },
            ]}
          />
        )}
      </Card>
    </Space>
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
