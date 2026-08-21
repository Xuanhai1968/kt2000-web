import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, Select, Table, Space, Button, Typography, Alert, Tag, message,
} from "antd";
import {
  PlusSquareOutlined, SaveOutlined,
  UploadOutlined, PrinterOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ccDanhSach, ccKhoiTao, ccLuu, ccNhapExcel, loiApi } from "../../api";
import type { ChamCong as ChamCongDto, DongBo } from "../../api";
import { useAuth } from "../../AuthContext";
import { useChieuCaoBang } from "./dungBang";
import { inGiay, esc, khoiDau } from "../inGiay";
import { KY_HIEU_CC, tongCongCua, THU_VN } from "./kyHieuChamCong";
import "./hop-dong.css";

const CAC_THANG = Array.from({ length: 12 }, (_, i) => i + 1);

interface Props {
  mo: boolean;
  onDong: () => void;
  /** Bỏ trống = đơn vị đang đăng nhập. Trang Hợp đồng truyền mã đơn vị đang tích. */
  maDonVi?: string;
  tenDonVi?: string | null;
  /**
   * XEM TRƯỚC nháp Excel, khóa theo THÁNG: { 1: [...], 2: [...] }.
   * Có prop này thì lưới lấy thẳng từ đây, KHÔNG gọi API — sổ chưa có gì để gọi.
   * Mọi đường ghi (Lưu, nhập thêm Excel, sửa ô) đều tắt: dòng nháp chưa có id thật.
   */
  xemTruoc?: Record<number, ChamCongDto[]> | null;
}

export default function ChamCong(
  { mo, onDong, maDonVi, tenDonVi, xemTruoc }: Props,
) {
  // Chế độ xem trước: dữ liệu tới từ nháp, chưa nằm trong sổ.
  const laXemTruoc = xemTruoc != null;
  const { session } = useAuth();

  // Chiều cao thân bảng: trừ lề modal + đầu modal + thanh nút + hàng tiêu đề.
  // Truyền vào scroll.y chứ không ép bằng CSS — xem dungBang.ts.
  const caoBang = useChieuCaoBang(200);

  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();

  const [thang, setThang] = useState(new Date().getMonth() + 1);
  const [ds, setDs] = useState<ChamCongDto[]>([]);
  const [tai, setTai] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [daSua, setDaSua] = useState(false);

  // Kết quả lần nhập Excel gần nhất — xem BangLuong.tsx, cùng một luật.
  const [boQua, setBoQua] = useState<DongBo[]>([]);
  const [tenFile, setTenFile] = useState<string | null>(null);
  const [canhBaoDv, setCanhBaoDv] = useState<string | null>(null);
  const [chanLuu, setChanLuu] = useState(false);
  const oFile = useRef<HTMLInputElement>(null);

  const xoaDauNhap = () => {
    setBoQua([]); setTenFile(null); setCanhBaoDv(null); setChanLuu(false);
  };

  const nhanDonVi = tenDonVi || maDonVi || session?.tenant.name || "đơn vị";

  // Số ngày thật của tháng — BR-CC-04: ô vượt quá phải khóa, tháng 2 không có ngày 30.
  const soNgay = useMemo(
    () => new Date(namLamViec, thang, 0).getDate(), [namLamViec, thang]);

  const nap = async (ma?: string, t = thang) => {
    // Nháp: lấy thẳng theo tháng, không gọi API. Tháng không có trong file thì rỗng.
    if (xemTruoc) {
      setDs(xemTruoc[t] ?? []);
      setDaSua(false);
      xoaDauNhap();
      return;
    }

    setTai(true);
    try {
      const r = await ccDanhSach(t, ma);
      setDs(r.data);
      setDaSua(false);
      xoaDauNhap();
    } catch (e) {
      setDs([]);
      message.error(loiApi(e, "Không đọc được bảng chấm công"));
    } finally {
      setTai(false);
    }
  };

  useEffect(() => {
    if (!mo) return;
    const id = setTimeout(() => void nap(maDonVi, thang), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, thang, xemTruoc]);


  // TỰ ĐỘNG nạp lại khi quay lại cửa sổ — thay cho nút "Làm mới" đã bỏ.
  //
  // Kế toán hay mở Excel/máy tính bỏ túi rồi quay về; trong lúc đó người khác có thể
  // đã sửa sổ. Trước dựa vào nút bấm tay: không bấm thì ngồi nhìn số cũ mà không biết.
  //
  // KHÔNG nạp khi đang có việc dở (đang lưu, hoặc bản nháp/đã sửa chưa ghi) — nạp đè
  // lúc đó là xóa trắng thứ người dùng vừa gõ, tệ hơn hẳn việc số hơi cũ.
  useEffect(() => {
    if (!mo) return;
    const khiQuayLai = () => {
      if (document.visibilityState !== "visible") return;
      if (daSua || dangLuu) return;
      void nap(maDonVi, thang);
    };
    window.addEventListener("focus", khiQuayLai);
    document.addEventListener("visibilitychange", khiQuayLai);
    return () => {
      window.removeEventListener("focus", khiQuayLai);
      document.removeEventListener("visibilitychange", khiQuayLai);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, thang, daSua, dangLuu]);

  const dsHien = ds;

  const suaO = (nhanSuId: number, chiSo: number, gt: string) => {
    setDs((cu) => cu.map((x) => {
      if (x.nhanSuId !== nhanSuId) return x;
      const ngay = [...x.ngay];
      ngay[chiSo] = gt || null;
      return { ...x, ngay, tongCong: tongCongCua(ngay) };
    }));
    setDaSua(true);
  };

  const luu = async () => {
    setDangLuu(true);
    try {
      const r = await ccLuu(thang, ds, maDonVi);
      message.success(r.data.message);
      setDaSua(false);
      await nap(maDonVi, thang);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được bảng chấm công"));
    } finally {
      setDangLuu(false);
    }
  };

  const khoiTao = async () => {
    try {
      const r = await ccKhoiTao(thang, maDonVi);
      message.success(r.data.message);
      await nap(maDonVi, thang);
    } catch (e) {
      message.error(loiApi(e, "Không khởi tạo được bảng chấm công"));
    }
  };

  // Thứ của từng ngày — dùng cả cho tiêu đề cột và bản in
  const thuCua = (d: number) => THU_VN[new Date(namLamViec, thang - 1, d).getDay()];
  const laCuoiTuan = (d: number) => {
    const t = new Date(namLamViec, thang - 1, d).getDay();
    return t === 0 || t === 6;
  };

  const COT: ColumnsType<ChamCongDto> = [
    { title: "STT", width: 46, align: "center", fixed: "left",
      render: (_, __, i) => i + 1 },
    { title: "Họ và tên", dataIndex: "hoTen", width: 170, fixed: "left", ellipsis: true,
      render: (v: string | null) => <b>{v}</b> },
    { title: "Chức vụ", dataIndex: "chucDanh", width: 120, fixed: "left", ellipsis: true },
    ...Array.from({ length: soNgay }, (_, i) => i + 1).map((d) => ({
      title: <div className="cc-dau-ngay"><div>{d}</div><div>{thuCua(d)}</div></div>,
      width: 40,
      align: "center" as const,
      onCell: () => ({ className: laCuoiTuan(d) ? "cc-cuoi-tuan" : "" }),
      render: (_: unknown, m: ChamCongDto) => (
        <input className="cc-o"
               value={m.ngay[d - 1] ?? ""}
               maxLength={4}
               // Xem trước: chỉ ĐỌC. Dòng nháp chưa có nhan_su_id thật nên suaO()
               // sẽ sửa nhầm dòng (khóa theo id âm), mà sửa xong cũng không lưu được.
               readOnly={laXemTruoc}
               onChange={(e) => suaO(m.nhanSuId, d - 1, e.target.value)}
               title={laXemTruoc
                 ? "Đang xem trước nháp — chưa sửa được"
                 : KY_HIEU_CC[(m.ngay[d - 1] ?? "").toUpperCase()] ?? ""} />
      ),
    })),
    { title: "Tổng", dataIndex: "tongCong", width: 62, align: "right", fixed: "right",
      render: (v: number | null) => <b>{v ?? 0}</b> },
  ];

  // ===== NHẬP TỪ FILE EXCEL =====

  const chayNhap = async (f: File) => {
    setTai(true);
    try {
      const r = await ccNhapExcel(thang, f, maDonVi);
      const { dong, bo, sheet, canhBaoDonVi, dungDonVi, maDonViFile } = r.data;

      setCanhBaoDv(canhBaoDonVi);

      // File của ĐƠN VỊ KHÁC: không nạp lên lưới. Xem mô tả ở BangLuong.tsx.
      if (!dungDonVi) {
        setChanLuu(true);
        setTenFile(f.name);
        setBoQua([]);
        Modal.error({
          title: "Sai đơn vị — không nhập được",
          content: (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>{canhBaoDonVi}</div>
              {maDonViFile && (
                <div style={{ marginTop: 8 }}>
                  File: <b>{maDonViFile}</b> · đang mở:{" "}
                  <b>{maDonVi ?? "đơn vị của bạn"}</b>
                </div>
              )}
            </div>
          ),
        });
        return;
      }

      setChanLuu(false);

      if (dong.length === 0) {
        setBoQua(bo);
        setTenFile(f.name);
        message.warning(
          `Không nhận được dòng nào từ ${f.name}`
          + (bo.length > 0 ? ` — xem ${bo.length} dòng bị bỏ bên dưới` : ""));
        return;
      }

      setDs(dong);
      // Đánh dấu ĐÃ SỬA để nút Lưu bật lên: dữ liệu trên lưới lúc này đến từ file,
      // chưa có trong sổ.
      setDaSua(true);
      setBoQua(bo);
      setTenFile(f.name);
      message.success(
        `Đã đọc ${dong.length} người từ ${f.name}`
        + (sheet ? ` (sheet "${sheet}")` : "")
        + (bo.length > 0 ? ` — bỏ ${bo.length} dòng` : "")
        + " — soát lại rồi bấm Lưu vào sổ");
    } catch (e) {
      message.error(loiApi(e, "Không đọc được file Excel"));
    } finally {
      setTai(false);
    }
  };

  const nhan = (f: File) => {
    // Nhập đè lên bảng đang có thì mất số đã gõ — hỏi trước.
    if (ds.length > 0) {
      Modal.confirm({
        title: "Nhập đè lên bảng chấm công đang có?",
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>Tháng {thang}/{namLamViec} đang có <b>{ds.length} người</b> trên lưới.</div>
            <div style={{ marginTop: 8 }}>
              Ký hiệu trong file sẽ thay chỗ ký hiệu đang xem. Bản đọc lên{" "}
              <b>chưa ghi vào sổ</b>, chỉ vào sổ khi bấm Lưu.
            </div>
          </div>
        ),
        okText: "Nhập file", cancelText: "Hủy",
        onOk: () => chayNhap(f),
      });
      return;
    }
    void chayNhap(f);
  };

  const inBang = () => {
    if (dsHien.length === 0) { message.info("Không có dòng nào để in"); return; }

    const dauNgay = Array.from({ length: soNgay }, (_, i) => i + 1)
      .map((d) => `<th class="c">${d}<br/>${thuCua(d)}</th>`).join("");

    const hang = dsHien.map((x, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(x.hoTen ?? "")}</td>
        <td>${esc(x.chucDanh ?? "")}</td>
        ${Array.from({ length: soNgay }, (_, k) => k)
          .map((k) => `<td class="c">${esc(x.ngay[k] ?? "")}</td>`).join("")}
        <td class="r"><b>${x.tongCong ?? 0}</b></td>
      </tr>`).join("");

    // Ký hiệu in kèm chân trang — khuôn Excel gốc cũng có dòng "Ký hiệu chấm công:"
    const chuGiai = Object.entries(KY_HIEU_CC)
      .map(([k, v]) => `${k} = ${v}`).join(" · ");

    // A4 NGANG: 31 cột ngày không vừa khổ dọc.
    inGiay(`CHAM_CONG_T${thang}_${namLamViec}`, `
      <div class="pxk">
        ${khoiDau(nhanDonVi)}
        <div class="pxk__title">BẢNG CHẤM CÔNG NHÂN VIÊN</div>
        <div class="pxk__subtitle">
          Tháng ${String(thang).padStart(2, "0")} năm ${namLamViec}
        </div>
        <table class="pxk__items cc-in">
          <thead>
            <tr>
              <th style="width:26px">STT</th>
              <th style="width:150px">Họ và tên</th>
              <th style="width:90px">Chức vụ</th>
              ${dauNgay}
              <th style="width:40px">Tổng</th>
            </tr>
          </thead>
          <tbody>${hang}</tbody>
        </table>
        <div class="pxk__footer" style="text-align:left">
          <b>Ký hiệu chấm công:</b> ${esc(chuGiai)}
        </div>
        <table class="pxk__sigs">
          <tr><th style="width:50%">Người chấm công</th><th>Giám đốc</th></tr>
          <tr><td>(Ký, họ tên)</td><td>(Ký, họ tên)</td></tr>
          <tr class="pxk__sigs-space"><td></td><td></td></tr>
        </table>
      </div>`, "A4 landscape");
  };

  const thanhLoc = (
    <>
      <Space size={4}>
        <span className="hd-nhan">Tháng</span>
        <Select size="small" style={{ width: 100 }} value={thang}
                onChange={(v) => setThang(v)}
                options={CAC_THANG.map((m) => ({ value: m, label: `Tháng ${m}` }))} />
      </Space>
      <span className="hd-nhan">Năm {namLamViec}</span>

      <Button icon={<PlusSquareOutlined />} onClick={() => void khoiTao()}
              disabled={laXemTruoc}
              title={laXemTruoc
                ? "Đang xem trước nháp — lưu vào sổ rồi mới tạo tháng được"
                : "Sinh dòng cho nhân sự chưa có, điền sẵn chủ nhật"}>
        Tạo tháng
      </Button>

      <input type="file" accept=".xls,.xlsx" hidden ref={oFile}
             onChange={(e) => {
               const f = e.target.files?.[0];
               e.target.value = "";
               if (f) nhan(f);
             }} />

      <Button icon={<UploadOutlined />} loading={tai}
              onClick={() => oFile.current?.click()}
              disabled={laXemTruoc}
              title={laXemTruoc
                ? "Đang xem trước nháp của màn Hợp đồng — lưu vào sổ rồi mới nhập tiếp"
                : "Đọc bảng chấm công từ file Excel của kế toán (.xls hoặc .xlsx)"
                  + "\nChỉ hiện lên để xem — bấm Lưu vào sổ mới ghi"}>
        Nhập Excel
      </Button>

      <Button type="primary" icon={<SaveOutlined />} loading={dangLuu}
              disabled={!daSua || chanLuu || laXemTruoc}
              onClick={() => void luu()}
              title={laXemTruoc
                ? "Đang xem trước nháp — bấm \"Lưu vào DB\" ở màn Hợp đồng để ghi cả lượt"
                : chanLuu
                ? "File đang xem là của đơn vị khác — không được ghi vào sổ này"
                : daSua ? "Ghi bảng chấm công đang hiện vào sổ"
                        : "Chưa có thay đổi nào"}>
        Lưu vào DB
      </Button>
      <Button icon={<PrinterOutlined />} onClick={inBang}>
        Print
      </Button>
    </>
  );

  return (
    <Modal
      className="cham-cong"
      title={
        <span>
          Bảng chấm công
          <span className="hd-ten-dv"> — {nhanDonVi}</span>
          {/* Nhãn ngay trên tiêu đề: mở modal ra là biết đang xem nháp hay xem sổ. */}
          {laXemTruoc && (
            <Tag color="orange" style={{ marginLeft: 10 }}>
              XEM TRƯỚC — chưa lưu vào sổ
            </Tag>
          )}
          {dsHien.length > 0 && (
            <span className="hd-dem"> · {dsHien.length} người</span>
          )}
          {daSua && (
            <Typography.Text type="warning" style={{ fontSize: 13, marginLeft: 8 }}>
              chưa lưu
            </Typography.Text>
          )}
        </span>
      }
      open={mo}
      // Còn thay đổi chưa lưu thì KHÔNG cho bấm nền để đóng: cả tháng chấm công mất
      // vì một cú bấm hụt ra ngoài là quá đắt.
      maskClosable={!daSua}
      onCancel={onDong}
      footer={null}
      width="98vw"
      style={{ top: 12, maxWidth: "98vw" }}
      styles={{
        container: { display: "flex", flexDirection: "column",
                     height: "calc(100vh - 32px)" },
        body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 8 },
      }}
    >
      <div className="hd-modal">
        <Space size={8} wrap className="hd-thanh">{thanhLoc}</Space>

        {canhBaoDv && (
          <Alert
            type={chanLuu ? "error" : "warning"}
            showIcon
            style={{ marginBottom: 8 }}
            message={chanLuu ? "File của đơn vị khác — đã chặn ghi vào sổ"
                             : "Không xác định được đơn vị của file"}
            description={canhBaoDv}
            closable={!chanLuu}
            onClose={() => setCanhBaoDv(null)}
          />
        )}

        {boQua.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 8 }}
            message={`${boQua.length} dòng trong file không đưa lên được`
                     + (tenFile ? ` (${tenFile})` : "")}
            description={
              <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12.5 }}>
                {boQua.map((b, i) => (
                  <div key={i}>
                    dòng {b.dong}
                    {b.hoTen ? <> · <b>{b.hoTen}</b></> : null} — {b.lyDo}
                  </div>
                ))}
              </div>
            }
            closable
            onClose={() => setBoQua([])}
          />
        )}
        <div className="hd-vung-bang">
      <Table<ChamCongDto>
        className="hd-bang"
        size="small"
        rowKey="nhanSuId"
        dataSource={dsHien}
        columns={COT}
        loading={tai}
        pagination={false}
        scroll={{ x: 420 + soNgay * 40, y: caoBang }}
        locale={{ emptyText:
          "Tháng này chưa có dòng chấm công — bấm Khởi tạo tháng" }}
      />
        </div>
      </div>
    </Modal>
  );
}
