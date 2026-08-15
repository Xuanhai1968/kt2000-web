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
         thueLuuToKhaiTct, thueDuyetKhoToKhai, getAdminTenants, loiApi } from "../api";
import type { DongBcToKhai, KetQuaDuyetKho } from "../api";
import "./bc-to-khai-xml.css";

// ============ BC LẤY TỜ KHAI XML ============
//
// Dựng lại form VFP cùng tên (ảnh 14/08): lưới liệt kê MỌI tờ khai đã lưu của năm
// (một kỳ của một đơn vị = một dòng).
//
// KHÔNG có bộ lọc Đơn vị/Tháng như bản VFP: lưới đã có sẵn cột Đơn vị và Kỳ, mà
// antd cho sắp xếp/tìm ngay trên đầu cột — thêm một khối lọc riêng chỉ lặp lại việc
// lưới làm sẵn và ăn mất chỗ của chính lưới đó.
//
// Thêm so với bản VFP: Ô THẢ FILE cổng TCT trả về sau khi nộp. Đây là mảnh khép kín
// vòng đời tờ khai:
//     tạo/lập tờ khai  →  nộp lên cổng  →  cổng trả file  →  thả vào đây
// File đó cho biết số ĐÃ NỘP THẬT (chỉ tiêu 43), khác với số mình tự lập. Hai số
// lệch nhau nghĩa là bản nộp khác bản lập — phải soi lại.
//
// KHỚP FILE THEO MST + KỲ GHI TRONG FILE, không theo tên file: cổng đặt tên mỗi đợt
// một kiểu, mà gắn nhầm là số của đơn vị này nhảy sang đơn vị khác.

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Ô LỆCH: khác 0 thì đỏ đậm, bằng 0 để mờ. Chưa khai (null) để TRỐNG — hiện 0 ở
// đó là nói "đã đối chiếu và khớp" trong khi thực ra chưa khai gì.
const lech = (v: number | null | undefined) =>
  v == null ? "" : (
    <span className={v !== 0 ? "bc-lech" : "bc-khop"}>{tien(v)}</span>);

// Đuôi đường dẫn: THƯ MỤC KỲ + TÊN FILE (hai đoạn cuối). Phần gốc kho giống hệt
// nhau ở mọi dòng nên cắt đi — giữ lại đúng phần phân biệt được dòng này với dòng
// kia. Đường dẫn đầy đủ vẫn còn trong tooltip.
const duoiDuong = (s: string) => {
  const p = s.split(/[\\/]/).filter(Boolean);
  return p.length <= 2 ? s : "…\\" + p.slice(-2).join("\\");
};

// Bấm vào ô đường dẫn = chép đường dẫn ĐẦY ĐỦ. Trình duyệt không cho mở thẳng
// thư mục trên máy (file:// bị chặn từ trang http), nên chép để dán vào Explorer
// là đường ngắn nhất tới thư mục thật.
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
  /** Kỳ đang lọc ở màn ngoài (BaoCaoThue) — màn này mở ra phải khớp theo. */
  thang: number;
}

export default function BcToKhaiXml({ mo, onDong, nam, thang }: Props) {
  const [ds, setDs] = useState<DongBcToKhai[]>([]);
  const [tai, setTai] = useState(false);
  const [dangNap, setDangNap] = useState(false);
  const [ketQuaNap, setKetQuaNap] = useState<
    { tenFile: string; ok: boolean; message: string }[] | null>(null);

  // ===== LUỒNG LƯU CÓ CHỦ ĐÍCH (15/08) =====
  // Khác hẳn luồng thả-tự-khớp ở trên: ở đây kế toán CHỌN đơn vị + kỳ, xem trước
  // đường dẫn server sẽ ghi, thấy đúng rồi mới bấm Lưu. Dùng khi cần chắc chắn file
  // vào đúng thư mục — chứ tự khớp theo MST thì file kỳ nào cũng rơi đúng chỗ của
  // kỳ ghi TRONG file, mà cổng thỉnh thoảng trả file ghi sai kỳ.
  const [donVi, setDonVi] = useState<{ code: string; name: string }[]>([]);
  const [maChon, setMaChon] = useState<string | undefined>();
  // Kỳ lưu: KHỚP bộ lọc của màn ngoài, không lấy tháng hiện tại của máy — lọc ngoài
  // tháng 7 mà trong này mặc định tháng 8 là lưu file vào nhầm kỳ.
  const [thangChon, setThangChon] = useState<number>(thang);

  // ĐỒNG BỘ LẠI MỖI LẦN MỞ: modal không bị hủy khi đóng nên useState chỉ chạy đúng
  // một lần. Không có đoạn này thì đổi bộ lọc ngoài rồi mở lại vẫn giữ kỳ cũ.
  //
  // Chỉnh state NGAY TRONG RENDER (lối React khuyên khi state phải bám theo prop)
  // thay vì useEffect: effect gọi setState làm render hai lượt, và người dùng kịp
  // nhìn thấy kỳ sai ở lượt đầu.
  const [moTruoc, setMoTruoc] = useState(mo);
  const [thangNgoai, setThangNgoai] = useState(thang);
  if (mo !== moTruoc || thang !== thangNgoai) {
    setMoTruoc(mo);
    setThangNgoai(thang);
    // Chỉ nắn khi ĐANG mở: lúc đóng mà giẫm vào thangChon thì thừa.
    if (mo && thang !== thangChon) setThangChon(thang);
  }
  // Năm lưu: mặc định ĐI THEO năm làm việc, chỉ tách ra khi kế toán tự chọn năm
  // khác (kỳ tháng 12 hay nộp sang đầu năm sau). Giữ ở dạng "null = theo năm làm
  // việc" thay vì đồng bộ bằng effect — effect thì mỗi lần đổi năm làm việc lại
  // giẫm lên lựa chọn tay của người dùng.
  const [namTay, setNamTay] = useState<number | null>(null);
  const namChon = namTay ?? nam;
  const [fileChon, setFileChon] = useState<File | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [duongDan, setDuongDan] = useState<
    { duongDan: string; daCo: boolean } | null>(null);
  const [dangLuu, setDangLuu] = useState(false);

  // ===== DUYỆT KHO (nút "Mở") =====
  // Thư mục CHỐT LẠI sau khi kế toán tự duyệt và bấm Chọn. Có giá trị thì nó thắng
  // đường dẫn server tự suy — đây là cách kế toán ghi đè khi kho không theo khuôn.
  const [thuMucTay, setThuMucTay] = useState<string | null>(null);

  // Đổi đơn vị/kỳ ⇒ BỎ thư mục chọn tay: chỗ vừa chọn là của kỳ CŨ, giữ lại là ghi
  // file kỳ mới vào thư mục kỳ cũ — hỏng đúng thứ luồng này sinh ra để tránh.
  // Dọn ngay trong handler (chỗ người dùng thật sự đổi) thay vì trong useEffect —
  // setState thẳng trong effect gây cascading render.
  const doiDonVi = (v: string) => { setMaChon(v); setThuMucTay(null); };
  const doiThang = (v: number) => { setThangChon(v); setThuMucTay(null); };
  const doiNam = (v: number) => { setNamTay(v); setThuMucTay(null); };
  const [moDuyet, setMoDuyet] = useState(false);
  const [dangDuyet, setDangDuyet] = useState(false);
  const [oDuyet, setODuyet] = useState<KetQuaDuyetKho | null>(null);

  // Đường dẫn ĐANG HIỆN trong ô Thư mục: ưu tiên chỗ kế toán tự chọn, không thì
  // lấy chỗ server suy theo khuôn.
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

  // Mở cửa sổ duyệt: vào THẲNG thư mục của đơn vị-kỳ đang chọn, KHÔNG bắt người
  // dùng tự lần từ gốc kho (91 đơn vị × 5 tầng).
  //
  // Thư mục kỳ thường chưa tồn tại — server tự lần ngược lên tầng gần nhất CÓ THẬT
  // rồi báo về thieuTang, nên vẫn mở được đúng nhánh của đơn vị đó thay vì rơi về
  // gốc kho.
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

  // Danh sách đơn vị KHAI THUẾ (chiDonViThue = true, NT-02): bỏ MDN_NB và các
  // tenant nội bộ — chúng không nộp tờ khai nên hiện ra chỉ tổ chọn nhầm.
  useEffect(() => {
    if (!mo || donVi.length) return;
    getAdminTenants(false, true)
      .then((r) => setDonVi(r.data.map((t) => ({ code: t.code, name: t.name }))))
      .catch((e) => message.error(loiApi(e, "Không đọc được danh sách đơn vị")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo]);

  // Đường dẫn do SERVER suy (nó mới biết Paths:ScanDocRoot1 và khuôn thư mục) —
  // hỏi lại mỗi khi đổi đơn vị/kỳ để cái hiện trên màn luôn là chỗ sẽ ghi thật.
  useEffect(() => {
    let bo = false;
    if (!maChon) return;
    thueDuongDanToKhai(maChon, thangChon, namChon)
      .then((r) => { if (!bo) setDuongDan(
        { duongDan: r.data.duongDan, daCo: r.data.daCo }); })
      .catch(() => { if (!bo) setDuongDan(null); });
    return () => { bo = true; };
  }, [maChon, thangChon, namChon]);

  // LƯU: chép file vào đúng thư mục kỳ (server tự tạo nếu chưa có) rồi nạp 26 chỉ
  // tiêu vào bảng TOKHAI của chính kỳ đó, đối chiếu ngay với bản tự lập.
  const luu = async () => {
    if (!fileChon || !maChon) return;
    setDangLuu(true);
    try {
      // thuMucTay có giá trị ⇒ ghi vào đúng chỗ kế toán đã duyệt và chọn, thay cho
      // chỗ server tự suy. Bỏ trống thì server suy như cũ.
      const r = await thueLuuToKhaiTct(fileChon, maChon, thangChon, namChon,
                                       ghiChu, thuMucTay ?? undefined);
      const d = r.data;

      // Cảnh báo lệch MST/kỳ hiện thành cảnh báo riêng, KHÔNG nuốt vào dòng chung:
      // lưu nhầm kỳ là số kỳ này đè lên kỳ khác, phải đập vào mắt.
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

      // Xóa ghi chú cùng lúc với file: ghi chú gắn với LƯỢT LƯU vừa xong, giữ lại
      // là lượt sau vô tình dán nhầm lời dặn của kỳ trước sang kỳ mới.
      setFileChon(null);
      setGhiChu("");
      await nap();
      // Thư mục kỳ vừa được tạo — hỏi lại để nhãn "chưa có, sẽ tạo" đổi thành "đã có".
      const dd = await thueDuongDanToKhai(maChon, thangChon, namChon);
      setDuongDan({ duongDan: dd.data.duongDan, daCo: dd.data.daCo });
    } catch (e) {
      message.error(loiApi(e, "Không lưu được tờ khai"));
    } finally {
      setDangLuu(false);
    }
  };

  // Thả file: gửi từng file lên server (server lo mở .zip). Nạp xong tải lại lưới
  // để thấy ngay dòng nào đã có file cổng trả về.
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
    // Năm và Tháng tách riêng BÊN CẠNH cột Kỳ chứ không thay nó: Kỳ là chuỗi
    // 'MM/yyyy' nên sắp xếp theo nó là sắp theo chữ (10/2026 đứng trước 2/2026).
    // Hai cột số này cho sắp/lọc đúng thứ tự thời gian.
    { title: "Năm", dataIndex: "nam", width: 64, align: "center",
      sorter: (a, b) => a.nam - b.nam },
    { title: "Tháng", dataIndex: "thang", width: 64, align: "center",
      sorter: (a, b) => a.thang - b.thang },
    { title: "Kỳ", dataIndex: "kyKeKhai", width: 76, align: "center" },
    // Lần khai 0 = chính thức nên để trống cho đỡ nhiễu; chỉ hiện khi là bổ sung.
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
    // ----- Số gộp từ SỔ HÓA ĐƠN — khác hẳn mấy cột trên (số trên TỜ KHAI) -----
    { title: "GT HĐ Vào", dataIndex: "gtHdVao", width: 130, align: "right",
      render: tien },
    { title: "GT VAT Vào", dataIndex: "gtVatVao", width: 120, align: "right",
      render: tien },
    { title: "GT HĐ Ra", dataIndex: "gtHdRa", width: 130, align: "right",
      render: tien },
    { title: "GT VAT Ra", dataIndex: "gtVatRa", width: 120, align: "right",
      render: tien },

    // ----- LỆCH = tờ khai − sổ. Đây là cột đáng nhìn nhất của lưới -----
    // Khác 0 → tô đỏ đậm. Bằng 0 để mờ: "đã đối chiếu, khớp" không cần hút mắt.
    { title: "Lệch GT HĐ Ra", dataIndex: "lechGtHdRa", width: 130, align: "right",
      render: lech },
    { title: "Lệch VAT Ra", dataIndex: "lechVatRa", width: 120, align: "right",
      render: lech },
    { title: "Lệch GT HĐ Vào", dataIndex: "lechGtHdVao", width: 130, align: "right",
      render: lech },
    { title: "Lệch VAT Vào", dataIndex: "lechVatVao", width: 120, align: "right",
      render: lech },

    // Cột quyết định: đã nộp xong hay mới chỉ lập trong máy.
    { title: "Đã nộp", dataIndex: "daNop", width: 130, align: "center",
      render: (v: boolean, m) => v
        ? <Tag color="green" title={m.xmlName ?? ""}>Có XML cổng</Tag>
        : <Tag>Chưa nạp XML</Tag> },
    // ĐƯỜNG DẪN VẬT LÝ nơi file cổng trả về đã ghi. Hiện đuôi đường dẫn (thư mục
    // kỳ + tên file) vì phần đầu \\Server-test\scan_doc\… giống hệt nhau ở mọi
    // dòng — chiếm hết bề ngang mà không phân biệt được dòng nào với dòng nào.
    // Đường dẫn ĐẦY ĐỦ nằm trong tooltip và trong nút chép.
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

  // Cộng lại mỗi khi thêm/bớt cột — thiếu thì cột cuối bị bóp cho vừa khung thay
  // vì cho cuộn ngang.
  const RONG = 48 + 150 + 64 + 64 + 76 + 68  // STT, Đơn vị, Năm, Tháng, Kỳ, Lần khai
             + 120 + 130 + 120 + 120         // Tồn đầu, GT Mua Vào, VAT Vào, VAT K.Trừ
             + 130 + 120 + 120 + 120         // GT Bán Ra, VAT Ra, VAT Phải nộp, Tồn cuối
             + 130 + 120 + 130 + 120         // 4 cột GT … từ sổ
             + 130 + 120 + 130 + 120         // 4 cột Lệch
             + 130 + 260                     // Đã nộp, Đường dẫn
             + 96 + 100 + 180;               // Ngày lập, Người lập, Ghi chú

  // Chiều cao BỊ TRỪ khỏi 100vh để ra thân lưới. Panel THÔNG TIN THƯ MỤC luôn hiện:
  // 3 hàng × 32px + 2 gap × 8px + padding 20px + viền 2px + margin 10px = 144px.
  // Hàng Lưu (42px kể cả khoảng cách) chỉ chiếm chỗ khi có file chờ. Con số này đi
  // vào CẢ scroll.y lẫn biến --bc-tru của CSS — hai nơi phải bằng nhau.
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
      {/* Hàng Lưu chỉ hiện khi có file chờ; hiện thì lưới phải lùi đúng 42px của
          nó. Một con số duy nhất cho cả scroll.y và CSS (xem --bc-tru bên đó). */}
      <div className="bc-tkxml"
           style={{ "--bc-tru": `${truLuoi}px` } as CSSProperties}>
        {/* ===== THÔNG TIN THƯ MỤC — dựng lại panel VFP cùng tên =====
            Đặt TRƯỚC ô kéo thả, đúng thứ tự thao tác của kế toán: chọn đơn vị/kỳ,
            nhìn thư mục server sẽ ghi, thấy đúng rồi mới thả file vào.

            Đây là NƠI DUY NHẤT chọn đơn vị/kỳ. Trước có thêm một bộ Đơn vị/Kỳ nữa
            ở hàng Lưu màu vàng — để cả hai thì hai chỗ chọn khác nhau được, mà
            người dùng không biết nút Lưu đọc theo chỗ nào. */}
        <div className="bc-tt">
          {/* Hàng 1: Đơn vị (rộng, chiếm 2 cột) | Tháng */}
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

          {/* Hàng 2: Thư mục (rộng, chiếm 2 cột) | Dữ liệu năm */}
          {/* THƯ MỤC: server suy, người dùng CHỈ ĐỌC để kiểm. Cho gõ tay thì lại
              đúng cái việc thủ công mà luồng này sinh ra để bỏ đi. */}
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

          {/* Hàng 3: Ghi chú trải hết ba cột — chỗ gõ tự do, càng rộng càng dễ đọc */}
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
          {/* MỘT file → giữ lại chờ bấm Lưu (kế toán còn kiểm đơn vị/kỳ/đường dẫn).
              NHIỀU file → nạp thẳng theo lối tự khớp MST cũ: kiểm tay từng cái
              trong một gói vài chục file thì không ai làm nổi. */}
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
            {/* NÚT CHỌN FILE — mở hộp thoại Open của Windows, đi tới được cả ổ mạng
                (\\SERVER-TEST\…). Bấm vào ô thả cũng mở hộp thoại đó, nhưng không ai
                đoán ra là bấm được; có nút hẳn hoi thì thấy ngay.

                KHÔNG chặn nổi bọt: chính cú bấm lan lên ô thả mới là thứ mở hộp
                thoại. Nút này chỉ để NHÌN THẤY mà bấm. */}
            <p className="bc-tha-nut">
              <Button size="small" icon={<FolderOpenOutlined />}
                      disabled={dangNap || dangLuu}>
                Chọn file
              </Button>
            </p>
          </Upload.Dragger>
        </div>

        {/* ===== HÀNG LƯU: đơn vị + kỳ + đường dẫn + nút Lưu =====
            Chỉ hiện khi đã có file chờ — lúc chưa thả file thì hàng này trống rỗng
            mà vẫn ăn mất một dải chiều cao của lưới. */}
        {fileChon && (
          <div className="bc-luu">
            {/* Đơn vị/kỳ/thư mục nằm ở panel THÔNG TIN THƯ MỤC bên trên — hàng này
                chỉ NHẮC LẠI chỗ sắp ghi rồi xác nhận, không cho chọn lần hai. */}
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

      {/* ===== CỬA SỔ DUYỆT KHO =====
          Trình duyệt KHÔNG mở được Explorer trên máy (file:// bị chặn từ trang
          http), nên dựng lại cái nhìn thư mục ngay trong web: server đọc cây thư
          mục rồi trả về, kế toán bấm lần vào đúng chỗ, thấy đúng thì bấm Chọn để
          điền vào ô Thư mục. Một bước KIỂM TRA trước khi ghi. */}
      <Modal
        title="Duyệt kho tờ khai trên máy chủ"
        open={moDuyet}
        onCancel={() => setMoDuyet(false)}
        width={860}
        // Thiếu tầng ⇒ nút chốt lấy đường dẫn ĐẦY ĐỦ đã xin (thư mục tạo lúc lưu),
        // chứ không lấy thư mục cha đang mở — chọn cha là file rơi ra ngoài thư mục
        // kỳ, lẫn với kỳ khác.
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
            {/* Về lại chỗ hệ thống gợi ý — cho người lỡ bấm lạc vài tầng khỏi phải
                đóng cửa sổ mở lại. */}
            <Tooltip title="Về thư mục hệ thống gợi ý cho kỳ này">
              <Button size="small" icon={<AimOutlined />}
                      disabled={dangDuyet || !duongDan
                                || oDuyet?.duongDanXin === duongDan.duongDan}
                      onClick={() => void duyet(duongDan?.duongDan)} />
            </Tooltip>
            <code className="bc-duyet-duong">{oDuyet?.duongDan ?? "…"}</code>
          </div>

          {/* THƯ MỤC KỲ CHƯA CÓ: nói thẳng ra chỗ đang mở KHÔNG phải chỗ vừa xin,
              nếu không người dùng tưởng mình đang đứng trong thư mục kỳ rồi bấm
              Chọn — hóa ra chọn nhầm thư mục cha, file rơi ra ngoài thư mục kỳ. */}
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

          {/* Danh sách: thư mục bấm để đi vào, file chỉ để NHÌN cho biết trong đó
              có gì — không mở được nội dung, mà cũng không cần. */}
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
