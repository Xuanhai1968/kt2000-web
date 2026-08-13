import { useRef, useState } from "react";
import {
  Modal, Upload, Button, Space, Alert, message,
} from "antd";
import {
  InboxOutlined, FileDoneOutlined, DownloadOutlined, FilePdfOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  thueRaSoat, thueLapToKhai, thueToKhaiXml, thueDocBangKe, loiApi,
} from "../api";
import type { HoaDonFile, KetQuaRaSoat, ToKhaiGtgt } from "../api";
import BangToKhai from "./BangToKhai";
// Thanh chân modal (.chan-to-khai) sống trong file này — phải nạp ngay cả khi chưa
// lập tờ khai, vì nút "Tạo tờ khai" có mặt từ lúc mở modal.
import "./bang-to-khai.css";

// ============ RÀ SOÁT DỮ LIỆU TRƯỚC KHI KHAI THUẾ ============
// Đối chiếu hóa đơn trong FILE (XML cổng TCT) với hóa đơn đã có trong SỔ, để biết
// còn thiếu/lệch gì trước khi nộp tờ khai.
//
// CHỈ XEM — KHÔNG GHI. Modal này không có nút nào ghi vào sổ (chốt với Trường
// 13/08): nó soi sổ đang chạy thật ngay trước kỳ khai thuế, thấy vấn đề thì kế
// toán tự quyết cách xử lý. Muốn nạp thì dùng màn Lấy HĐĐT như mọi khi.
//
// XML đọc NGAY TẠI TRÌNH DUYỆT bằng DOMParser: không phải tải file lên server,
// nên chọn cả trăm file cũng không nghẽn mạng, và file gốc không rời khỏi máy
// người dùng. Server chỉ nhận danh sách đã rút gọn (định danh + hai con số tiền).

interface Props {
  mo: boolean;
  onDong: () => void;
  thang: number | undefined;      // kỳ đang soát; undefined = cả năm
  nhanKy: string;
}

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Đọc một file XML hóa đơn của cổng TCT. File hỏng trả null — một file rác không
// được phép làm chết cả mẻ.
function docXml(noiDung: string, tenFile: string, huong: string): HoaDonFile | null {
  try {
    const doc = new DOMParser().parseFromString(noiDung, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const lay = (cha: Element | null, ten: string) =>
      cha?.getElementsByTagName(ten)[0]?.textContent?.trim() ?? "";
    const so = (cha: Element | null, ten: string) => {
      const v = Number(lay(cha, ten));
      return Number.isFinite(v) ? v : 0;
    };

    const dl = doc.getElementsByTagName("DLHDon")[0] ?? null;
    const chung = dl?.getElementsByTagName("TTChung")[0] ?? null;
    const nd = dl?.getElementsByTagName("NDHDon")[0] ?? null;
    if (!chung || !nd) return null;

    const ban = nd.getElementsByTagName("NBan")[0] ?? null;
    const tt = nd.getElementsByTagName("TToan")[0] ?? null;

    const tienVat = so(tt, "TgTThue");
    const tongTien = so(tt, "TgTTTBSo");
    let tienHang = so(tt, "TgTCThue");
    // HĐ không chịu thuế thường không khai TgTCThue — suy ngược từ tổng, giống
    // cách ImportService làm. Không có bước này thì mọi HĐ loại đó báo lệch oan.
    if (tienHang === 0) tienHang = tongTien - tienVat;

    return {
      tenFile,
      huong,
      mst: lay(ban, "MST"),
      khhd: lay(chung, "KHHDon"),
      soHd: lay(chung, "SHDon"),
      ngay: lay(chung, "NLap"),
      tenDoiTac: lay(ban, "Ten"),
      tienHang,
      tienVat,
    };
  } catch {
    return null;
  }
}

export default function ModalRaSoat({ mo, onDong, thang, nhanKy }: Props) {
  const [dangSoat, setDangSoat] = useState(false);
  const [kq, setKq] = useState<KetQuaRaSoat | null>(null);
  const [soFileHong, setSoFileHong] = useState(0);
  // Các kỳ vừa soát trong lượt này — hiện lên để người dùng biết bảng kết quả đang
  // gộp dữ liệu của những tháng nào (xem chú thích trong nhanFile).
  const [kyDaSoat, setKyDaSoat] = useState<{
    thang: number; soHd: number; soVao: number; soRa: number;
    hangVao: number; vatVao: number; hangRa: number; vatRa: number;
  }[]>([]);

  // ----- Tờ khai 01/GTGT -----
  // XML tờ khai kỳ trước giữ nguyên văn để gửi lên server: server vừa lấy ct43 làm
  // ct22, vừa dùng chính file này làm KHUÔN cho tờ khai mới (thông tin đơn vị, cơ
  // quan thuế… sổ không lưu ở đâu cả).
  const [xmlKyTruoc, setXmlKyTruoc] = useState<string | null>(null);
  const [tenFileTk, setTenFileTk] = useState<string | null>(null);
  const [ct43KyTruoc, setCt43KyTruoc] = useState<number | null>(null);
  const [kyToKhaiTruoc, setKyToKhaiTruoc] = useState<string | null>(null);
  const [dangLapTk, setDangLapTk] = useState(false);
  const [toKhai, setToKhai] = useState<ToKhaiGtgt | null>(null);
  const [dangXuatPdf, setDangXuatPdf] = useState(false);
  // Trỏ tới khối tờ khai để chụp thành PDF — xem xuatPdfToKhai.ts
  const tkRef = useRef<HTMLDivElement | null>(null);

  // Nhận một file XML đã nhận diện là TỜ KHAI. Đọc ct43 và kỳ ngay tại trình duyệt
  // để hiện cho người dùng đối chiếu TRƯỚC khi bấm tạo tờ khai — thấy số quen thuộc
  // thì biết đã chọn đúng file, khỏi phải tạo rồi mới phát hiện nhầm.
  const docToKhaiKyTruoc = (noiDung: string, tenFile: string) => {
    setXmlKyTruoc(noiDung);
    setTenFileTk(tenFile);
    try {
      const doc = new DOMParser().parseFromString(noiDung, "text/xml");
      const lay = (t: string) =>
        doc.getElementsByTagName(t)[0]?.textContent?.trim() ?? "";
      const v = lay("ct43");
      setCt43KyTruoc(v ? Number(v) : null);
      setKyToKhaiTruoc(lay("kyKKhai") || null);
    } catch {
      setCt43KyTruoc(null);
      setKyToKhaiTruoc(null);
    }
  };

  const lapToKhai = async () => {
    if (!thang) { message.warning("Chọn một tháng cụ thể để lập tờ khai"); return; }
    setDangLapTk(true);
    try {
      const r = await thueLapToKhai(thang, xmlKyTruoc ?? undefined);
      setToKhai(r.data);
    } catch (e) {
      // Thiếu tờ khai kỳ trước là tình huống hay gặp nhất, và lời nhắn của server
      // dài (nêu rõ tháng nào, vì sao cần) — dùng Modal để đọc được hết thay vì
      // message trôi ngang màn hình rồi biến mất sau vài giây.
      const loi = loiApi(e, "Không lập được tờ khai");
      if (loi.includes("tờ khai kỳ trước")) {
        setToKhai(null);
        Modal.warning({
          title: "Cần tờ khai kỳ trước",
          content: loi,
          okText: "Đã hiểu",
          width: 560,
        });
      } else message.error(loi);
    } finally {
      setDangLapTk(false);
    }
  };

  // Tên file PDF đặt theo cùng nếp với tên file XML của HTKK, để hai file của cùng
  // một kỳ nằm cạnh nhau khi sắp xếp trong thư mục.
  const tenFilePdf = () =>
    toKhai ? `TKGTGT_T${toKhai.thang}_${toKhai.nam}_${toKhai.mst}.pdf`
           : `to-khai-${thang}.pdf`;

  const taiPdf = async () => {
    const goc = tkRef.current;
    if (!goc) return;
    setDangXuatPdf(true);
    try {
      const { xuatPdfToKhai } = await import("./xuatPdfToKhai");
      await xuatPdfToKhai(goc, tenFilePdf());
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Không xuất được PDF");
    } finally {
      setDangXuatPdf(false);
    }
  };

  const taiXml = async () => {
    if (!thang) return;
    try {
      const r = await thueToKhaiXml(thang, xmlKyTruoc ?? undefined);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = toKhai?.tenFileXml ?? `to-khai-${thang}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(loiApi(e, "Không tải được XML tờ khai"));
    }
  };

  // Soát NHIỀU KỲ trong một lượt: mỗi kỳ gọi riêng với sổ của chính kỳ đó, rồi gộp
  // kết quả lại thành một bảng.
  //
  // Gộp thay vì hiện tách từng kỳ: kế toán quan tâm "còn vấn đề gì" chứ không quan
  // tâm vấn đề đó thuộc lượt gọi nào; mỗi dòng đã có sẵn ngày và ký hiệu để biết
  // thuộc kỳ nào.
  const soatNhieuKy = async (
    theoKy: Map<number, HoaDonFile[]>, hong: number
  ) => {
    if (theoKy.size === 0) {
      message.warning("Không đọc được hóa đơn nào từ các file đã chọn");
      return;
    }
    setDangSoat(true);
    try {
      const gop: KetQuaRaSoat = {
        nam: 0, thang: null, soHdFile: 0, soHdSo: 0,
        thieuTrongSo: [], thieuTrongFile: [], lechTien: [], trung: [], saiKy: [],
      };

      for (const [ky, ds] of [...theoKy.entries()].sort((a, b) => a[0] - b[0])) {
        const r = await thueRaSoat(ky, ds);
        const k = r.data;
        gop.nam = k.nam;
        gop.soHdFile += k.soHdFile;
        gop.soHdSo   += k.soHdSo;
        gop.thieuTrongSo.push(...k.thieuTrongSo);
        gop.thieuTrongFile.push(...k.thieuTrongFile);
        gop.lechTien.push(...k.lechTien);
        gop.trung.push(...k.trung);
        // "Sai kỳ kê khai" chỉ có nghĩa khi soát ĐÚNG kỳ của hóa đơn — ở đây mỗi
        // nhóm đã được gửi kèm đúng kỳ của nó nên kết quả này dùng được như thường.
        gop.saiKy.push(...k.saiKy);
      }

      setKq(gop);
      setSoFileHong(hong);
    } catch (e) {
      message.error(loiApi(e, "Không rà soát được"));
    } finally {
      setDangSoat(false);
    }
  };

  // MỘT khung thả cho MỌI file XML — tự nhận diện loại theo NỘI DUNG, không hỏi
  // người dùng đây là file gì.
  //
  // Hóa đơn có nút <DLHDon>, tờ khai có <HSoKhaiThue> — hai gốc khác hẳn nhau nên
  // nhận diện chắc chắn, không cần dựa vào tên file (tên do người dùng đặt, đổi
  // lúc nào không biết).
  const nhanFile = async (files: File[]) => {
    const ds: HoaDonFile[] = [];
    let hong = 0;
    let daNhanTk = false;

    for (const f of files) {
      const ten = f.name.toLowerCase();

      // --- Bảng kê Excel của cổng TCT: gửi server đọc (frontend không có lib Excel) ---
      if (ten.endsWith(".xlsx") || ten.endsWith(".xls")) {
        try {
          const r = await thueDocBangKe(f);
          ds.push(...r.data.hoaDon);
        } catch (e) {
          hong++;
          message.warning(loiApi(e, `Không đọc được ${f.name}`));
        }
        continue;
      }

      if (!ten.endsWith(".xml")) { hong++; continue; }
      const noiDung = await f.text();

      // Tờ khai kỳ trước: giữ lại làm nguồn ct22 + khuôn XML, không đưa vào rà soát
      if (noiDung.includes("<HSoKhaiThue") || noiDung.includes("ct43")) {
        docToKhaiKyTruoc(noiDung, f.name);
        daNhanTk = true;
        continue;
      }

      // Hóa đơn — hướng để TRỐNG, server tự suy theo MST người bán trong file
      const hd = docXml(noiDung, f.name, "");
      if (hd) ds.push(hd); else hong++;
    }

    // TÁCH HÓA ĐƠN THEO KỲ, mỗi kỳ soát với sổ của CHÍNH KỲ ĐÓ.
    //
    // Kế toán thả cả bộ tháng 6 lẫn tháng 7 trong một lần là chuyện bình thường:
    // tháng 6 để đối soát ngược với tờ khai T6 đã nộp, tháng 7 để lập tờ khai mới.
    // Trước đây gom hết rồi so với sổ tháng 7 nên toàn bộ hóa đơn tháng 6 bị báo
    // "chưa nạp vào sổ" — 343 dòng báo động giả, trong khi sổ chẳng hổng chỗ nào.
    //
    // Chia theo tháng của NGÀY LẬP rồi gọi rà soát riêng từng kỳ mới ra kết quả
    // đúng nghĩa: hóa đơn tháng 6 so với sổ tháng 6, tháng 7 so với sổ tháng 7.
    const theoKy = new Map<number, HoaDonFile[]>();
    for (const h of ds) {
      const m = Number((h.ngay ?? "").slice(5, 7));
      const k = m >= 1 && m <= 12 ? m : (thang ?? 0);
      const cu = theoKy.get(k);
      if (cu) cu.push(h); else theoKy.set(k, [h]);
    }

    // Tổng theo kỳ và theo hướng — đây là con số kế toán dùng để đối chiếu thẳng
    // với chỉ tiêu tờ khai (ct23/ct24 cho vào, ct32/ct33 cho ra).
    setKyDaSoat([...theoKy.entries()].map(([m, v]) => {
      const vao = v.filter((x) => x.huong !== "RA");
      const ra  = v.filter((x) => x.huong === "RA");
      const cong = (a: HoaDonFile[], f: (x: HoaDonFile) => number) =>
        a.reduce((s, x) => s + (f(x) || 0), 0);
      return {
        thang: m,
        soHd: v.length,
        soVao: vao.length,
        soRa: ra.length,
        hangVao: cong(vao, (x) => x.tienHang),
        vatVao:  cong(vao, (x) => x.tienVat),
        hangRa:  cong(ra,  (x) => x.tienHang),
        vatRa:   cong(ra,  (x) => x.tienVat),
      };
    }).sort((a, b) => a.thang - b.thang));

    // Chỉ có tờ khai, không có hóa đơn nào thì đừng gọi rà soát — sẽ báo "không đọc
    // được hóa đơn nào" trong khi người dùng vừa nạp tờ khai thành công.
    if (ds.length > 0 || hong > 0) await soatNhieuKy(theoKy, hong);
    else if (daNhanTk) message.success("Đã nhận tờ khai kỳ trước");
  };


  const tongVanDe = kq
    ? kq.thieuTrongSo.length + kq.lechTien.length + kq.trung.length + kq.saiKy.length
    : 0;

  return (
    <Modal
      title={`Rà soát & lập tờ khai — ${nhanKy}`}
      open={mo}
      onCancel={onDong}

      // Nút TẠO TỜ KHAI nằm ở FOOTER của Modal — vùng antd không cho cuộn, nên nút
      // luôn nhìn thấy dù bảng kết quả dài bao nhiêu. Trước đây nút nằm trong thân,
      // cuộn xuống xem danh sách là nút trôi mất khỏi màn hình.
      footer={
        <div className="chan-to-khai">
          <span className="chan-nhan">
            {toKhai
              ? <>Đã lập tờ khai tháng <b>{toKhai.thang}/{toKhai.nam}</b>
                  {!toKhai.choXuat && <span className="chan-loi"> , còn lỗi phải xử lý</span>}</>
              : tenFileTk
                ? <>Đã nhận tờ khai kỳ trước, sẵn sàng lập tờ khai</>
                : <span className="chan-loi">
                    Chưa có tờ khai kỳ trước
                    {thang && <> (tháng {thang === 1 ? 12 : thang - 1})</>}
                    {" "}, hãy thả file XML tờ khai kỳ đó vào ô trên
                  </span>}
          </span>

          {toKhai && (
            <>
              {/* Tải THẲNG file PDF, không qua hộp thoại in: người dùng bấm một lần
                  là có file trong thư mục Tải về, cùng nhịp với nút Tải XML bên cạnh. */}
              <Button icon={<FilePdfOutlined />}
                      loading={dangXuatPdf}
                      onClick={taiPdf}
                      title={`Tải ${tenFilePdf()}`}>
                Lưu PDF
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!toKhai.choXuat}
                      onClick={taiXml}
                      title={toKhai.choXuat ? `Tải ${toKhai.tenFileXml}`
                                            : "Còn lỗi chặn — xử lý hết mới xuất được XML"}>
                Tải XML nạp HTKK
              </Button>
            </>
          )}

          {/* MỘT nút cho cả tạo mới lẫn tạo lại — đổi nhãn theo trạng thái.
              Tạo lại cần thiết vì tờ khai trên màn là ảnh chụp lúc bấm: sửa dữ liệu
              dưới sổ hay đổi file tờ khai kỳ trước rồi thì nó không tự cập nhật.

              Vẫn cho bấm khi chưa thả file: kho SCAN_DOC của đơn vị có thể đã có sẵn
              tờ khai kỳ trước — chỉ server mới biết điều đó (nếu không có thì trả 409
              kèm hướng dẫn). */}
          <Button type="primary" size="large"
                  icon={toKhai ? <ReloadOutlined /> : <FileDoneOutlined />}
                  loading={dangLapTk}
                  disabled={!thang}
                  title={toKhai
                    ? "Tính lại từ dữ liệu sổ hiện tại"
                    : tenFileTk
                      ? `Lập tờ khai tháng ${thang} từ dữ liệu sổ`
                      : "Chưa thả tờ khai kỳ trước — hệ thống sẽ tìm trong kho của đơn vị"}
                  onClick={lapToKhai}>
            {!thang ? "Chọn một tháng cụ thể"
                    : toKhai ? `Tạo lại tờ khai tháng ${thang}`
                             : `Tạo tờ khai tháng ${thang}`}
          </Button>
        </div>
      }
      width="80vw"
      // Chiều cao CỐ ĐỊNH, không co giãn theo số dòng: modal nhảy kích thước mỗi lần
      // đổi tab hay nạp thêm file thì nút và bảng trôi lung tung dưới con trỏ.
      style={{ top: 24, maxWidth: 1400 }}
      styles={{
        body: {
          height: "calc(100vh - 190px)",
          overflowY: "auto",
          overflowX: "hidden",
        },
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Chỉ đối chiếu, không ghi vào sổ"
      />

      {/* ----- Nguồn dữ liệu -----
          Không còn ô chọn hướng: server đọc MST người bán trong từng file, trùng MST
          đơn vị thì là hóa đơn RA, khác thì VÀO. Một lượt soát ra cả hai chiều. */}
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Upload.Dragger
          multiple
          accept=".xml,.xlsx,.xls"
          showUploadList={false}
          disabled={dangSoat}
          // Đọc file ngay tại trình duyệt, KHÔNG tải lên server
          beforeUpload={(_, danhSach) => {
            void nhanFile(danhSach as File[]);
            return Upload.LIST_IGNORE;
          }}
          style={{ padding: "10px 0" }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            Kéo thả hoặc bấm để chọn file
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 12 }}>
            Nhận <b>XML hóa đơn</b>, <b>XML tờ khai kỳ trước</b> và{" "}
            <b>bảng kê Excel</b> (HD_VAO/HD_RA.xlsx)
            Chọn nhiều file cùng lúc
          </p>
        </Upload.Dragger>

        {/* Đã nhận tờ khai kỳ trước: báo lại để người dùng biết ct22 sẽ lấy từ đâu */}
        {tenFileTk && (
          <Alert
            type="success"
            showIcon
            icon={<FileDoneOutlined />}
            style={{ padding: "6px 12px" }}
            message={
              <span style={{ fontSize: 14 }}>
                Tờ khai kỳ trước: <b>{tenFileTk}</b>
                {kyToKhaiTruoc && <> · kỳ <b>{kyToKhaiTruoc}</b></>}
                {ct43KyTruoc != null && <> · chỉ tiêu 43: <b>{tien(ct43KyTruoc)}</b></>}
              </span>
            }
            action={
              <Button size="small" type="text" onClick={() => {
                setXmlKyTruoc(null); setTenFileTk(null);
                setCt43KyTruoc(null); setKyToKhaiTruoc(null);
              }}>Bỏ</Button>
            }
          />
        )}

      </Space>

      {/* ----- DANH SÁCH KỲ ĐÃ NHẬN -----
          Chỉ liệt kê từng kỳ kèm TỔNG TIỀN, không bày bảng chi tiết hàng trăm dòng.
          Đây là con số kế toán đối chiếu thẳng với chỉ tiêu tờ khai: tổng mua vào
          so với ct23/ct24, tổng bán ra so với ct32/ct33. */}
      {kyDaSoat.length > 0 && (
        <div className="ds-ky">
          {kyDaSoat.map((k) => (
            <div key={k.thang} className={`ky-dong ${k.thang === thang ? "ky-hientai" : ""}`}>
              <div className="ky-ten">
                Tháng {k.thang}
                {k.thang === thang && <span className="ky-nhan">đang lập tờ khai</span>}
              </div>
              <div className="ky-so">
                <span className="ky-nhom">
                  <span className="ky-mo">Mua vào</span>
                  <b>{k.soVao}</b> HĐ · {tien(k.hangVao)} · VAT <b>{tien(k.vatVao)}</b>
                </span>
                <span className="ky-nhom">
                  <span className="ky-mo">Bán ra</span>
                  <b>{k.soRa}</b> HĐ · {tien(k.hangRa)} · VAT <b>{tien(k.vatRa)}</b>
                </span>
              </div>
            </div>
          ))}

          {/* Vấn đề gộp của mọi kỳ — chỉ nêu SỐ, không liệt kê từng dòng */}
          {kq && (
            <div className="ky-tomtat">
              {tongVanDe === 0
                ? <span className="ky-ok">✓ Dữ liệu file khớp với sổ</span>
                : <span className="ky-loi">
                     {tongVanDe} điểm lệch giữa file và sổ
                    {kq.thieuTrongSo.length > 0 && <> thiếu trong sổ: {kq.thieuTrongSo.length}</>}
                    {kq.lechTien.length > 0 && <> lệch tiền: {kq.lechTien.length}</>}
                    {kq.trung.length > 0 && <> trùng: {kq.trung.length}</>}
                  </span>}
              {soFileHong > 0 && (
                <span className="ky-bo"> bỏ qua {soFileHong} file</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ----- TỜ KHAI 01/GTGT -----
          Khối riêng, KHÔNG nằm trong Tabs rà soát: rà soát và lập tờ khai là hai
          việc độc lập — lập được tờ khai mà chưa cần đối chiếu file nào. */}
      {toKhai && (
        // ref để nút "Lưu PDF" chụp đúng khối này — nút nằm ở FOOTER modal nên
        // không với tới bằng querySelector trong phạm vi component con được.
        <div style={{ marginTop: 20 }} ref={tkRef}>
          <BangToKhai tk={toKhai} />
        </div>
      )}
    </Modal>
  );
}
