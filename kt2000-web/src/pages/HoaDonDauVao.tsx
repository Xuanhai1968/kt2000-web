import { useEffect, useMemo, useState } from "react";
import {
  Card, Table, Button, message, Typography, Input, Select, Space,
  Tag, Checkbox, Progress, Alert, Radio, Modal, Empty, InputNumber, Popconfirm,
} from "antd";
import {
  getAdminTenants, importJob, getLeftoverFiles, getRawFiles, getRawHtml, importOne,
} from "../api";
import type {
  AdminTenant, ImportJobResult, LeftoverInfo, HuongLay, HoaDonConLai, MatHang,
} from "../api";
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

  // ===== Modal soi các hóa đơn còn nằm lại raw\ =====
  const [modalMo, setModalMo] = useState(false);
  const [modalTai, setModalTai] = useState(false);
  const [modalDonVi, setModalDonVi] = useState<AdminTenant | null>(null);
  const [dsConLai, setDsConLai] = useState<HoaDonConLai[]>([]);

  // Nút chỉ sáng khi đang chọn ĐÚNG MỘT đơn vị và đơn vị đó còn file trong raw\
  const donViDangChon = selected.length === 1
    ? tenants.find((t) => t.id === selected[0]) ?? null : null;
  const soFileCuaDonViChon = donViDangChon
    ? fileLoi[donViDangChon.id]?.soFileConLai ?? 0 : 0;

  const moModalConLai = async () => {
    if (!donViDangChon) return;
    setModalDonVi(donViDangChon);
    setModalMo(true);
    setModalTai(true);
    setDsConLai([]);
    try {
      const r = await getRawFiles(donViDangChon.id, namLamViec, tuThang, denThang, huong);
      setDsConLai(r.data);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không đọc được thư mục raw\\");
    } finally {
      setModalTai(false);
    }
  };

  // Sửa tại chỗ: ghi đè đúng hóa đơn trong danh sách đang hiển thị
  const suaHoaDon = (tenFile: string, thayDoi: Partial<HoaDonConLai>) =>
    setDsConLai((ds) => ds.map((x) => (x.tenFile === tenFile ? { ...x, ...thayDoi } : x)));

  const suaMatHang = (tenFile: string, stt: number, thayDoi: Partial<MatHang>) =>
    setDsConLai((ds) => ds.map((x) => x.tenFile !== tenFile ? x
      : { ...x, matHangs: x.matHangs.map((m) => (m.stt === stt ? { ...m, ...thayDoi } : m)) }));

  // Xem bản HTML gốc — tải qua axios (có token) rồi mở bằng blob, không mở link thẳng
  const xemHtml = async (hd: HoaDonConLai) => {
    if (!modalDonVi) return;
    try {
      const r = await getRawHtml(modalDonVi.id, namLamViec, hd.thang, hd.huong, hd.tenFile);
      const url = URL.createObjectURL(new Blob([r.data], { type: "text/html;charset=utf-8" }));
      window.open(url, "_blank", "noopener");
      // Thu hồi muộn để tab kịp đọc xong
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      message.error(e?.response?.status === 404
        ? "Hóa đơn này không có bản HTML kèm theo"
        : e?.response?.data?.message ?? "Không mở được bản HTML");
    }
  };

  const [dangNap, setDangNap] = useState<string | null>(null);

  const napMotHoaDon = async (hd: HoaDonConLai) => {
    if (!modalDonVi) return;
    setDangNap(hd.tenFile);
    try {
      const r = await importOne({
        tenantId: modalDonVi.id, nam: namLamViec, thang: hd.thang, huong: hd.huong,
        tenFile: hd.tenFile, mauSo: hd.mauSo, khHd: hd.khHd, soHd: hd.soHd, ngay: hd.ngay,
        mst: hd.huong === "VAO" ? hd.mstBan : hd.mstMua,
        tenKh: hd.huong === "VAO" ? hd.tenBan : hd.tenMua,
        diaChi: "", tienHang: hd.tienHang, tienVat: hd.tienVat, tienCk: 0,
        matHangs: hd.matHangs,
      });
      const d = r.data;
      message.success(`${d.capNhat ? "Đã cập nhật" : "Đã thêm"} ${d.maHd}`
                    + ` — ${d.soDongHang} dòng hàng, dời ${d.moved} file`);
      if (d.loiDoiFile) message.warning(`Đã ghi DB nhưng không dời được file: ${d.loiDoiFile}`);
      // Hóa đơn đã vào sổ thì bỏ khỏi danh sách và cập nhật lại cột đếm
      setDsConLai((ds) => ds.filter((x) => x.tenFile !== hd.tenFile));
      docFileLoi(dangHoatDong);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không nạp được hóa đơn này");
    } finally {
      setDangNap(null);
    }
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
          {/* Xám khi chưa chọn đúng 1 đơn vị, hoặc đơn vị đó đã vào hết */}
          <Button
            danger={soFileCuaDonViChon > 0}
            disabled={!donViDangChon || soFileCuaDonViChon === 0}
            onClick={moModalConLai}
            title={
              !donViDangChon
                ? "Chọn đúng một đơn vị để xem"
                : soFileCuaDonViChon === 0
                  ? "Đơn vị này không còn file nào ở raw\\"
                  : `Xem ${soFileCuaDonViChon} hóa đơn còn lại của ${donViDangChon.code}`
            }
          >
            Xem file còn lại{soFileCuaDonViChon > 0 ? ` (${soFileCuaDonViChon})` : ""}
          </Button>
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

      {/* ===== Modal: các hóa đơn còn nằm lại raw\ — đọc thẳng từ XML gốc ===== */}
      <Modal
        title={`File còn lại trong raw\\ — ${modalDonVi?.code ?? ""} `
             + `(T${tuThang}–T${denThang}, ${huong === "vao" ? "đầu vào" : "vào + ra"})`}
        open={modalMo}
        onCancel={() => setModalMo(false)}
        footer={null}
        width="95vw"
        style={{ top: 24, maxWidth: 1800 }}
        styles={{ body: { maxHeight: "calc(100vh - 160px)", overflowY: "auto" } }}
      >
        <Table
          rowKey="tenFile"
          size="small"
          loading={modalTai}
          dataSource={dsConLai}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="Không đọc được hóa đơn nào trong raw\" /> }}
          scroll={{ x: 1500 }}
          // Nút + của antd: bung ra mặt hàng của chính hóa đơn đó, sửa được tại chỗ
          expandable={{
            expandedRowRender: (r: HoaDonConLai) => {
              const sumLine = r.matHangs.reduce((s, x) => s + x.thanhTien, 0);
              const lech = r.tienHang - sumLine;
              return (
                <div style={{ padding: "4px 0 8px 0" }}>
                  <Space wrap style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary">File: {r.tenFile}</Typography.Text>
                    <Typography.Text type="secondary">
                      Bán: {r.tenBan} [{r.mstBan}]
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Mua: {r.tenMua} [{r.mstMua}]
                    </Typography.Text>
                  </Space>
                  {r.matHangs.length === 0
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Hóa đơn không có dòng hàng" />
                    : <Table
                        rowKey="stt" size="small" pagination={false} dataSource={r.matHangs}
                        columns={[
                          { title: "STT", dataIndex: "stt", width: 60 },
                          { title: "Tên hàng hóa / dịch vụ", dataIndex: "tenHang",
                            render: (v: string, m: MatHang) => (
                              <Input size="small" value={v}
                                     onChange={(e) => suaMatHang(r.tenFile, m.stt, { tenHang: e.target.value })} />
                            ) },
                          { title: "ĐVT", dataIndex: "dvt", width: 90,
                            render: (v: string, m: MatHang) => (
                              <Input size="small" value={v}
                                     onChange={(e) => suaMatHang(r.tenFile, m.stt, { dvt: e.target.value })} />
                            ) },
                          { title: "Số lượng", dataIndex: "soLuong", width: 130,
                            render: (v: number, m: MatHang) => (
                              <InputNumber size="small" style={{ width: "100%" }} value={v}
                                           onChange={(x) => suaMatHang(r.tenFile, m.stt, { soLuong: x ?? 0 })} />
                            ) },
                          { title: "Đơn giá", dataIndex: "donGia", width: 150,
                            render: (v: number, m: MatHang) => (
                              <InputNumber size="small" style={{ width: "100%" }} value={v}
                                           onChange={(x) => suaMatHang(r.tenFile, m.stt, { donGia: x ?? 0 })} />
                            ) },
                          { title: "Thành tiền", dataIndex: "thanhTien", width: 160,
                            render: (v: number, m: MatHang) => (
                              <InputNumber size="small" style={{ width: "100%" }} value={v}
                                           onChange={(x) => suaMatHang(r.tenFile, m.stt, { thanhTien: x ?? 0 })} />
                            ) },
                          { title: "Thuế suất", dataIndex: "thueSuat", width: 100,
                            render: (v: string, m: MatHang) => (
                              <Input size="small" value={v}
                                     onChange={(e) => suaMatHang(r.tenFile, m.stt, { thueSuat: e.target.value })} />
                            ) },
                        ]}
                        summary={() => (
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={5} align="right">
                              <b>Σ thành tiền</b>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">
                              <b style={{ color: lech === 0 ? "#389e0d" : "#cf1322" }}>
                                {sumLine.toLocaleString("vi-VN")}
                              </b>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2}>
                              {lech === 0
                                ? <Tag color="green">khớp</Tag>
                                : <Tag color="red">lệch {lech.toLocaleString("vi-VN")}</Tag>}
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        )}
                      />}
                </div>
              );
            },
          }}
          columns={[
            { title: "Tháng", dataIndex: "thang", width: 70, fixed: "left" },
            { title: "Hướng", dataIndex: "huong", width: 80,
              render: (v: string) => <Tag color={v === "VAO" ? "blue" : "purple"}>{v}</Tag> },
            { title: "Ký hiệu", dataIndex: "khHd", width: 120,
              render: (v: string, r: HoaDonConLai) => (
                <Input size="small" value={v}
                       onChange={(e) => suaHoaDon(r.tenFile, { khHd: e.target.value })} />
              ) },
            { title: "Số HĐ", dataIndex: "soHd", width: 120,
              render: (v: string, r: HoaDonConLai) => (
                <Input size="small" value={v}
                       onChange={(e) => suaHoaDon(r.tenFile, { soHd: e.target.value })} />
              ) },
            { title: "Ngày", dataIndex: "ngay", width: 130,
              render: (v: string, r: HoaDonConLai) => (
                <Input size="small" value={v} placeholder="yyyy-MM-dd"
                       onChange={(e) => suaHoaDon(r.tenFile, { ngay: e.target.value })} />
              ) },
            { title: "Đối tác", dataIndex: "tenBan", width: 240, ellipsis: true,
              render: (_: string, r: HoaDonConLai) =>
                r.huong === "VAO" ? `${r.tenBan} [${r.mstBan}]` : `${r.tenMua} [${r.mstMua}]` },
            { title: "Tiền hàng", dataIndex: "tienHang", width: 160,
              render: (v: number, r: HoaDonConLai) => (
                <InputNumber size="small" style={{ width: "100%" }} value={v}
                             onChange={(x) => suaHoaDon(r.tenFile, { tienHang: x ?? 0 })} />
              ) },
            { title: "VAT", dataIndex: "tienVat", width: 150,
              render: (v: number, r: HoaDonConLai) => (
                <InputNumber size="small" style={{ width: "100%" }} value={v}
                             onChange={(x) => suaHoaDon(r.tenFile, { tienVat: x ?? 0 })} />
              ) },
            { title: "Tổng", dataIndex: "tongTien", width: 130, align: "right",
              render: (v: number) => <b>{v.toLocaleString("vi-VN")}</b> },
            { title: "Vì sao còn nằm lại", dataIndex: "lyDo", width: 300, ellipsis: true,
              render: (v: string, r: HoaDonConLai) => (
                <Typography.Text type={r.coTrongExcel ? "danger" : "warning"} title={v}>
                  {v}
                </Typography.Text>
              ) },
            { title: "", width: 190, fixed: "right",
              render: (_: unknown, r: HoaDonConLai) => (
                <Space size={4}>
                  <Button size="small" onClick={() => xemHtml(r)}>Xem HTML</Button>
                  <Popconfirm
                    title="Nạp hóa đơn này vào database?"
                    description={`${modalDonVi?.code}_${modalDonVi?.taxCode}_${r.khHd}_${r.soHd.replace(/^0+/, "") || "0"}`}
                    okText="Nạp" cancelText="Thôi"
                    onConfirm={() => napMotHoaDon(r)}
                  >
                    <Button size="small" type="primary" loading={dangNap === r.tenFile}>
                      Nạp vào DB
                    </Button>
                  </Popconfirm>
                </Space>
              ) },
          ]}
        />
      </Modal>
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
