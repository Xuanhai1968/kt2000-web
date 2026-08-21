import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select, Table, Space, Button, InputNumber, Typography, Modal, Alert, Tag,
  message,
} from "antd";
import {
  CalculatorOutlined, SaveOutlined,
  UploadOutlined, PrinterOutlined, ExclamationCircleFilled,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { blDanhSach, blTinh, blLuu, blNhapExcel, loiApi } from "../../api";
import type { BangLuong as BangLuongDto, DongBo } from "../../api";
import { useAuth } from "../../AuthContext";
import { useChieuCaoBang } from "./dungBang";
import { inGiay, esc, khoiDau, soTienIn } from "../inGiay";
import { tien } from "./dinhDang";
import "./hop-dong.css";

const KHOA_CHUAN = "kt2000_bang_luong_ngay_cong_chuan";
const CAC_THANG = Array.from({ length: 12 }, (_, i) => i + 1);

interface Props {
  mo: boolean;
  onDong: () => void;
  maDonVi?: string;
  tenDonVi?: string | null;
  /**
   * XEM TRƯỚC nháp Excel, khóa theo THÁNG. Xem ghi chú cùng tên ở ChamCong.tsx.
   */
  xemTruoc?: Record<number, BangLuongDto[]> | null;
}

export default function BangLuong(
  { mo, onDong, maDonVi, tenDonVi, xemTruoc }: Props,
) {
  // Chế độ xem trước: dữ liệu tới từ nháp, chưa nằm trong sổ.
  const laXemTruoc = xemTruoc != null;
  const { session } = useAuth();
  const caoBang = useChieuCaoBang(200);
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const [thang, setThang] = useState(new Date().getMonth() + 1);
  const [ngayCongChuan, setNgayCongChuan] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(KHOA_CHUAN));
      return Number.isFinite(n) && n > 0 && n <= 31 ? n : 26;
    } catch { return 26; }
  });

  const [ds, setDs] = useState<BangLuongDto[]>([]);
  const [tai, setTai] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [laNhap, setLaNhap] = useState(false);
  const [boQua, setBoQua] = useState<DongBo[]>([]);
  const [tenFile, setTenFile] = useState<string | null>(null);
  const [canhBaoDv, setCanhBaoDv] = useState<string | null>(null);
  const [chanLuu, setChanLuu] = useState(false);

  const oFile = useRef<HTMLInputElement>(null);

  const xoaDauNhap = () => {
    setBoQua([]); setTenFile(null); setCanhBaoDv(null); setChanLuu(false);
  };

  const nhanDonVi = tenDonVi || maDonVi || session?.tenant.name || "đơn vị";

  const nap = async (ma?: string, t = thang) => {
    // Nháp: lấy thẳng theo tháng, không gọi API.
    if (xemTruoc) {
      setDs(xemTruoc[t] ?? []);
      return;
    }

    setTai(true);
    try {
      const r = await blDanhSach(t, ma);
      setDs(r.data);
      setLaNhap(false);
      xoaDauNhap();
    } catch (e) {
      setDs([]);
      message.error(loiApi(e, "Không đọc được bảng lương"));
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


  useEffect(() => {
    if (!mo) return;
    const khiQuayLai = () => {
      if (document.visibilityState !== "visible") return;
      if (laNhap || dangLuu) return;
      void nap(maDonVi, thang);
    };
    window.addEventListener("focus", khiQuayLai);
    document.addEventListener("visibilitychange", khiQuayLai);
    return () => {
      window.removeEventListener("focus", khiQuayLai);
      document.removeEventListener("visibilitychange", khiQuayLai);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, thang, laNhap, dangLuu]);

  const dsHien = ds;

  const tinh = () => {
    const chay = async () => {
      setTai(true);
      try {
        const r = await blTinh(thang, ngayCongChuan, maDonVi);
        setDs(r.data);
        setLaNhap(true);
        try { localStorage.setItem(KHOA_CHUAN, String(ngayCongChuan)); }
        catch { /* chế độ riêng tư */ }
        message.success(
          `Đã tính ${r.data.length} người — soát lại rồi bấm Lưu`);
      } catch (e) {
        message.error(loiApi(e, "Không tính được bảng lương"));
      } finally {
        setTai(false);
      }
    };

    if (ds.length > 0 && !laNhap) {
      Modal.confirm({
        title: "Tính lại bảng lương?",
        icon: <ExclamationCircleFilled style={{ color: "#d46b08" }} />,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>Tháng {thang}/{namLamViec} đã có bảng lương <b>{ds.length} người</b>.</div>
            <div style={{ marginTop: 8 }}>
              Tính lại sẽ dựng bản nháp mới từ chấm công và hợp đồng —
              <b> mọi số đã chỉnh tay sẽ mất</b>. Bản nháp chưa ghi vào sổ, chỉ mất khi
              bấm Lưu.
            </div>
          </div>
        ),
        okText: "Tính lại", cancelText: "Hủy",
        onOk: chay,
      });
      return;
    }
    void chay();
  };

  const luu = async () => {
    setDangLuu(true);
    try {
      const r = await blLuu(thang, ds, maDonVi);
      message.success(r.data.message);
      await nap(maDonVi, thang);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được bảng lương"));
    } finally {
      setDangLuu(false);
    }
  };

  // Cột theo ĐÚNG thứ tự khuôn Excel sheet "THANG n" để kế toán đọc quen mắt
  const COT: ColumnsType<BangLuongDto> = [
    { title: "STT", width: 46, align: "center", fixed: "left",
      render: (_, __, i) => i + 1 },
    { title: "Họ tên", dataIndex: "hoTen", width: 170, fixed: "left", ellipsis: true,
      render: (v: string | null) => <b>{v}</b> },
    { title: "Bộ phận", dataIndex: "boPhan", width: 120, ellipsis: true,
      render: (v: string | null, m) => v || m.chucDanh || "" },
    { title: "Lương chính", dataIndex: "luongChinh", width: 115, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "NCTT", dataIndex: "ngayCongTt", width: 60, align: "right",
      render: (v: number | null) => v ?? 0 },
    { title: "Lương thực tế", dataIndex: "luongThucTe", width: 125, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Ăn ca", dataIndex: "pcAnCa", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Điện thoại", dataIndex: "pcDienThoai", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Xăng xe", dataIndex: "pcXangXe", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Chuyên cần", dataIndex: "pcChuyenCan", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Hiệu quả CV", dataIndex: "pcHieuQua", width: 110, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Thưởng", dataIndex: "tienThuong", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Tổng PC", dataIndex: "tongPhuCap", width: 115, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "TỔNG LƯƠNG", dataIndex: "tongLuong", width: 130, align: "right",
      render: (v: number | null) => <b>{tien(v)}</b> },
    { title: "Tạm ứng", dataIndex: "tamUng", width: 100, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "BHXH 10,5%", dataIndex: "khauTruBh", width: 115, align: "right",
      onHeaderCell: () => ({ title: "BHXH 8% + BHYT 1,5% + BHTN 1%, tính trên LƯƠNG CHÍNH" }),
      render: (v: number | null) => tien(v) },
    { title: "Thuế TNCN", dataIndex: "thueTncn", width: 105, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "Tổng trừ", dataIndex: "tongKhauTru", width: 115, align: "right",
      render: (v: number | null) => tien(v) },
    { title: "THỰC LĨNH", dataIndex: "thucLinh", width: 135, align: "right", fixed: "right",
      render: (v: number | null) => <b className="bl-thuc-linh">{tien(v)}</b> },
  ];

  const tong = useMemo(() => ({
    luong: dsHien.reduce((s, x) => s + (x.tongLuong ?? 0), 0),
    tru: dsHien.reduce((s, x) => s + (x.tongKhauTru ?? 0), 0),
    linh: dsHien.reduce((s, x) => s + (x.thucLinh ?? 0), 0),
  }), [dsHien]);

  // ===== NHẬP TỪ FILE EXCEL =====

  const chayNhap = async (f: File) => {
    setTai(true);
    try {
      const r = await blNhapExcel(thang, ngayCongChuan, f, maDonVi);
      const { dong, bo, sheet, canhBaoDonVi, dungDonVi, maDonViFile } = r.data;

      setCanhBaoDv(canhBaoDonVi);

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
                  File: <b>{maDonViFile}</b> · đang mở: <b>{maDonVi ?? "đơn vị của bạn"}</b>
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
      setLaNhap(true);
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
    if (ds.length > 0 && !laNhap) {
      Modal.confirm({
        title: "Nhập đè lên bảng lương đang có?",
        icon: <ExclamationCircleFilled style={{ color: "#d46b08" }} />,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>Tháng {thang}/{namLamViec} đã có bảng lương <b>{ds.length} người</b>.</div>
            <div style={{ marginTop: 8 }}>
              Số trong file sẽ thay chỗ số đang xem. Bản đọc lên <b>chưa ghi vào sổ</b>,
              chỉ vào sổ khi bấm Lưu.
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

    const hang = dsHien.map((x, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(x.hoTen ?? "")}</td>
        <td>${esc(x.boPhan ?? x.chucDanh ?? "")}</td>
        <td class="r">${soTienIn(x.luongChinh ?? 0)}</td>
        <td class="c">${x.ngayCongTt ?? 0}</td>
        <td class="r">${soTienIn(x.luongThucTe ?? 0)}</td>
        <td class="r">${soTienIn(x.tongPhuCap ?? 0)}</td>
        <td class="r"><b>${soTienIn(x.tongLuong ?? 0)}</b></td>
        <td class="r">${soTienIn(x.tongKhauTru ?? 0)}</td>
        <td class="r"><b>${soTienIn(x.thucLinh ?? 0)}</b></td>
        <td class="pxk__tick"></td>
      </tr>`).join("");

    // Bản in gộp phụ cấp thành MỘT cột: 6 cột phụ cấp rời không vừa khổ giấy, mà tờ
    // để người lao động ký nhận thì chỉ cần thấy tổng và thực lĩnh. Chi tiết từng
    // khoản vẫn xem được trên lưới.
    inGiay(`BANG_LUONG_T${thang}_${namLamViec}`, `
      <div class="pxk">
        ${khoiDau(nhanDonVi)}
        <div class="pxk__title">BẢNG THANH TOÁN LƯƠNG</div>
        <div class="pxk__subtitle">
          Tháng ${String(thang).padStart(2, "0")} năm ${namLamViec}
          · ngày công chuẩn ${ngayCongChuan}
        </div>
        <table class="pxk__items">
          <thead>
            <tr>
              <th style="width:30px">STT</th>
              <th>Họ tên</th>
              <th style="width:90px">Bộ phận</th>
              <th style="width:80px">Lương chính</th>
              <th style="width:40px">NCTT</th>
              <th style="width:85px">Lương thực tế</th>
              <th style="width:80px">Phụ cấp</th>
              <th style="width:90px">Tổng lương</th>
              <th style="width:80px">Khấu trừ</th>
              <th style="width:90px">Thực lĩnh</th>
              <th style="width:70px">Ký nhận</th>
            </tr>
          </thead>
          <tbody>${hang}</tbody>
          <tfoot>
            <tr class="pxk__total">
              <td class="c" colspan="7">CỘNG</td>
              <td class="r">${soTienIn(tong.luong)}</td>
              <td class="r">${soTienIn(tong.tru)}</td>
              <td class="r">${soTienIn(tong.linh)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <table class="pxk__sigs">
          <tr>
            <th style="width:33%">Người lập biểu</th>
            <th style="width:33%">Kế toán trưởng</th>
            <th>Giám đốc</th>
          </tr>
          <tr><td>(Ký, họ tên)</td><td>(Ký, họ tên)</td><td>(Ký, họ tên)</td></tr>
          <tr class="pxk__sigs-space"><td></td><td></td><td></td></tr>
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

      <Space size={4}>
        <span className="hd-nhan" title="Điều 54 NĐ 145/2020 — doanh nghiệp tự chọn">
          Ngày công chuẩn
        </span>
        <InputNumber size="small" style={{ width: 70 }} min={1} max={31}
                     value={ngayCongChuan}
                     onChange={(v) => setNgayCongChuan(Number(v) || 26)} />
      </Space>

      <Button icon={<CalculatorOutlined />} onClick={tinh}
              disabled={laXemTruoc}
              title={laXemTruoc
                ? "Đang xem trước nháp — lưu vào sổ rồi mới tính lương được"
                : "Dựng bản nháp từ chấm công + hợp đồng, chưa ghi vào sổ"}>
        Tính lương
      </Button>

      <input type="file" accept=".xls,.xlsx" hidden ref={oFile}
             onChange={(e) => {
               const f = e.target.files?.[0];
               // Xoá value ngay: không xoá thì chọn LẠI ĐÚNG file vừa chọn sẽ không
               // kích hoạt onChange (trình duyệt coi là không đổi) và người dùng tưởng
               // nút hỏng.
               e.target.value = "";
               if (f) nhan(f);
             }} />

      <Button icon={<UploadOutlined />} loading={tai}
              onClick={() => oFile.current?.click()}
              disabled={laXemTruoc}
              title={laXemTruoc
                ? "Đang xem trước nháp của màn Hợp đồng — lưu vào sổ rồi mới nhập tiếp"
                : "Đọc bảng lương từ file Excel của kế toán (.xls hoặc .xlsx)"
                  + "\nChỉ hiện lên để xem — bấm Lưu vào sổ mới ghi"}>
        Nhập Excel
      </Button>

      <Button type="primary" icon={<SaveOutlined />} loading={dangLuu}
              disabled={dsHien.length === 0 || chanLuu || laXemTruoc}
              onClick={() => void luu()}
              title={laXemTruoc
                ? "Đang xem trước nháp — bấm \"Lưu vào DB\" ở màn Hợp đồng để ghi cả lượt"
                : chanLuu
                ? "File đang xem là của đơn vị khác — không được ghi vào sổ này"
                : "Ghi bảng lương đang hiện vào sổ"}>
        Lưu vào DB{laNhap && " (bản nháp)"}
      </Button>

      <Button icon={<PrinterOutlined />} onClick={inBang}>
        Print
      </Button>
    </>
  );

  return (
    <Modal
      className="bang-luong"
      title={
        <span>
          Bảng thanh toán lương
          <span className="hd-ten-dv"> — {nhanDonVi}</span>
          {/* Nhãn ngay trên tiêu đề: mở modal ra là biết đang xem nháp hay xem sổ. */}
          {laXemTruoc && (
            <Tag color="orange" style={{ marginLeft: 10 }}>
              XEM TRƯỚC — chưa lưu vào sổ
            </Tag>
          )}
          {dsHien.length > 0 && (
            <span className="hd-dem">
              {" · "}{dsHien.length} người · thực lĩnh <b>{tien(tong.linh)}</b>
            </span>
          )}
          {laNhap && (
            <Typography.Text type="warning" style={{ fontSize: 13, marginLeft: 8 }}>
              bản nháp — chưa ghi vào sổ
            </Typography.Text>
          )}
        </span>
      }
      open={mo}
      // Bản nháp chưa ghi vào sổ — bấm nền đóng nhầm là mất cả bảng vừa tính.
      maskClosable={!laNhap}
      onCancel={onDong}
      footer={null}
      width="98vw"
      style={{ top: 12, maxWidth: "98vw" }}
      styles={{
        // Vỏ modal cao CỐ ĐỊNH hết màn, không co theo nội dung: bảng bên
        // trong tự ăn hết phần còn lại. Để antd tự tính thì modal cao theo
        // nội dung, mà nội dung lại chờ modal — bảng teo còn vài dòng.
        // "container" = khối .ant-modal-content trong antd bản này (không phải
        // "content" — tên đó không có trong styles).
        container: { display: "flex", flexDirection: "column",
                     height: "calc(100vh - 32px)" },
        body: { flex: 1, minHeight: 0, overflow: "hidden", padding: 8 },
      }}
    >
      <div className="hd-modal">
        <Space size={8} wrap className="hd-thanh">{thanhLoc}</Space>

        {/* Cảnh báo về đơn vị: file của đơn vị khác (đỏ, đã chặn Lưu) hoặc không đọc
            được tên đơn vị (vàng, vẫn cho lưu nhưng phải tự kiểm). */}
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

        {/* Dòng bị bỏ: nêu rõ dòng nào trong file và vì sao, để kế toán mở file sửa
            đúng chỗ thay vì phải tự dò cả bảng. */}
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
      <Table<BangLuongDto>
        className="hd-bang"
        size="small"
        rowKey="nhanSuId"
        dataSource={dsHien}
        columns={COT}
        loading={tai}
        pagination={false}
        scroll={{ x: 2100, y: caoBang }}
        rowClassName={() => laNhap ? "bl-nhap" : ""}
        locale={{ emptyText: "Tháng này chưa có bảng lương — bấm Tính lương" }}
        summary={() => dsHien.length === 0 ? null : (
          <Table.Summary fixed="bottom">
            <Table.Summary.Row className="bl-cong">
              <Table.Summary.Cell index={0} colSpan={13}>
                <b>CỘNG {dsHien.length} người</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={13} align="right">
                <b>{tien(tong.luong)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={14} colSpan={3} />
              <Table.Summary.Cell index={17} align="right">
                <b>{tien(tong.tru)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={18} align="right">
                <b className="bl-thuc-linh">{tien(tong.linh)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
        </div>
      </div>
    </Modal>
  );
}
