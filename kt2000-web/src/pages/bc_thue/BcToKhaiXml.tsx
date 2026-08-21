import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Modal, Table, Upload, Tag, Alert, Empty, message,
         Select, Button, Tooltip, Input } from "antd";
import { InboxOutlined, FileZipOutlined, SaveOutlined,
         FolderOpenOutlined, CheckCircleFilled, PlusCircleOutlined,
         CloseCircleOutlined, CopyOutlined, FolderFilled, FileTextOutlined,
         ArrowUpOutlined, HomeOutlined, AimOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBcToKhai, thueNapXmlDaNop, thueDuongDanToKhai,
         thueLuuToKhaiTct, thueDuyetKhoToKhai, getAdminTenants, loiApi } from "../../api";
import type { DongBcToKhai, KetQuaDuyetKho } from "../../api";
import "./bc-to-khai-xml.css";

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const lech = (v: number | null | undefined) =>
  v == null ? "" : (
    <span className={v !== 0 ? "bc-lech" : "bc-khop"}>{tien(v)}</span>);

const duoiDuong = (s: string) => {
  const p = s.split(/[\\/]/).filter(Boolean);
  return p.length <= 2 ? s : "…\\" + p.slice(-2).join("\\");
};

const chepDuong = (s: string) => {
  navigator.clipboard.writeText(s)
    .then(() => message.success("Đã chép đường dẫn — dán vào Explorer để mở"))
    .catch(() => message.warning("Trình duyệt không cho chép — copy tay từ tooltip"));
};

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "";
};

interface Props {
  mo: boolean;
  onDong: () => void;
  nam: number;
  thang: number;
}

export default function BcToKhaiXml({ mo, onDong, nam, thang }: Props) {
  const [ds, setDs] = useState<DongBcToKhai[]>([]);
  const [tai, setTai] = useState(false);
  const [dangNap, setDangNap] = useState(false);
  const [ketQuaNap, setKetQuaNap] = useState<
    { tenFile: string; ok: boolean; message: string }[] | null>(null);

  const [donVi, setDonVi] = useState<{ code: string; name: string }[]>([]);
  const [maChon, setMaChon] = useState<string | undefined>();

  const [thangChon, setThangChon] = useState<number>(thang);

  const [moTruoc, setMoTruoc] = useState(mo);
  const [thangNgoai, setThangNgoai] = useState(thang);
  if (mo !== moTruoc || thang !== thangNgoai) {
    setMoTruoc(mo);
    setThangNgoai(thang);
    if (mo && thang !== thangChon) setThangChon(thang);
  }

  const [namTay, setNamTay] = useState<number | null>(null);
  const namChon = namTay ?? nam;
  const [fileChon, setFileChon] = useState<File | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [duongDan, setDuongDan] = useState<
    { duongDan: string; daCo: boolean } | null>(null);
  const [dangLuu, setDangLuu] = useState(false);

  const [thuMucTay, setThuMucTay] = useState<string | null>(null);

  const doiDonVi = (v: string) => { setMaChon(v); setThuMucTay(null); };
  const doiThang = (v: number) => { setThangChon(v); setThuMucTay(null); };
  const doiNam = (v: number) => { setNamTay(v); setThuMucTay(null); };
  const [moDuyet, setMoDuyet] = useState(false);
  const [dangDuyet, setDangDuyet] = useState(false);
  const [oDuyet, setODuyet] = useState<KetQuaDuyetKho | null>(null);

  const duongHienTai = thuMucTay ?? duongDan?.duongDan ?? "";

  const duyet = async (duong?: string) => {
    setDangDuyet(true);
    try {
      const r = await thueDuyetKhoToKhai(duong);
      setODuyet(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được thư mục"));
    } finally {
      setDangDuyet(false);
    }
  };

  const moCuaSoDuyet = async () => {
    setMoDuyet(true);
    setODuyet(null);
    await duyet(duongHienTai || undefined);
  };

  const nap = async () => {
    setTai(true);
    try {
      const r = await thueBcToKhai(nam);
      setDs(r.data.dong ?? []);
    } catch (e) {
      setDs([]);
      message.error(loiApi(e, "Không đọc được danh sách tờ khai"));
    } finally {
      setTai(false);
    }
  };

  useEffect(() => {
    if (!mo) return;
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, nam]);

  useEffect(() => {
    if (!mo || donVi.length) return;
    getAdminTenants(false, true)
      .then((r) => setDonVi(r.data.map((t) => ({ code: t.code, name: t.name }))))
      .catch((e) => message.error(loiApi(e, "Không đọc được danh sách đơn vị")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo]);

  useEffect(() => {
    let bo = false;
    if (!maChon) return;
    thueDuongDanToKhai(maChon, thangChon, namChon)
      .then((r) => { if (!bo) setDuongDan(
        { duongDan: r.data.duongDan, daCo: r.data.daCo }); })
      .catch(() => { if (!bo) setDuongDan(null); });
    return () => { bo = true; };
  }, [maChon, thangChon, namChon]);

  const luu = async () => {
    if (!fileChon || !maChon) return;
    setDangLuu(true);
    try {
      const r = await thueLuuToKhaiTct(fileChon, maChon, thangChon, namChon,
                                       ghiChu, thuMucTay ?? undefined);
      const d = r.data;

      setKetQuaNap([
        ...d.canhBao.map((c) => ({ tenFile: fileChon.name, ok: false,
                                   message: `⚠ ${c}` })),
        { tenFile: fileChon.name, ok: d.daNapSoLieu && d.soLech === 0,
          message: `${d.message} — đã ghi vào ${d.duongDan}` },
        ...d.lech.slice(0, 8).map((x) => ({
          tenFile: `Chỉ tiêu ${x.ma}`, ok: false,
          message: `tự lập ${(x.tuLap ?? 0).toLocaleString("vi-VN")} `
                 + `≠ TCT ${(x.tct ?? 0).toLocaleString("vi-VN")}` })),
      ]);

      if (d.daNapSoLieu && d.soLech === 0 && d.canhBao.length === 0)
        message.success("Đã lưu và nạp số liệu — khớp hoàn toàn");
      else message.warning(d.message);

      setFileChon(null);
      setGhiChu("");
      await nap();
      const dd = await thueDuongDanToKhai(maChon, thangChon, namChon);
      setDuongDan({ duongDan: dd.data.duongDan, daCo: dd.data.daCo });
    } catch (e) {
      message.error(loiApi(e, "Không lưu được tờ khai"));
    } finally {
      setDangLuu(false);
    }
  };

  const thaFile = async (files: File[]) => {
    setDangNap(true);
    const gop: { tenFile: string; ok: boolean; message: string }[] = [];
    try {
      for (const f of files) {
        try {
          const r = await thueNapXmlDaNop(f);
          gop.push(...(r.data.ketQua ?? []));
        } catch (e) {
          gop.push({ tenFile: f.name, ok: false,
                     message: loiApi(e, "Không nạp được") });
        }
      }
      setKetQuaNap(gop);
      const ok = gop.filter((x) => x.ok).length;
      if (ok > 0) {
        message.success(`Đã gắn ${ok}/${gop.length} tờ khai`);
        await nap();
      } else message.warning("Không gắn được tờ khai nào — xem chi tiết bên dưới");
    } finally {
      setDangNap(false);
    }
  };

  const cot = useMemo<ColumnsType<DongBcToKhai>>(() => [
    { title: "STT", dataIndex: "stt", width: 48, align: "right", fixed: "left" },
    { title: "Đơn vị", dataIndex: "maDonVi", width: 150, fixed: "left",
      render: (v: string, m) => <span title={m.tenDonVi ?? v}>{v}</span> },
    { title: "Năm", dataIndex: "nam", width: 64, align: "center",
      sorter: (a, b) => a.nam - b.nam },
    { title: "Tháng", dataIndex: "thang", width: 64, align: "center",
      sorter: (a, b) => a.thang - b.thang },
    { title: "Kỳ", dataIndex: "kyKeKhai", width: 76, align: "center" },
    { title: "Lần khai", dataIndex: "lanNop", width: 68, align: "center",
      render: (v: number) => v ? <Tag color="orange">BS {v}</Tag> : "" },
    { title: "Tồn đầu", dataIndex: "tonDau", width: 120, align: "right",
      render: tien },
    { title: "GT Mua Vào", dataIndex: "gtMuaVao", width: 130, align: "right",
      render: tien },
    { title: "VAT Vào", dataIndex: "vatVao", width: 120, align: "right",
      render: tien },
    { title: "VAT K.Trừ", dataIndex: "vatKhauTru", width: 120, align: "right",
      render: tien },
    { title: "GT Bán Ra", dataIndex: "gtBanRa", width: 130, align: "right",
      render: tien },
    { title: "VAT Ra", dataIndex: "vatRa", width: 120, align: "right",
      render: tien },
    { title: "VAT Phải nộp", dataIndex: "vatPhaiNop", width: 120, align: "right",
      render: tien },
    { title: "VAT Tồn cuối", dataIndex: "tonCuoi", width: 120, align: "right",
      render: tien },
    { title: "GT HĐ Vào", dataIndex: "gtHdVao", width: 130, align: "right",
      render: tien },
    { title: "GT VAT Vào", dataIndex: "gtVatVao", width: 120, align: "right",
      render: tien },
    { title: "GT HĐ Ra", dataIndex: "gtHdRa", width: 130, align: "right",
      render: tien },
    { title: "GT VAT Ra", dataIndex: "gtVatRa", width: 120, align: "right",
      render: tien },
    { title: "Lệch GT HĐ Ra", dataIndex: "lechGtHdRa", width: 130, align: "right",
      render: lech },
    { title: "Lệch VAT Ra", dataIndex: "lechVatRa", width: 120, align: "right",
      render: lech },
    { title: "Lệch GT HĐ Vào", dataIndex: "lechGtHdVao", width: 130, align: "right",
      render: lech },
    { title: "Lệch VAT Vào", dataIndex: "lechVatVao", width: 120, align: "right",
      render: lech },

    { title: "Đã nộp", dataIndex: "daNop", width: 130, align: "center",
      render: (v: boolean, m) => v
        ? <Tag color="green" title={m.xmlName ?? ""}>Có XML cổng</Tag>
        : <Tag>Chưa nạp XML</Tag> },

    { title: "Đường dẫn", dataIndex: "xmlPath", width: 260,
      render: (v: string | null) => v
        ? <Tooltip title={v}>
            <code className="bc-duong-o" onClick={() => chepDuong(v)}>
              {duoiDuong(v)}
            </code>
          </Tooltip>
        : "" },
    { title: "Ngày lập", dataIndex: "ngayLap", width: 96, align: "center",
      render: (v: string | null) => ngayNgan(v) },
    { title: "Người lập", dataIndex: "nguoiLap", width: 100 },
    { title: "Ghi chú", dataIndex: "ghiChu", width: 180, ellipsis: true },
  ], []);

  const RONG = 48 + 150 + 64 + 64 + 76 + 68  // STT, Đơn vị, Năm, Tháng, Kỳ, Lần khai
             + 120 + 130 + 120 + 120         // Tồn đầu, GT Mua Vào, VAT Vào, VAT K.Trừ
             + 130 + 120 + 120 + 120         // GT Bán Ra, VAT Ra, VAT Phải nộp, Tồn cuối
             + 130 + 120 + 130 + 120         // 4 cột GT … từ sổ
             + 130 + 120 + 130 + 120         // 4 cột Lệch
             + 130 + 260                     // Đã nộp, Đường dẫn
             + 96 + 100 + 180;               // Ngày lập, Người lập, Ghi chú

  const truLuoi = 144 + (fileChon ? 297 : 255);

  return (
    <Modal
      title="BC lấy tờ khai XML"
      open={mo}
      onCancel={onDong}
      footer={null}
      width="100vw"
      style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
      styles={{ body: { height: "calc(100vh - 88px)", overflow: "hidden", padding: 10 } }}
    >

      <div className="bc-tkxml"
           style={{ "--bc-tru": `${truLuoi}px` } as CSSProperties}>
        <div className="bc-tt">
          <label className="bc-tt-o bc-tt-rong2">
            <span className="bc-tt-nhan">Đơn vị</span>
            <Select
              showSearch
              placeholder="Chọn đơn vị"
              value={maChon}
              onChange={doiDonVi}
              optionFilterProp="label"
              options={donVi.map((t) => ({
                value: t.code, label: `${t.code} — ${t.name}` }))}
            />
          </label>

          <label className="bc-tt-o">
            <span className="bc-tt-nhan">Tháng</span>
            <Select
              value={thangChon}
              onChange={doiThang}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1, label: `Tháng ${i + 1}` }))}
            />
          </label>
          <div className="bc-tt-o bc-tt-rong2">
            <span className="bc-tt-nhan">Thư mục</span>
            <Input
              readOnly
              className="bc-tt-duongo"
              value={duongHienTai}
              placeholder={maChon ? "Chưa cấu hình kho tờ khai trên máy chủ"
                                  : "Chọn đơn vị để xem đường dẫn lưu"}
              prefix={<FolderOpenOutlined className="bc-duong-icon" />}
              suffix={
                duongHienTai ? (
                  <Tooltip title="Chép đường dẫn">
                    <CopyOutlined className="bc-tt-chep"
                                  onClick={() => chepDuong(duongHienTai)} />
                  </Tooltip>
                ) : null}
              onClick={() => { if (duongHienTai) chepDuong(duongHienTai); }}
            />
            {thuMucTay
              ? <Tag color="purple">Chọn tay</Tag>
              : duongDan?.daCo
                ? <Tag color="green" icon={<CheckCircleFilled />}>Đã có</Tag>
                : duongDan
                  ? <Tag color="blue" icon={<PlusCircleOutlined />}>Tạo mới</Tag>
                  : null}
            <Tooltip title={!maChon ? "Chọn đơn vị trước đã"
                          : !duongHienTai ? "Đang lấy đường dẫn"
                          : `Mở ${duongHienTai}`}>
              <Button icon={<FolderOpenOutlined />}
                      disabled={!maChon || !duongHienTai}
                      onClick={() => void moCuaSoDuyet()}>
                Mở
              </Button>
            </Tooltip>
          </div>

          <label className="bc-tt-o">
            <span className="bc-tt-nhan">Dữ liệu năm</span>
            <Select
              value={namChon}
              onChange={doiNam}
              options={[nam - 1, nam, nam + 1].map((n) => ({
                value: n, label: `Năm ${n}` }))}
            />
          </label>

          <label className="bc-tt-o bc-tt-rong3">
            <span className="bc-tt-nhan">Ghi chú</span>
            <Input
              placeholder="Ghi chú cho lượt lưu này (không bắt buộc)"
              maxLength={500}
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              onPressEnter={() => { if (fileChon && maChon) void luu(); }}
            />
          </label>
        </div>

        <div className="bc-dau">
          <Upload.Dragger
            multiple
            accept=".xml,.zip"
            showUploadList={false}
            disabled={dangNap || dangLuu}
            className={`bc-tha${fileChon ? " bc-tha-co-file" : ""}`}
            beforeUpload={(_, danhSach) => {
              const fs = danhSach as File[];
              if (fs.length === 1) { setFileChon(fs[0]); setKetQuaNap(null); }
              else void thaFile(fs);
              return Upload.LIST_IGNORE;
            }}
          >
            <p className="bc-tha-icon">
              {dangNap ? <FileZipOutlined spin /> : <InboxOutlined />}
            </p>
            <p className="bc-tha-chu">
              {fileChon
                ? <>Đã chọn <b>{fileChon.name}</b> — kiểm đơn vị, kỳ và đường dẫn
                    bên dưới rồi bấm <b>Lưu vào kho</b></>
                : "Kéo thả file tờ khai cổng TCT trả về sau khi nộp"}
            </p>
            <p className="bc-tha-phu">
              {fileChon
                ? "Thả file khác để thay"
                : <>Thả <b>một</b> file để chọn đơn vị/kỳ rồi lưu vào kho — thả{" "}
                   <b>nhiều</b> file thì tự khớp theo MST và kỳ ghi trong file</>}
            </p>
            <p className="bc-tha-nut">
              <Button size="small" icon={<FolderOpenOutlined />}
                      disabled={dangNap || dangLuu}>
                Chọn file
              </Button>
            </p>
          </Upload.Dragger>
        </div>


        {fileChon && (
          <div className="bc-luu">

            <span className="bc-luu-nhan">
              Sắp ghi <b>{fileChon.name}</b> vào kỳ{" "}
              <b>{String(thangChon).padStart(2, "0")}/{namChon}</b>
              {maChon ? <> của <b>{maChon}</b></> : ""}
            </span>

            <span className="bc-luu-day" />

            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={dangLuu}
              disabled={!maChon || !duongDan}
              onClick={() => void luu()}
            >
              Lưu vào kho
            </Button>
            <Button
              icon={<CloseCircleOutlined />}
              disabled={dangLuu}
              onClick={() => setFileChon(null)}
            >
              Bỏ
            </Button>
          </div>
        )}

        {/* ===== KẾT QUẢ NẠP FILE ===== */}
        {ketQuaNap && (
          <Alert
            className="bc-kq"
            type={ketQuaNap.every((x) => x.ok) ? "success" : "warning"}
            showIcon
            closable
            onClose={() => setKetQuaNap(null)}
            message={`Nạp ${ketQuaNap.filter((x) => x.ok).length}/${ketQuaNap.length} file`}
            description={
              <ul className="bc-kq-ds">
                {ketQuaNap.map((x, i) => (
                  <li key={i} className={x.ok ? "bc-ok" : "bc-loi"}>
                    <b>{x.tenFile}</b> — {x.message}
                  </li>
                ))}
              </ul>}
          />
        )}

        <Table<DongBcToKhai>
          className="bc-luoi"
          size="small"
          rowKey={(m) => `${m.maDonVi}|${m.kyKeKhai}|${m.lanNop}`}
          dataSource={ds}
          columns={cot}
          loading={tai}
          pagination={false}
          scroll={{ x: RONG, y: `calc(100vh - ${truLuoi}px)` }}
          rowClassName={(m) => m.daNop ? "bc-da-nop" : ""}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                      description={`Năm ${nam} chưa có tờ khai nào được lưu`} /> }}
        />
      </div>

      <Modal
        title="Duyệt kho tờ khai trên máy chủ"
        open={moDuyet}
        onCancel={() => setMoDuyet(false)}
        width={860}
        okText={oDuyet && oDuyet.thieuTang.length > 0
          ? "Tạo & chọn" : "Chọn thư mục này"}
        cancelText="Đóng"
        okButtonProps={{ disabled: !oDuyet }}
        onOk={() => {
          if (!oDuyet) return;
          const chon = oDuyet.thieuTang.length > 0
            ? oDuyet.duongDanXin : oDuyet.duongDan;
          setThuMucTay(chon);
          setMoDuyet(false);
          message.success("Đã điền đường dẫn vào ô Thư mục");
        }}
      >
        <div className="bc-duyet">
          <div className="bc-duyet-thanh">
            <Tooltip title="Về gốc kho">
              <Button size="small" icon={<HomeOutlined />}
                      disabled={dangDuyet || oDuyet?.laGoc}
                      onClick={() => void duyet(undefined)} />
            </Tooltip>
            <Tooltip title="Lên thư mục cha">
              <Button size="small" icon={<ArrowUpOutlined />}
                      disabled={dangDuyet || !oDuyet?.cha}
                      onClick={() => void duyet(oDuyet?.cha ?? undefined)} />
            </Tooltip>
            <Tooltip title="Về thư mục hệ thống gợi ý cho kỳ này">
              <Button size="small" icon={<AimOutlined />}
                      disabled={dangDuyet || !duongDan
                                || oDuyet?.duongDanXin === duongDan.duongDan}
                      onClick={() => void duyet(duongDan?.duongDan)} />
            </Tooltip>
            <code className="bc-duyet-duong">{oDuyet?.duongDan ?? "…"}</code>
          </div>

          {oDuyet && oDuyet.thieuTang.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={`Chưa có thư mục ${oDuyet.thieuTang.join("\\")}`}
              description={
                <>Đang mở thư mục cha gần nhất có thật. Bấm <b>Tạo &amp; chọn</b> để
                  dùng đường dẫn đầy đủ{" "}
                  <code>{duoiDuong(oDuyet.duongDanXin)}</code> — thư mục sẽ được tạo
                  lúc lưu file.</>}
            />
          )}


          <div className="bc-duyet-ds">
            {dangDuyet ? (
              <div className="bc-duyet-trong">Đang đọc…</div>
            ) : !oDuyet ? (
              <div className="bc-duyet-trong">Chưa đọc được thư mục</div>
            ) : oDuyet.muc.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                     description="Thư mục rỗng — vẫn chọn được để lưu vào đây" />
            ) : (
              oDuyet.muc.map((m) => (
                <div
                  key={m.duongDan}
                  className={`bc-duyet-muc${m.laThuMuc ? " bc-duyet-tm" : ""}`}
                  onDoubleClick={() => { if (m.laThuMuc) void duyet(m.duongDan); }}
                  onClick={() => { if (m.laThuMuc) void duyet(m.duongDan); }}
                >
                  {m.laThuMuc
                    ? <FolderFilled className="bc-duyet-icon-tm" />
                    : <FileTextOutlined className="bc-duyet-icon-f" />}
                  <span className="bc-duyet-ten">{m.ten}</span>
                  <span className="bc-duyet-kich">
                    {m.laThuMuc ? "" : `${Math.max(1, Math.round(m.kich / 1024))} KB`}
                  </span>
                  <span className="bc-duyet-ngay">{ngayNgan(m.suaLuc)}</span>
                </div>
              ))
            )}
          </div>

          <div className="bc-duyet-chan">
            Bấm vào thư mục để đi vào. Bấm <b>Chọn thư mục này</b> để điền đường dẫn
            đang mở vào ô Thư mục.
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
