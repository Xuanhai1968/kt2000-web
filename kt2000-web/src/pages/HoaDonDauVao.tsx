import { useEffect, useMemo, useState } from "react";
import {
  Card, Table, Button, message, Typography, Input, Select, Space,
  Tag, Checkbox, Progress, Alert, Modal, Empty, InputNumber, Popconfirm,
} from "antd";
import {
  getAdminTenants, getLeftoverFiles, getRawFiles, getRawHtml, importOne,
  getTctCredential, saveTctCredential, fetchStart, fetchProgress, fetchStop,
  loiApi,
} from "../api";
import type {
  AdminTenant, LeftoverInfo, HuongLay, HoaDonConLai, MatHang, PhienLay,
} from "../api";
import { useAuth } from "../AuthContext";
import "./luoi-gon.css";
import "./mau-huong.css";

// NT-06 (Q2): ghi nhớ theo MÁY chứ không theo người — đúng hành vi VFP cũ, nơi
// trạng thái nằm trong KT2000.INI của máy đó. localStorage là chỗ tương đương.
const KHOA_CA_HAI = "kt2000_lay_hd_ca_vao_va_ra";

// Hai màn Đầu vào / Đầu ra dùng CHUNG ruột này, chỉ khác hướng mặc định.
interface Props { huongMacDinh: "vao" | "ra" }

// ============ RUỘT 1: console NỘI BỘ (MDN_NB) — FRM_LAY_HDDT ============
function ConsoleLayHoaDon({ huongMacDinh }: Props) {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const laDauRa = huongMacDinh === "ra";

  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);

  const [tuThang, setTuThang] = useState(1);
  const [denThang, setDenThang] = useState(1);
  const [xoaTruoc, setXoaTruoc] = useState(false);

  // NT-06: đọc lên từ localStorage ngay lúc dựng chứ không phải sau một vòng render —
  // để useEffect gán sau thì lần gọi API đầu tiên đã đi với hướng sai.
  const [caHaiHuong, setCaHaiHuong] = useState(
    () => localStorage.getItem(KHOA_CA_HAI) === "1");
  const doiCaHaiHuong = (bat: boolean) => {
    setCaHaiHuong(bat);
    localStorage.setItem(KHOA_CA_HAI, bat ? "1" : "0");
  };

  // Hướng thật sự gửi xuống backend: tích "cả hai" thì bỏ qua hướng của màn hình
  const huong: HuongLay = caHaiHuong ? "all" : huongMacDinh;

  // Số file gốc còn nằm lại raw\ của từng đơn vị
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
  const [chonFile, setChonFile] = useState<string | null>(null);
  const hdDangChon = dsConLai.find((x) => x.tenFile === chonFile) ?? null;

  const donViDangChon = selected.length === 1
    ? tenants.find((t) => t.id === selected[0]) ?? null : null;
  const soFileCuaDonViChon = donViDangChon
    ? fileLoi[donViDangChon.id]?.soFileConLai ?? 0 : 0;

  const dangHoatDong = useMemo(() => tenants.filter((t) => t.isActive), [tenants]);

  // NT-05: mở được từ nút, và mở được bằng cách bấm thẳng vào con số ở cột V/R
  const moModalConLai = async (dv?: AdminTenant) => {
    const t = dv ?? donViDangChon;
    if (!t) return;
    setModalDonVi(t);
    setModalMo(true);
    setModalTai(true);
    setDsConLai([]);
    setChonFile(null);
    try {
      const r = await getRawFiles(t.id, namLamViec, tuThang, denThang, huong);
      setDsConLai(r.data);
      // Chọn sẵn dòng đầu để khung dưới có nội dung ngay, khỏi phải bấm thêm
      if (r.data.length) setChonFile(r.data[0].tenFile);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được thư mục raw\\"));
    } finally {
      setModalTai(false);
    }
  };

  const suaHoaDon = (tenFile: string, thayDoi: Partial<HoaDonConLai>) =>
    setDsConLai((ds) => ds.map((x) => (x.tenFile === tenFile ? { ...x, ...thayDoi } : x)));

  // Thành tiền KHÔNG cho gõ tay: sửa số lượng hoặc đơn giá là nó tự nhân lại.
  // Người dùng gõ được cả ba thì ba số dễ chỏi nhau, mà chính cái chỏi đó là thứ
  // làm hóa đơn bị đá ra ở phép kiểm Σ line vs master.
  const suaMatHang = (tenFile: string, stt: number, thayDoi: Partial<MatHang>) =>
    setDsConLai((ds) => ds.map((x) => x.tenFile !== tenFile ? x
      : {
          ...x,
          matHangs: x.matHangs.map((m) => {
            if (m.stt !== stt) return m;
            const moi = { ...m, ...thayDoi };
            if ("soLuong" in thayDoi || "donGia" in thayDoi)
              moi.thanhTien = moi.soLuong * moi.donGia;
            return moi;
          }),
        }));

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
        : loiApi(e, "Không mở được bản HTML"));
    }
  };

  // ===== Lấy HĐ từ cổng TCT — NT-03: lấy xong backend nạp luôn, không còn bước hai =====
  const [phien, setPhien] = useState<PhienLay | null>(null);
  const [dangBatDau, setDangBatDau] = useState(false);
  const [mkMo, setMkMo] = useState(false);
  const [mkGiaTri, setMkGiaTri] = useState("");
  const [mkDaCo, setMkDaCo] = useState<Record<string, boolean>>({});

  // Hỏi tiến độ mỗi 2 giây khi còn phiên chạy — nguồn là status.json của script
  useEffect(() => {
    if (!phien?.dangChay) return;
    const id = setInterval(() => {
      fetchProgress().then((r) => {
        setPhien(r.data);
        // Phiên vừa kết thúc: cột V/R và lịch sử phải phản ánh ngay kết quả
        if (!r.data.dangChay) docFileLoi(dangHoatDong);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [phien?.dangChay]);

  // Mở màn hình là hỏi luôn phiên trước còn chạy dở không, và đọc lịch sử
  useEffect(() => {
    fetchProgress().then((r) => { if (r.data.cac?.length) setPhien(r.data); }).catch(() => {});

  }, []);

  const docTrangThaiMk = (t: AdminTenant) =>
    getTctCredential(t.id)
      .then((r) => setMkDaCo((m) => ({ ...m, [t.id]: r.data.coMatKhau })))
      .catch(() => {});

  useEffect(() => { if (donViDangChon) docTrangThaiMk(donViDangChon); }, [selected]);

  const luuMatKhau = async () => {
    if (!donViDangChon || !mkGiaTri) return;
    try {
      await saveTctCredential(donViDangChon.id, mkGiaTri);
      message.success(`Đã lưu mật khẩu cổng TCT cho ${donViDangChon.code}`);
      setMkMo(false); setMkGiaTri("");
      docTrangThaiMk(donViDangChon);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được mật khẩu"));
    }
  };

  const batDauLayHd = async () => {
    if (selected.length === 0) return;
    if (denThang < tuThang) { message.error("Đến tháng phải ≥ Từ tháng"); return; }
    setDangBatDau(true);
    try {
      const r = await fetchStart(
        selected as string[], namLamViec, tuThang, denThang, huong, xoaTruoc);
      setPhien(r.data);
      message.success(`Đã xếp hàng ${r.data.cac.length} lượt — lấy xong sẽ tự nạp vào database`);
    } catch (e) {
      message.error(loiApi(e, "Không bắt đầu được phiên lấy HĐ"));
    } finally {
      setDangBatDau(false);
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
        // Người phát hành luôn là NGƯỜI BÁN, kể cả hóa đơn ra (khi đó là chính mình)
        mstPhatHanh: hd.mstBan,
        tenKh: hd.huong === "VAO" ? hd.tenBan : hd.tenMua,
        diaChi: "", tienHang: hd.tienHang, tienVat: hd.tienVat, tienCk: 0,
        matHangs: hd.matHangs,
      });
      const d = r.data;
      message.success(`${d.capNhat ? "Đã cập nhật" : "Đã thêm"} ${d.maHd}`
                    + ` — ${d.soDongHang} dòng hàng, dời ${d.moved} file`);
      if (d.loiDoiFile) message.warning(`Đã ghi DB nhưng không dời được file: ${d.loiDoiFile}`);
      // Hóa đơn đã vào sổ thì bỏ khỏi danh sách và cập nhật lại cột đếm
      setDsConLai((ds) => {
        const conLai = ds.filter((x) => x.tenFile !== hd.tenFile);
        // Nhảy sang hóa đơn kế tiếp để làm liền mạch, hết thì bỏ chọn
        setChonFile(conLai.length ? conLai[0].tenFile : null);
        return conLai;
      });
      docFileLoi(dangHoatDong);
    } catch (e) {
      message.error(loiApi(e, "Không nạp được hóa đơn này"));
    } finally {
      setDangNap(null);
    }
  };

  // NT-02: chiDonViThue = true → bỏ cả 'internal' lẫn 'noibo'. Đơn vị nội bộ không
  // có hóa đơn trên cổng TCT, hiện lên chỉ tổ chọn nhầm rồi chạy một lượt vô ích.
  const napDanhSach = (baoOnKhiXong = false) => {
    setLoading(true);
    getAdminTenants(false, true)
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

  const chonTheoKyKhai = (khaiQuy: boolean) =>
    setSelected(dangHoatDong.filter((t) => t.khaiQuy === khaiQuy).map((t) => t.id));

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);

  // NT-04: luôn hiện SỐ, không có thì 0. Bấm vào số > 0 là mở thẳng form chi tiết.
  const oDemFile = (r: AdminTenant, lay: (i: LeftoverInfo) => number) => {
    const info = fileLoi[r.id];
    const n = info ? lay(info) : 0;
    if (n === 0) return <Typography.Text type="secondary">0</Typography.Text>;
    return (
      <a onClick={(ev) => { ev.stopPropagation(); moModalConLai(r); }}
         title="Bấm để xem chi tiết từng hóa đơn còn nằm lại">
        <b style={{ color: "#cf1322" }}>{n}</b>
      </a>
    );
  };

  // Màn nào chỉ hiện cột của hướng đó. Tích "Cả vào và ra" thì mới hiện đủ hai cột —
  // lúc đó người dùng đang thật sự làm việc với cả hai chiều nên cần thấy cả hai.
  const cotConLai = caHaiHuong
    ? [
        { title: "VÀO", width: 66, align: "center" as const,
          render: (_: unknown, r: AdminTenant) => oDemFile(r, (i) => i.soVao) },
        { title: "RA", width: 66, align: "center" as const,
          render: (_: unknown, r: AdminTenant) => oDemFile(r, (i) => i.soRa) },
      ]
    : [
        { title: laDauRa ? "RA" : "VÀO", width: 80, align: "center" as const,
          render: (_: unknown, r: AdminTenant) =>
            oDemFile(r, (i) => (laDauRa ? i.soRa : i.soVao)) },
      ];

  const tenMan = laDauRa ? "Hóa đơn GTGT đầu ra" : "Hóa đơn GTGT đầu vào";
  const dangChay = !!phien?.dangChay;

  return (
    <div className={laDauRa ? "huong-ra" : "huong-vao"}>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={`${tenMan} — lấy từ cổng TCT, năm làm việc ${namLamViec}`}
        extra={<Button size="small" onClick={() => napDanhSach(true)} loading={loading}>
                 Đọc lại
               </Button>}
        styles={{ body: { paddingTop: 10 } }}
      >
        <div className="thanh-dieu-khien"
             style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Button size="small" onClick={() => chonTheoKyKhai(false)}>
            Đánh dấu các đơn vị khai Tháng
          </Button>
          <Button size="small" onClick={() => chonTheoKyKhai(true)}>
            Đánh dấu các đơn vị khai Quý
          </Button>
          <Button size="small" onClick={() => setSelected([])}
                  disabled={selected.length === 0}>
            Bỏ đánh dấu
          </Button>

          <Button size="small" type="primary" loading={dangBatDau}
                  disabled={selected.length === 0 || dangChay}
                  onClick={batDauLayHd}>
            Lấy hóa đơn điện tử
          </Button>
          {dangChay && (
            <Popconfirm title="Dừng phiên đang chạy?"
                        description="Lượt đang tải sẽ bị hủy giữa chừng."
                        okText="Dừng" cancelText="Thôi" onConfirm={() => fetchStop()}>
              <Button size="small" danger>Dừng</Button>
            </Popconfirm>
          )}

          <span style={{ flex: 1 }} />

          <span style={{ fontSize: 13 }}>Từ tháng</span>
          <Select size="small" style={{ width: 74 }} value={tuThang} onChange={setTuThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
          <span style={{ fontSize: 13 }}>Đến tháng</span>
          <Select size="small" style={{ width: 74 }} value={denThang} onChange={setDenThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
        </div>

        <div className="thanh-dieu-khien"
             style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Checkbox checked={caHaiHuong} onChange={(e) => doiCaHaiHuong(e.target.checked)}>
            Cả vào và ra
          </Checkbox>
          <Checkbox checked={xoaTruoc} onChange={(e) => setXoaTruoc(e.target.checked)}>
            <span style={{ color: xoaTruoc ? "#cf1322" : undefined }}>
              Gặp HĐ trùng: XÓA hẳn rồi ghi mới
            </span>
          </Checkbox>

          <span style={{ flex: 1 }} />

          <Button size="small"
                  danger={soFileCuaDonViChon > 0}
                  disabled={!donViDangChon || soFileCuaDonViChon === 0}
                  onClick={() => moModalConLai()}
                  title={
                    !donViDangChon
                      ? "Chọn đúng một đơn vị để xem"
                      : soFileCuaDonViChon === 0
                        ? "Đơn vị này không còn file nào ở raw\\"
                        : `Xem ${soFileCuaDonViChon} hóa đơn còn lại của ${donViDangChon.code}`
                  }>
            Xem file còn lại{soFileCuaDonViChon > 0 ? ` (${soFileCuaDonViChon})` : ""}
          </Button>
          <Button size="small" disabled={!donViDangChon}
                  onClick={() => { setMkGiaTri(""); setMkMo(true); }}>
            Mật khẩu cổng TCT
            {donViDangChon ? (mkDaCo[donViDangChon.id] ? " — đã có" : " — CHƯA có") : ""}
          </Button>
        </div>

        <Table
          className="luoi-gon"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={dangHoatDong}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={false}
          scroll={{ y: 290 }}
          columns={[
            { title: "Mã", dataIndex: "code", width: 150,
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: r.khaiQuy ? undefined : "#cf1322",
                               fontWeight: r.khaiQuy ? undefined : 600 }}>{v}</span> },
            { title: "Tên đơn vị", dataIndex: "name",
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: r.khaiQuy ? undefined : "#cf1322" }}>{v}</span> },
            { title: "MST", dataIndex: "taxCode", width: 130 },
            { title: "Kỳ khai", dataIndex: "khaiQuy", width: 90,
              render: (q: boolean) => q ? <Tag>Quý</Tag> : <Tag color="red">Tháng</Tag> },
            ...cotConLai,
          ]}
        />

        <Typography.Text type="secondary"
                         style={{ display: "block", marginTop: 6, fontSize: 12 }}>
          {selected.length} đơn vị × {Math.max(0, denThang - tuThang + 1)} tháng —{" "}
          {huong === "all" ? "cả vào và ra" : laDauRa ? "chỉ đầu ra" : "chỉ đầu vào"}.
          Chạy tuần tự từng đơn vị-tháng; lấy xong tự nạp vào database.
        </Typography.Text>

        {donViDangChon && mkDaCo[donViDangChon.id] === false && (
          <Alert style={{ marginTop: 8 }} type="warning" showIcon
                 message={`${donViDangChon.code} chưa khai mật khẩu cổng TCT — bấm "Mật khẩu cổng TCT" để nhập`} />
        )}
      </Card>

      {phien && phien.cac.length > 0 && (
        <Card size="small" title="Tiến độ lấy và nạp hóa đơn">
          <Progress
            percent={Math.round(
              (phien.cac.filter((x) => x.trangThai === "xong" || x.trangThai === "loi").length
                / phien.cac.length) * 100)}
            status={dangChay ? "active" : "normal"}
          />
          <Table
            className="luoi-gon" size="small" rowKey={(r) => `${r.tenantId}-${r.thang}`}
            dataSource={phien.cac} pagination={false}
            scroll={{ x: 1420, y: 260 }}
            columns={[
              { title: "Đơn vị", dataIndex: "code", width: 140, fixed: "left" },
              { title: "Kỳ", width: 80,
                render: (_: unknown, r) => `T${r.thang}/${r.nam}` },
              { title: "Hướng", dataIndex: "huong", width: 84,
                render: (v: string) => v
                  ? <Tag color={v === "RA" ? "blue" : v === "VAO" ? "red" : "purple"}>{v}</Tag>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              // Giờ bấm Lấy — không có nó thì nhìn bảng không biết đây là phiên vừa
              // chạy hay phiên từ hôm kia còn treo trên màn hình
              { title: "Bắt đầu", dataIndex: "batDau", width: 160,
                render: (v: string | null) => v
                  ? <span title={new Date(v).toLocaleString("vi-VN")}>
                      {new Date(v).toLocaleString("vi-VN",
                        { day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                          hour12: false })}
                    </span>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              { title: "Trạng thái", dataIndex: "trangThai", width: 100,
                render: (v: string) => {
                  const mau: Record<string, string> = {
                    cho: "default", dang_chay: "blue", xong: "green", loi: "red", huy: "orange",
                  };
                  const chu: Record<string, string> = {
                    cho: "Chờ", dang_chay: "Đang chạy", xong: "Xong", loi: "Lỗi", huy: "Đã hủy",
                  };
                  return <Tag color={mau[v]}>{chu[v] ?? v}</Tag>;
                } },
              { title: "Tải được", width: 100, align: "center",
                render: (_: unknown, r) => r.tong > 0 || r.taiOk > 0
                  ? <span title={`Tổng ${r.tong || r.taiOk} hóa đơn trong danh sách`
                               + (r.nguonDs === "excel" ? " (đếm từ Excel danh sách)" : "")}>
                      <b>{r.taiOk}</b>/{r.tong || r.taiOk}
                    </span>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              // Hai loại "không tải được" phải nằm riêng: 500-không-có-hồ-sơ-gốc là ca
              // BÌNH THƯỜNG của hóa đơn điện/viễn thông/ngân hàng, còn 429/504 mới là
              // thứ đáng đi tìm. Gộp chung thì lần nào cũng đỏ và không ai buồn đọc.
              { title: "Không có gốc", width: 110, align: "center",
                render: (_: unknown, r) => r.khongCoGoc > 0
                  ? <Tag color="gold"
                         title="HTTP 500 — cổng không giữ bản gốc (điện, viễn thông, ngân hàng). Hợp lệ, không phải lỗi.">
                      {r.khongCoGoc}
                    </Tag>
                  : <Typography.Text type="secondary">0</Typography.Text> },
              // 0 tô XANH chứ không để xám: đây là cột người dùng liếc vào để yên tâm.
              // Xám đọc như "chưa có số liệu", xanh mới nói rõ "đã chạy xong, sạch".
              { title: "Lỗi cần xem", width: 105, align: "center",
                render: (_: unknown, r) => r.loiThat > 0
                  ? <Tag color="red" title="429 / 504 / mạng hỏng — xem LOI_TAI_*.txt trong thư mục job">
                      {r.loiThat}
                    </Tag>
                  : <Tag color="green" title="Không có lỗi mạng hay lỗi cổng nào">0</Tag> },
              { title: "Đã nạp DB", width: 135, align: "center",
                render: (_: unknown, r) =>
                  r.phaNap === "dang_nap" ? <Tag color="blue">Đang nạp…</Tag>
                : r.phaNap === "loi"      ? <Tag color="red" title={r.napThongDiep ?? ""}>Nạp hỏng</Tag>
                : r.phaNap === "xong"     ? <span title={r.napThongDiep ?? ""}>
                                              <b>{r.napMoi}</b> mới
                                              {r.napCapNhat > 0 && ` · ${r.napCapNhat} sửa`}
                                            </span>
                : <Typography.Text type="secondary">—</Typography.Text> },
              { title: "Diễn biến", dataIndex: "thongDiep", ellipsis: true,
                render: (v: string, r) => r.loi
                  ? <Typography.Text type="danger" title={r.loi}>{r.loi}</Typography.Text>
                  : <span title={r.napThongDiep ?? v}>{r.napThongDiep || v}</span> },
            ]}
          />
        </Card>
      )}

      {/* Bảng "7 lần gần nhất" đã bỏ theo yêu cầu — chỉ giữ tiến độ. Nhật ký từng
          lượt vẫn ghi vào ActivityLog, muốn tra thì sang màn Nhật ký hệ thống lọc
          theo hành động LAY_HD. */}

      <Modal
        title={`Tài khoản cổng Tổng cục Thuế — ${donViDangChon?.code ?? ""}`}
        open={mkMo} onCancel={() => setMkMo(false)} onOk={luuMatKhau}
        okText="Lưu" cancelText="Thôi" okButtonProps={{ disabled: !mkGiaTri }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          MST lấy sẵn từ hồ sơ đơn vị: <b>{donViDangChon?.taxCode || "(chưa có MST)"}</b>.
          Chỉ cần nhập mật khẩu. Mật khẩu được mã hóa trước khi lưu và không bao giờ
          hiển thị lại — muốn đổi thì nhập đè.
        </Typography.Paragraph>
        <Input.Password autoFocus placeholder="Mật khẩu cổng hoadondientu.gdt.gov.vn"
                        value={mkGiaTri} onChange={(e) => setMkGiaTri(e.target.value)}
                        onPressEnter={luuMatKhau} />
      </Modal>

      <Modal
        title={`File còn lại trong raw\\ — ${modalDonVi?.code ?? ""} `
             + `(T${tuThang}–T${denThang}, ${huong === "all" ? "vào + ra"
                                            : laDauRa ? "đầu ra" : "đầu vào"})`}
        open={modalMo}
        onCancel={() => setModalMo(false)}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
        styles={{
          body: {
            height: "calc(100vh - 96px)",
            display: "flex", flexDirection: "column", gap: 8, overflow: "hidden",
          },
        }}
      >
        {/* ---------- KHUNG TRÊN: danh sách hóa đơn ----------
             Chia đôi cố định 50/50, mỗi khung có thanh trượt riêng. Chiều cao cuộn
             đặt bằng scroll.y để antd giữ tiêu đề cột đứng yên khi kéo. */}
        <div style={{ flex: "1 1 50%", minHeight: 0,
                      display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Typography.Text strong style={{ marginBottom: 2, fontSize: 13 }}>
          Hóa đơn còn trong raw\ ({dsConLai.length})
          <Typography.Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
            — bấm một dòng để xem mặt hàng bên dưới
          </Typography.Text>
        </Typography.Text>
        <Table
          className="luoi-gon"
          rowKey="tenFile"
          size="small"
          loading={modalTai}
          dataSource={dsConLai}
          pagination={false}
          // KHÔNG dùng sticky: nó ghim tiêu đề theo cửa sổ, chồng chéo với khung cuộn
          // mà scroll.y tạo ra. Chỉ scroll.y là đủ — antd tự giữ tiêu đề đứng yên.
          locale={{ emptyText: <Empty description="Không đọc được hóa đơn nào trong raw\" /> }}
          scroll={{ x: 1740, y: "calc(50vh - 94px)" }}
          onRow={(r: HoaDonConLai) => ({
            onClick: () => setChonFile(r.tenFile),
            style: {
              cursor: "pointer",
              background: r.tenFile === chonFile ? "#e6f4ff" : undefined,
            },
          })}
          columns={[
            { title: "Tháng", dataIndex: "thang", width: 70, fixed: "left" },
            { title: "Hướng", dataIndex: "huong", width: 80,
              render: (v: string) => <Tag color={v === "VAO" ? "red" : "blue"}>{v}</Tag> },
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
                <InputNumber size="small" controls={false} style={{ width: "100%" }} value={v}
                             onChange={(x) => suaHoaDon(r.tenFile, { tienHang: x ?? 0 })} />
              ) },
            { title: "VAT", dataIndex: "tienVat", width: 150,
              render: (v: number, r: HoaDonConLai) => (
                <InputNumber size="small" controls={false} style={{ width: "100%" }} value={v}
                             onChange={(x) => suaHoaDon(r.tenFile, { tienVat: x ?? 0 })} />
              ) },
            { title: "Tổng", dataIndex: "tongTien", width: 130, align: "right",
              render: (v: number) => <b>{v.toLocaleString("vi-VN")}</b> },
            // NT-05: cột "lệch bao nhiêu tiền" chuyển từ lưới chính về đây — lưới
            // chính chỉ cần biết SỐ LƯỢNG, còn quyết xử lý tay thì phải thấy số tiền.
            // Ngưỡng 10đ khớp SAI_SO_CHO_PHEP bên ImportService, nếu không thì hóa đơn
            // backend đã chấp nhận vẫn hiện đỏ ở đây.
            { title: "Lệch Σ line", width: 140, align: "right",
              render: (_: unknown, r: HoaDonConLai) => {
                const sum = r.matHangs.reduce((s, x) => s + x.thanhTien, 0);
                const lech = r.tienHang - sum;
                return Math.abs(lech) < 10
                  ? <Typography.Text type="secondary">0</Typography.Text>
                  : <b style={{ color: "#cf1322" }}
                       title={`Tiền hàng ${r.tienHang.toLocaleString("vi-VN")} `
                            + `− Σ line ${sum.toLocaleString("vi-VN")}`}>
                      {lech.toLocaleString("vi-VN")}
                    </b>;
              } },
            { title: "Vì sao còn nằm lại", dataIndex: "lyDo", width: 300, ellipsis: true,
              render: (v: string, r: HoaDonConLai) => (
                <Typography.Text type={r.coTrongExcel ? "danger" : "warning"} title={v}>
                  {v}
                </Typography.Text>
              ) },
            { title: "Tên file", dataIndex: "tenFile", width: 300, ellipsis: true },
          ]}
        />
        </div>

        {/* ---------- KHUNG DƯỚI: mặt hàng — nửa dưới màn hình, thanh trượt riêng ---------- */}
        <div style={{ flex: "1 1 50%", minHeight: 0,
                      display: "flex", flexDirection: "column",
                      borderTop: "2px solid #d9d9d9", paddingTop: 4, overflow: "hidden" }}>
          {!hdDangChon ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                   description="Chọn một hóa đơn ở trên để xem mặt hàng" />
          ) : (
            <>
              <Space wrap size={6} style={{ marginBottom: 3 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  Mặt hàng — {hdDangChon.khHd}/{hdDangChon.soHd} ({hdDangChon.matHangs.length} dòng)
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {hdDangChon.tenFile}
                </Typography.Text>
                {(() => {
                  const sum = hdDangChon.matHangs.reduce((s, x) => s + x.thanhTien, 0);
                  const lech = hdDangChon.tienHang - sum;
                  return lech === 0
                    ? <Tag color="green">Σ line khớp tiền hàng</Tag>
                    : <Tag color="red">
                        Σ line {sum.toLocaleString("vi-VN")} — lệch {lech.toLocaleString("vi-VN")}
                      </Tag>;
                })()}
                <Button size="small" onClick={() => xemHtml(hdDangChon)}>Xem ảnh HĐ (HTML)</Button>
                <Popconfirm
                  title="Nạp hóa đơn này vào database?"
                  description={`Mã sẽ ghi: ${hdDangChon.huong}_${hdDangChon.mstBan}`
                             + `_${hdDangChon.khHd}_${hdDangChon.soHd}`}
                  okText="Nạp" cancelText="Thôi"
                  onConfirm={() => napMotHoaDon(hdDangChon)}
                >
                  <Button size="small" type="primary" loading={dangNap === hdDangChon.tenFile}>
                    Ghi vào Hóa đơn
                  </Button>
                </Popconfirm>
              </Space>
              <Table
                className="luoi-gon"
                rowKey="stt" size="small" pagination={false}
                // Khai cả x: khi chỉ có y, antd tách tiêu đề và thân thành hai bảng
                // rời rồi tự đoán bề rộng — cột "Tên hàng" không có width nên hai bên
                // đoán khác nhau, tiêu đề lệch hẳn khỏi ô dữ liệu.
                // x = đúng tổng bề rộng 7 cột: 60+380+100+140+160+170+100
                scroll={{ x: 1110, y: "calc(50vh - 104px)" }}
                dataSource={hdDangChon.matHangs}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description="Hóa đơn không có dòng hàng" /> }}
                columns={[
                  { title: "STT", dataIndex: "stt", width: 60, fixed: "left" },
                  { title: "Tên hàng", dataIndex: "tenHang", width: 380,
                    render: (v: string, m: MatHang) => (
                      <Input size="small" value={v}
                             onChange={(e) => suaMatHang(hdDangChon.tenFile, m.stt,
                                                         { tenHang: e.target.value })} />
                    ) },
                  { title: "ĐVT", dataIndex: "dvt", width: 100,
                    render: (v: string, m: MatHang) => (
                      <Input size="small" value={v}
                             onChange={(e) => suaMatHang(hdDangChon.tenFile, m.stt,
                                                         { dvt: e.target.value })} />
                    ) },
                  { title: "Số lượng", dataIndex: "soLuong", width: 140,
                    render: (v: number, m: MatHang) => (
                      <InputNumber size="small" controls={false} style={{ width: "100%" }} value={v}
                                   onChange={(x) => suaMatHang(hdDangChon.tenFile, m.stt,
                                                               { soLuong: x ?? 0 })} />
                    ) },
                  { title: "Đơn giá", dataIndex: "donGia", width: 160,
                    render: (v: number, m: MatHang) => (
                      <InputNumber size="small" controls={false} style={{ width: "100%" }} value={v}
                                   onChange={(x) => suaMatHang(hdDangChon.tenFile, m.stt,
                                                               { donGia: x ?? 0 })} />
                    ) },
                  // Chỉ đọc — tự nhân lại từ số lượng × đơn giá. Đỏ khi số từ XML gốc
                  // chưa khớp tích, sửa số lượng hoặc đơn giá một cái là hết đỏ.
                  { title: "Thành tiền", dataIndex: "thanhTien", width: 170, align: "right",
                    render: (v: number, m: MatHang) => {
                      const lech = v - m.soLuong * m.donGia;
                      return (
                        <b style={{ color: Math.abs(lech) < 1 ? undefined : "#cf1322" }}
                           title={Math.abs(lech) < 1 ? "Khớp số lượng × đơn giá"
                                : `Lệch ${lech.toLocaleString("vi-VN")} so với SL × ĐG`}>
                          {v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}
                        </b>
                      );
                    } },
                  { title: "% VAT", dataIndex: "thueSuat", width: 100,
                    render: (v: string, m: MatHang) => (
                      <Input size="small" value={v}
                             onChange={(e) => suaMatHang(hdDangChon.tenFile, m.stt,
                                                         { thueSuat: e.target.value })} />
                    ) },
                ]}
                summary={(rows) => {
                  const sum = rows.reduce((s, x) => s + x.thanhTien, 0);
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5} align="right">
                        <b>Σ thành tiền</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <b style={{ color: hdDangChon.tienHang - sum === 0 ? "#389e0d" : "#cf1322" }}>
                          {sum.toLocaleString("vi-VN")}
                        </b>
                      </Table.Summary.Cell>
                      {/* Bảng có ĐÚNG 7 cột: STT, Tên hàng, ĐVT, Số lượng, Đơn giá,
                          Thành tiền, % VAT. Tổng colSpan phải bằng 7 (5+1+1). Trước đây
                          để 5+1+2=8 (còn sót từ hồi có cột SL × ĐG) khiến dòng tổng rộng
                          hơn bảng, kéo lệch toàn bộ thân so với tiêu đề. */}
                      <Table.Summary.Cell index={2} />
                    </Table.Summary.Row>
                  );
                }}
              />
            </>
          )}
        </div>
      </Modal>
    </Space>
    </div>
  );
}

// ============ RUỘT 2: đơn vị thường (TUAN_NGA…) ============
function HoaDonCuaDonVi({ huongMacDinh }: Props) {
  const { session } = useAuth();
  const ten = huongMacDinh === "ra" ? "Hóa đơn GTGT đầu ra" : "Hóa đơn GTGT đầu vào";
  return (
    <Card title={`${ten} — ${session?.tenant.name}`}>
      <Input.Search placeholder="Tìm theo số HĐ, MST, tên đối tác…" disabled />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Danh sách hóa đơn của đơn vị sẽ hiện ở đây sau khi có dữ liệu từ chức
        năng Lấy HĐ điện tử (WP-03) và màn hình làm kho (WP-04).
      </Typography.Paragraph>
    </Card>
  );
}

// ============ BỘ CHIA: nhìn claim tenant_type để chọn ruột ============
// Hai màn Đầu vào / Đầu ra là CÙNG một màn, chỉ khác hướng — nên chỉ có một chỗ
// sửa khi nghiệp vụ đổi, không có chuyện vá một bên quên bên kia.
export default function HoaDonDauVao({ huongMacDinh = "vao" }: Partial<Props> = {}) {
  const { session } = useAuth();
  return session?.tenant.tenantType === "internal"
    ? <ConsoleLayHoaDon huongMacDinh={huongMacDinh} />
    : <HoaDonCuaDonVi huongMacDinh={huongMacDinh} />;
}
