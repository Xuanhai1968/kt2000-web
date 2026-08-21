import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Table, Space, Button, Tag, Upload, Modal, Alert, message,
} from "antd";
import {
  TeamOutlined, FileAddOutlined, UploadOutlined, InboxOutlined,
  CalendarOutlined, DollarOutlined, SaveOutlined, DeleteOutlined, CloseOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import DanhSachNhanSu from "./DanhSachNhanSu";
import TaoHopDong from "./TaoHopDong";
import ChamCong from "./ChamCong";
import BangLuong from "./BangLuong";
import { hdLuoiDonVi, hdDemDonVi, hdDocNhap, hdLuuNhap, loiApi } from "../../api";
import type {
  DonViHopDong, DongBo, NhapNhap, NhapNguoi, NhanSu,
  // Đổi tên: ChamCong/BangLuong đã là tên hai COMPONENT import ở trên, trùng thì
  // TS coi type và component là một định danh.
  ChamCong as ChamCongDto, BangLuong as BangLuongDto,
} from "../../api";
import { useAuth } from "../../AuthContext";
import "./hop-dong.css";

/** Kết quả nhập của MỘT file trong lượt nhập nhiều file. */
interface KetQuaMotFile {
  tenFile: string;
  trangThai: "ok" | "bo" | "loi";
  soNhanSu: number;
  soHopDong: number;
  loi?: string;
  bo: DongBo[];
}

export default function HopDong() {
  const { session } = useAuth();

  const [ds, setDs] = useState<DonViHopDong[]>([]);
  const [nam, setNam] = useState<number>(session?.fiscalYear ?? 0);
  const [tai, setTai] = useState(false);

  // Tích CHỌN MỘT đơn vị rồi bấm nút — cùng nhịp màn Báo cáo thuế của MDN_NB.
  const [dvChon, setDvChon] = useState<string[]>([]);

  const [moNhanSu, setMoNhanSu] = useState(false);
  const [moTao, setMoTao] = useState(false);
  const [moChamCong, setMoChamCong] = useState(false);
  const [moBangLuong, setMoBangLuong] = useState(false);

  const [moNhap, setMoNhap] = useState(false);
  const [dangNhap, setDangNhap] = useState(false);
  const [boQua, setBoQua] = useState<DongBo[]>([]);

  // NHÁP đang giữ ở FE — đọc xong nằm đây, CHƯA có gì trong DB. Chỉ nút "Lưu vào DB"
  // mới ghi. Giữ nguyên vật server trả về rồi gửi lại y hệt: server không nhớ gì giữa
  // hai lần gọi nên không có nháp nào "hết hạn".
  const [nhap, setNhap] = useState<NhapNhap[]>([]);
  const [dangLuu, setDangLuu] = useState(false);

  // Kết quả TỪNG file của lượt nhập gần nhất. Nhập nhiều file một lượt mà chỉ báo một
  // câu tổng thì file nào hỏng, hỏng vì sao đều chìm mất — kế toán chọn 12 file, thấy
  // "đã nhập 10", không có cách nào biết 2 file kia là file nào.
  const [ketQuaNhap, setKetQuaNhap] = useState<KetQuaMotFile[]>([]);
  // "3/12" trên nút trong lúc chạy — nhập 12 file mất vài chục giây, không có gì nhúc
  // nhích thì người dùng tưởng treo và bấm lại.
  const [tienDo, setTienDo] = useState("");

  const dongDangChon = useMemo(
    () => dvChon.length === 1 ? ds.find((d) => d.maDonVi === dvChon[0]) ?? null : null,
    [ds, dvChon]);

  // Lượt nạp hiện hành. Người dùng đóng modal liên tục thì nhiều lượt đếm chạy chồng
  // nhau; kết quả của lượt cũ về sau sẽ ghi đè số mới hơn nếu không đánh dấu.
  const luotRef = useRef(0);

  const nap = async () => {
    const luot = ++luotRef.current;
    setTai(true);
    try {
      const r = await hdLuoiDonVi();
      if (luot !== luotRef.current) return;

      // Hiện lưới NGAY, số đếm để dấu … rồi điền dần — không bắt người dùng nhìn màn
      // trắng chờ mở xong 17 database.
      const dong = r.data.dong.map((d) => ({ ...d, dangDem: true }));
      setDs(dong);
      setNam(r.data.nam);
      const con = new Set(dong.map((d) => d.maDonVi));
      setDvChon((cu) => cu.filter((m) => con.has(m)));
      setTai(false);

      // Đếm SONG SONG, đơn vị nào xong trước điền dòng đó trước. Không Promise.all:
      // chờ cả 17 xong mới hiện thì lại đúng cái chậm vừa bỏ đi.
      for (const d of dong) {
        void hdDemDonVi(d.maDonVi)
          .then((rd) => {
            if (luot !== luotRef.current) return;

            // Đơn vị CHƯA TẠO BẢNG module Hợp đồng + Lương thì BỎ HẲN khỏi lưới.
            // Từ 21/08 bốn bảng không còn dựng tự động cho mọi database — đơn vị nào
            // thật sự dùng module này mới được tạo (Quản trị -> Mở năm làm việc ->
            // "Tạo bảng Hợp đồng + Lương"). Bày ra ở đây thì mọi nút bấm vào đều lỗi.
            if (rd.data.chuaTaoBang) {
              setDs((cu) => cu.filter((x) => x.maDonVi !== d.maDonVi));
              setDvChon((cu) => cu.filter((m) => m !== d.maDonVi));
              return;
            }

            // CHỈ lấy mấy con số, KHÔNG trải nguyên rd.data lên dòng: endpoint /dem
            // chạy trên database đơn vị-năm nên không biết tên và MST (hai thứ đó nằm
            // ở Master), nó trả null. Trải cả cục vào thì null đè mất tên và MST mà
            // lưới vừa hiện đúng — cột Tên đơn vị / MST trắng trơn.
            setDs((cu) => cu.map((x) => x.maDonVi === d.maDonVi
              ? {
                  ...x,
                  soNhanSu: rd.data.soNhanSu,
                  soHopDong: rd.data.soHopDong,
                  chuaMoNam: rd.data.chuaMoNam,
                  dangDem: false,
                }
              : x));
          })
          // Một đơn vị đếm hỏng chỉ mất số của dòng đó, lưới vẫn dùng được.
          .catch(() => {
            if (luot !== luotRef.current) return;
            setDs((cu) => cu.map((x) => x.maDonVi === d.maDonVi
              ? { ...x, dangDem: false, chuaMoNam: true } : x));
          });
      }
    } catch (e) {
      if (luot !== luotRef.current) return;
      setDs([]);
      setTai(false);
      message.error(loiApi(e, "Không đọc được danh sách đơn vị"));
    }
  };

  useEffect(() => {
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
  }, [session?.tenant.id, session?.fiscalYear]);

  const COT: ColumnsType<DonViHopDong> = [
    { title: "STT", width: 56, align: "center",
      render: (_, __, i) => i + 1 },
    { title: "Mã đơn vị", dataIndex: "maDonVi", width: 180,
      render: (v: string) => <b>{v}</b> },
    { title: "Tên đơn vị", dataIndex: "tenDonVi", ellipsis: true,
      render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
    { title: "MST", dataIndex: "mst", width: 130 },
    { title: "Số nhân sự", dataIndex: "soNhanSu", width: 110, align: "right",
      // Đơn vị chưa mở năm KHÁC HẲN đơn vị chưa nhập ai — hiện số 0 cho cả hai thì
      // kế toán tưởng đã vào xem rồi mà không có ai.
      render: (v: number, m) => m.dangDem ? <span className="hd-mo"></span>
        : m.chuaMoNam ? <Tag color="default">chưa mở năm</Tag>
        : v > 0 ? <b>{v}</b> : <span className="hd-mo">0</span> },
    { title: "Số hợp đồng", dataIndex: "soHopDong", width: 115, align: "right",
      render: (v: number, m) => m.dangDem ? <span className="hd-mo"></span>
        : m.chuaMoNam ? ""
        : v > 0 ? <b>{v}</b> : <span className="hd-mo">0</span> },
  ];

  // ===== NHẬP EXCEL — cửa vào của cả module =====
  //
  // HAI NHỊP: đọc file ra NHÁP (giữ ở FE, chưa chạm DB) -> soát trên màn -> bấm
  // "Lưu vào DB" mới ghi. Cùng nhịp với đường nhập của màn Chấm công / Bảng lương.
  //
  // Trước đây nhập là ghi thẳng, nên file sai đơn vị / sai sheet / trùng người đều
  // nằm trong sổ rồi mới biết, mà gỡ ra thì phải gỡ cả HOP_DONG trỏ vào.

  // Ngày công chuẩn cho file BẢNG LƯƠNG (BR-BL-01 — khuôn Excel không có ô đó).
  // Dùng lại đúng con số màn Bảng lương đang nhớ, để nhập ở đây và tính ở kia ra cùng
  // một kết quả; chưa có thì 26 như mặc định bên đó.
  const ngayCongChuan = () => {
    try {
      const n = Number(localStorage.getItem("kt2000_bang_luong_ngay_cong_chuan"));
      return Number.isFinite(n) && n > 0 && n <= 31 ? n : 26;
    } catch { return 26; }
  };

  // Chuẩn hóa tên để so khớp NGƯỜI giữa các file: bỏ dấu, thường hóa, gộp khoảng
  // trắng. PHẢI cùng luật với ExcelLuongService.ChuanTen bên server, nếu không thì
  // FE gộp một kiểu, server gộp kiểu khác và hai bên ra hai con số khác nhau.
  const chuanTen = (t: string | null | undefined) =>
    (t ?? "")
      .trim().toLowerCase().replace(/đ/g, "d")
      .normalize("NFD").replace(/\p{Mn}/gu, "").normalize("NFC")
      .split(/\s+/).filter(Boolean).join(" ");

  // GỘP NGƯỜI GIỮA CÁC FILE.
  //
  // File HĐLĐ và file bảng lương đều mang danh sách nhân viên, nên cùng một người
  // xuất hiện ở cả hai. Nháp lại tách theo file (mỗi file một NhapNhap) và server chỉ
  // gộp TRONG một file — nên lưới xem trước hiện 24 dòng cho 12 người.
  //
  // Lưu ý: lúc GHI, server tra lại sổ sau mỗi file nên DB vẫn chỉ có 12 người, không
  // sinh trùng. Nhưng con số trên màn phải khớp với thứ sắp ghi, chứ không thể bảo
  // "đọc 24" rồi ghi 12 — kế toán soát bằng chính con số đó.
  //
  // GIỮ BẢN ĐẦY ĐỦ HƠN: file HĐLĐ có ngày sinh + CMND, file bảng lương thường chỉ có
  // tên + chức danh. Gặp lại một người thì lấp vào những ô đang trống chứ không đè,
  // và dồn hợp đồng của cả hai bản về một người.
  const gopNguoi = (ds: NhapNhap[]): NhapNhap[] => {
    const dauTien = new Map<string, NhapNguoi>();

    return ds.map((f) => {
      const giu: NhapNguoi[] = [];

      for (const ng of f.nguoi) {
        const khoa = chuanTen(ng.nhanSu.hoTen);
        if (!khoa) continue;

        const cu = dauTien.get(khoa);
        if (!cu) {
          dauTien.set(khoa, ng);
          giu.push(ng);
          continue;
        }

        // Đã gặp ở file trước: lấp ô trống + dồn hợp đồng, KHÔNG thêm dòng mới.
        const a = cu.nhanSu as unknown as Record<string, unknown>;
        const b = ng.nhanSu as unknown as Record<string, unknown>;
        for (const k of Object.keys(b)) {
          const cua = a[k];
          if (cua === null || cua === undefined || cua === "") a[k] = b[k];
        }
        cu.hopDong.push(...ng.hopDong);
      }

      return { ...f, nguoi: giu };
    });
  };

  // ĐỌC file ra NHÁP. Không ghi một dòng nào vào sổ — nút "Lưu vào DB" mới ghi.
  const chayNhap = async (files: File[]) => {
    if (files.length === 0) return;

    // Đang có nháp CHƯA lưu mà đọc lượt mới thì lượt cũ mất trắng — phải hỏi. Không
    // gộp hai lượt: file lượt sau có thể là bản sửa của chính file lượt trước, gộp lại
    // thành ghi hai lần cùng một người.
    if (nhap.length > 0) {
      const dong = await new Promise<boolean>((ok) => {
        Modal.confirm({
          title: "Bỏ dữ liệu đang chờ lưu?",
          content: `Đang giữ ${choGhi.nguoi} người / ${choGhi.dong} dòng chưa ghi vào `
                 + "sổ. Đọc file mới sẽ thay thế toàn bộ số này.",
          okText: "Đọc file mới", cancelText: "Để tôi lưu trước",
          onOk: () => ok(true),
          onCancel: () => ok(false),
        });
      });
      if (!dong) { setMoNhap(false); return; }
    }

    setDangNhap(true);
    setBoQua([]);
    setKetQuaNhap([]);

    const ma = dvChon[0];
    const kq: KetQuaMotFile[] = [];
    const nhapMoi: NhapNhap[] = [];

    // XẾP LẠI THỨ TỰ: file tạo NHÂN SỰ đi TRƯỚC.
    //
    // Chấm công và bảng lương khớp người theo TÊN. Lúc ĐỌC nháp, server đã gộp cả
    // người trong sổ lẫn người vừa đọc ở file trước, nên thứ tự vẫn quyết định file
    // sau có nhận ra người của file trước hay không. Server xếp lại lần nữa lúc Lưu.
    const uuTien = (ten: string) => {
      const t = ten.toUpperCase();
      if (t.includes("HDLD") || t.includes("HOPDONG")
          || t.includes("HOP_DONG") || t.includes("NHANSU")
          || t.includes("NHAN_SU") || t.includes("DS_NV")) return 0;
      return 1;
    };
    const dsFile = [...files].sort((a, b) => uuTien(a.name) - uuTien(b.name));

    try {
      // Vẫn chạy TUẦN TỰ dù chỉ đọc: file sau cần thấy người của file trước để không
      // bỏ dòng "không có ai tên đó" — server nhận biết qua nháp đã đọc trước đó.
      for (let n = 0; n < dsFile.length; n++) {
        const f = dsFile[n];
        setTienDo(files.length > 1 ? `${n + 1}/${files.length}` : "");

        try {
          const r = await hdDocNhap(f, ma, ngayCongChuan());
          const d = r.data;

          if (!d.dungDonVi) {
            kq.push({ tenFile: f.name, trangThai: "loi", soNhanSu: 0, soHopDong: 0,
                      loi: d.canhBaoDonVi ?? "Sai đơn vị", bo: [] });
            continue;
          }

          const soHd = d.nguoi.reduce((t, x) => t + x.hopDong.length, 0)
                     + d.chamCong.reduce((t, x) => t + x.dong.length, 0)
                     + d.bangLuong.reduce((t, x) => t + x.dong.length, 0);

          if (d.nguoi.length === 0 && soHd === 0) {
            kq.push({ tenFile: f.name, trangThai: "bo", soNhanSu: 0, soHopDong: 0,
                      loi: "Không đọc được dòng nào", bo: d.bo });
            continue;
          }

          nhapMoi.push(d);
          kq.push({ tenFile: f.name, trangThai: "ok",
                    soNhanSu: d.nguoi.length, soHopDong: soHd, bo: d.bo });
        } catch (e) {
          // Một file hỏng KHÔNG dừng cả lượt.
          kq.push({ tenFile: f.name, trangThai: "loi", soNhanSu: 0, soHopDong: 0,
                    loi: loiApi(e, "Không đọc được file"), bo: [] });
        }
      }

      // Gộp người trùng giữa các file TRƯỚC khi chốt nháp, để lưới xem trước, con số
      // trên nút Lưu và thứ thật sự ghi vào sổ đều là một.
      const daGop = gopNguoi(nhapMoi);

      // Cột "Người" của từng file phải là số người file đó THẬT SỰ thêm mới, sau khi
      // đã trừ người file trước mang vào. Không sửa lại thì bảng ghi 12 + 12 trong khi
      // tổng chỉ 12, nhìn như số liệu đá nhau.
      for (const f of daGop) {
        const d = kq.find((x) => x.tenFile === f.tenFile);
        if (d) d.soNhanSu = f.nguoi.length;
      }

      setKetQuaNhap(kq);
      setBoQua(kq.flatMap((x) => x.bo));
      setNhap(daGop);

      const ok = kq.filter((x) => x.trangThai === "ok");
      const hong = kq.filter((x) => x.trangThai !== "ok");

      if (ok.length === 0) {
        message.error(
          files.length === 1
            ? kq[0].loi ?? "Không đọc được file"
            : `Không đọc được file nào (${files.length} file) — xem bảng bên dưới`);
      } else {
        const tongNguoi = daGop.reduce((t, x) => t + x.nguoi.length, 0);
        // Nói rõ CHƯA LƯU, nếu không kế toán tưởng xong việc rồi đóng màn.
        message.success(
          `Đã đọc ${tongNguoi} người từ ${ok.length}/${files.length} file`
          + (hong.length > 0 ? ` — ${hong.length} file lỗi` : "")
          + " · CHƯA lưu vào sổ, bấm \"Lưu vào DB\" để ghi");
      }

      if (ok.length > 0) setMoNhap(false);
    } finally {
      setDangNhap(false);
      setTienDo("");
    }
  };

  // GHI nháp vào sổ. Đây là bước DUY NHẤT chạm DB trong cả đường nhập Excel.
  const luuNhap = async () => {
    if (nhap.length === 0) return;

    setDangLuu(true);
    try {
      const r = await hdLuuNhap(nhap, dvChon[0]);
      const { soNhanSu, soHopDong, soChamCong, soBangLuong, bo } = r.data;

      const phan = [
        soNhanSu > 0 ? `${soNhanSu} nhân sự` : "",
        soHopDong > 0 ? `${soHopDong} hợp đồng` : "",
        soChamCong > 0 ? `${soChamCong} dòng chấm công` : "",
        soBangLuong > 0 ? `${soBangLuong} dòng bảng lương` : "",
      ].filter(Boolean);

      message.success(phan.length > 0
        ? `Đã ghi vào sổ: ${phan.join(", ")}`
        : "Không có dòng nào được ghi");

      // Dòng server bỏ lúc GHI (khớp tên hụt) gộp vào cảnh báo đang hiện.
      if (bo.length > 0) setBoQua((cu) => [...cu, ...bo]);

      // Nháp đã vào sổ thì bỏ đi — giữ lại là bấm Lưu lần nữa sẽ ghi chồng.
      setNhap([]);
      setKetQuaNhap([]);
      await nap();
    } catch (e) {
      // Lưu hỏng thì GIỮ NGUYÊN nháp để bấm lại, không bắt đọc file lại từ đầu.
      message.error(loiApi(e, "Không lưu được vào sổ"));
    } finally {
      setDangLuu(false);
    }
  };

  // Bỏ nháp: chỉ xóa thứ đang giữ trên FE, sổ chưa hề bị chạm nên không cần hỏi lại.
  const boNhap = () => {
    setNhap([]);
    setKetQuaNhap([]);
    setBoQua([]);
    message.info("Đã bỏ dữ liệu vừa đọc — sổ không thay đổi");
  };

  // ===== DỮ LIỆU XEM TRƯỚC cho ba màn con =====
  //
  // Đang giữ nháp thì ba màn kia mở ra phải thấy CHÍNH nháp đó, không phải gọi API
  // (sổ chưa có gì, gọi chỉ ra lưới rỗng). Truyền xuống qua prop `xemTruoc`; màn con
  // thấy prop này thì lấy thẳng và tắt mọi nút ghi.
  //
  // null = không có nháp -> màn con chạy như cũ, tự gọi API đọc sổ.

  // Nhân sự: gán id ÂM để rowKey không đụng nhau. Id thật chỉ có sau khi Lưu.
  const nsXemTruoc = useMemo<NhanSu[] | null>(() => {
    if (nhap.length === 0) return null;
    const ra: NhanSu[] = [];
    let gia = -1;
    for (const f of nhap)
      for (const ng of f.nguoi)
        ra.push({
          ...ng.nhanSu,
          id: gia--,
          // Số HĐ trên lưới = số hợp đồng đọc được của người đó trong nháp.
          soHopDong: ng.hopDong.length,
        });
    return ra;
  }, [nhap]);

  // Chấm công / bảng lương: gom theo THÁNG vì hai màn kia xem từng tháng một.
  const ccXemTruoc = useMemo<Record<number, ChamCongDto[]> | null>(() => {
    if (nhap.length === 0) return null;
    const ra: Record<number, ChamCongDto[]> = {};
    for (const f of nhap)
      for (const t of f.chamCong)
        ra[t.thang] = [...(ra[t.thang] ?? []), ...t.dong];
    return ra;
  }, [nhap]);

  const blXemTruoc = useMemo<Record<number, BangLuongDto[]> | null>(() => {
    if (nhap.length === 0) return null;
    const ra: Record<number, BangLuongDto[]> = {};
    for (const f of nhap)
      for (const t of f.bangLuong)
        ra[t.thang] = [...(ra[t.thang] ?? []), ...t.dong];
    return ra;
  }, [nhap]);

  // Tổng đang chờ ghi — hiện lên nút và thanh nhắc.
  const choGhi = nhap.reduce((t, x) => ({
    nguoi: t.nguoi + x.nguoi.length,
    dong: t.dong + x.nguoi.reduce((a, n) => a + n.hopDong.length, 0)
        + x.chamCong.reduce((a, c) => a + c.dong.length, 0)
        + x.bangLuong.reduce((a, b) => a + b.dong.length, 0),
  }), { nguoi: 0, dong: 0 });

  const chuaChon = dvChon.length !== 1;
  const nhacChon = "Tích chọn một đơn vị trên lưới trước";

  // Chưa có nhân sự thì ba màn kia mở ra chỉ thấy lưới rỗng — chấm công không có ai để
  // chấm, bảng lương không có ai để tính. Khóa lại và chỉ đúng việc phải làm trước:
  // Nhập Excel. Vẫn cho mở "Hợp đồng" vì đó là đường nhập tay, không cần file.
  // ĐANG GIỮ NHÁP thì ba màn kia MỞ ĐƯỢC, dù sổ còn trống: chúng hiện chính nháp đó
  // qua prop xemTruoc. Đây là cả điểm của bước soát — không xem được thì lấy gì soát
  // trước khi bấm Lưu.
  const coNhap = nhap.length > 0;

  const chuaCoNhanSu = !coNhap
    && (!dongDangChon
        || dongDangChon.dangDem
        || (dongDangChon.soNhanSu ?? 0) === 0);

  const nhacNhap = chuaChon
    ? nhacChon
    : `${dvChon[0]} chưa có nhân sự nào — bấm "Nhập Excel" để nạp file hợp đồng`
      + " lao động trước";

  // Tiêu đề nút khi đang xem nháp: nói rõ đây là bản chưa lưu, để không ai tưởng
  // mình đang nhìn số liệu trong sổ.
  const nhacXem = (gi: string) => coNhap
    ? `Xem trước ${gi} từ file vừa đọc — CHƯA lưu vào sổ`
    : null;

  const thanhLoc = (
    <Space size={8} wrap>
      <Button type="primary" icon={<UploadOutlined />}
              loading={dangNhap}
              disabled={chuaChon}
              onClick={() => setMoNhap(true)}
              title={chuaChon ? nhacChon
                : `Nạp file hợp đồng lao động cho ${dvChon[0]}`}>
        Nhập Excel{tienDo && ` ${tienDo}`}
      </Button>

      {/* Chỉ hiện khi ĐANG CÓ nháp. Đứng ngay cạnh Nhập Excel vì đó là bước kế tiếp
          của cùng một việc: đọc file -> soát -> Lưu. Số trên nút là số người sẽ ghi,
          để biết mình sắp lưu cái gì mà không phải nhìn đi chỗ khác. */}
      {nhap.length > 0 && (
        <>
          <Button type="primary" icon={<SaveOutlined />}
                  loading={dangLuu}
                  onClick={() => void luuNhap()}
                  title={`Ghi ${choGhi.nguoi} người / ${choGhi.dong} dòng vào sổ `
                       + `${dvChon[0] ?? ""}`}>
            Lưu vào DB ({choGhi.nguoi})
          </Button>
          <Button icon={<DeleteOutlined />}
                  disabled={dangLuu}
                  onClick={boNhap}
                  title="Bỏ dữ liệu vừa đọc, không ghi gì vào sổ">
            Bỏ nháp
          </Button>
        </>
      )}

      <Button icon={<TeamOutlined />}
              disabled={chuaChon || chuaCoNhanSu}
              onClick={() => setMoNhanSu(true)}
              title={chuaChon || chuaCoNhanSu ? nhacNhap
                : nhacXem("danh sách nhân sự")
                  ?? `Danh sách nhân sự của ${dvChon[0]}`}>
        Danh sách nhân sự
      </Button>

      <Button icon={<FileAddOutlined />}
              disabled={chuaChon}
              onClick={() => setMoTao(true)}
              title={chuaChon ? nhacChon : `Lập hợp đồng lao động cho ${dvChon[0]}`}>
        Hợp đồng
      </Button>

      <Button icon={<CalendarOutlined />}
              disabled={chuaChon || chuaCoNhanSu}
              onClick={() => setMoChamCong(true)}
              title={chuaChon || chuaCoNhanSu ? nhacNhap
                : nhacXem("bảng chấm công")
                  ?? `Bảng chấm công của ${dvChon[0]}`}>
        Bảng chấm công
      </Button>

      <Button icon={<DollarOutlined />}
              disabled={chuaChon || chuaCoNhanSu}
              onClick={() => setMoBangLuong(true)}
              title={chuaChon || chuaCoNhanSu ? nhacNhap
                : nhacXem("bảng thanh toán lương")
                  ?? `Bảng thanh toán lương của ${dvChon[0]}`}>
        Bảng lương
      </Button>
    </Space>
  );

  return (
    <Card
      className="hop-dong"
      title={
        <span>
          Hợp đồng lao động
          {nam > 0 && <span className="hd-ten-dv"> — năm {nam}</span>}
        </span>
      }
      extra={thanhLoc}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* Kết quả TỪNG file — bảng TRẦN, không bọc Alert.
          Alert của antd ăn thêm viền + nền + icon + hai lớp padding, mà nội dung đã là
          một cái bảng có viền riêng: lồng nhau thành hai khung trong một khung, chiếm
          gần nửa màn cho 2 dòng dữ liệu. Trạng thái từng file đã có cột "Kết quả" nói
          rồi, không cần màu nền của Alert nói thêm lần nữa.
          Chỉ hiện khi đọc từ 2 file trở lên, hoặc có file hỏng. */}
      {ketQuaNhap.length > 0
        && (ketQuaNhap.length > 1 || ketQuaNhap.some((x) => x.trangThai !== "ok")) && (
        <div className="hd-kq-doc">
          <div className="hd-kq-dau">
            <span>Kết quả đọc {ketQuaNhap.length} file</span>
            <Button type="text" size="small" icon={<CloseOutlined />}
                    onClick={() => { setKetQuaNhap([]); setBoQua([]); }}
                    title="Đóng bảng này (không bỏ nháp — nút Lưu vẫn còn)" />
          </div>
          <Table<KetQuaMotFile>
            size="small"
            rowKey="tenFile"
            dataSource={ketQuaNhap}
            pagination={false}
            // Cao theo số dòng, chỉ cuộn khi thật sự dài. Chốt cứng 220px thì 2 file
            // cũng chừa một mảng trắng bằng 5 dòng.
            scroll={ketQuaNhap.length > 6 ? { y: 200 } : undefined}
            // Tô nền theo trạng thái: file hỏng phải đập vào mắt ngay giữa một bảng
            // toàn dòng xanh, không bắt đọc từng cột "Kết quả" mới thấy.
            rowClassName={(m) => m.trangThai === "ok" ? "hd-kq-ok"
                               : m.trangThai === "bo" ? "hd-kq-bo" : "hd-kq-loi"}
            columns={[
              { title: "STT", width: 48, align: "center",
                render: (_, __, i) => <span className="hd-kq-stt">{i + 1}</span> },
              { title: "File", dataIndex: "tenFile", ellipsis: true,
                render: (v: string) => <span title={v}>{v}</span> },
              { title: "Kết quả", width: 96, align: "center",
                render: (_, m) => m.trangThai === "ok"
                  ? <Tag color="blue">đã đọc</Tag>
                  : m.trangThai === "bo"
                    ? <Tag color="orange">trống</Tag>
                    : <Tag color="red">lỗi</Tag> },
              // File HĐLĐ/DS_NV trả số hợp đồng; file chấm công/bảng lương trả số DÒNG.
              // Một cột "Dòng" nói được cả hai mà không phải dựng bốn cột rỗng.
              { title: "Dòng", dataIndex: "soHopDong", width: 70, align: "right",
                onHeaderCell: () => ({
                  title: "Số dòng đọc được, sẽ ghi khi bấm Lưu vào DB",
                }),
                render: (v: number, m) => m.trangThai === "ok" ? <b>{v}</b> : "" },
              { title: "Người", dataIndex: "soNhanSu", width: 70, align: "right",
                render: (v: number, m) =>
                  m.trangThai === "ok" && v > 0 ? v : "" },
              { title: "Ghi chú", ellipsis: true,
                render: (_, m) => m.loi
                  ?? (m.bo.length > 0 ? `bỏ ${m.bo.length} dòng` : "") },
            ]}
          />
        </div>
      )}

      {/* Sheet bị bỏ: nêu rõ sheet nào và vì sao, để kế toán mở file sửa đúng chỗ thay
          vì phải tự dò cả 12 sheet. */}
      {boQua.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${boQua.length} sheet không nhập được`}
          description={
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12.5 }}>
              {boQua.map((b, i) => (
                <div key={i}>
                  {b.hoTen ? <><b>{b.hoTen}</b> — </> : null}{b.lyDo}
                </div>
              ))}
            </div>
          }
          closable
          onClose={() => setBoQua([])}
        />
      )}

      <Table<DonViHopDong>
        className="hd-bang"
        size="small"
        rowKey="maDonVi"
        dataSource={ds}
        columns={COT}
        loading={tai}
        pagination={false}
        scroll={{ x: 950 }}
        rowSelection={{

          type: "radio",
          selectedRowKeys: dvChon,
          onChange: (keys) => setDvChon(keys as string[]),
          getCheckboxProps: (m) => ({ disabled: !m.dangDem && m.chuaMoNam }),
        }}
        onRow={(m) => ({
          onClick: () => { if (m.dangDem || !m.chuaMoNam) setDvChon([m.maDonVi]); },
          onDoubleClick: () => {
            if (m.dangDem || !m.chuaMoNam) {
              setDvChon([m.maDonVi]); setMoNhanSu(true);
            }
          },
          title: m.chuaMoNam
            ? "Đơn vị này chưa mở năm làm việc"
            : "Bấm để chọn  bấm đúp để mở danh sách nhân sự",
        })}
        rowClassName={(m) => !m.dangDem && m.chuaMoNam ? "hd-chua-mo" : ""}
        // Lưới rỗng ở đây thường KHÔNG phải vì không có đơn vị, mà vì chưa đơn vị nào
        // được tạo bảng module này — nói thẳng cách chữa, đừng để người dùng đoán.
        locale={{ emptyText: tai
          ? "Đang đọc danh sách đơn vị…"
          : "Chưa đơn vị nào được tạo bảng Hợp đồng + Lương cho năm này."
            + " Vào Quản trị → Mở năm làm việc, tích đơn vị rồi bấm"
            + " \"Tạo bảng Hợp đồng + Lương\"." }}
      />

      {/* Modal thả file — bấm "Nhập Excel" mới mở. Để Dragger nằm thẳng trên trang thì
          nó chiếm chỗ suốt cả phiên trong khi mỗi năm chỉ nạp một lần; mà lưới đơn vị
          mới là thứ người dùng nhìn nhiều nhất. */}
      <Modal
        title={
          <span>
            Nhập Excel hợp đồng, nhân sự, chấm công và bảng lương
            {dvChon.length === 1 && (
              <span className="hd-ten-dv"> — {dongDangChon?.tenDonVi || dvChon[0]}</span>
            )}
          </span>
        }
        open={moNhap}
        // Đang ghi vào sổ giữa chừng mà bấm nền đóng nhầm thì người dùng không biết đã
        // vào được mấy file — khóa lại cho tới lúc chạy xong.
        maskClosable={!dangNhap}
        closable={!dangNhap}
        onCancel={() => setMoNhap(false)}
        footer={null}
        // Rộng để tên đơn vị dài ("Công ty Cổ phần Thương mại và Dịch vụ Tây đô Hà
        // nội") nằm gọn một dòng với tiêu đề, khỏi đội tiêu đề xuống hai dòng và đẩy ô
        // thả bẹp lại.
        width={880}
        styles={{ body: { paddingTop: 4 } }}
      >
        <Upload.Dragger
          accept=".xls,.xlsx"
          multiple
          showUploadList={false}
          disabled={dangNhap}
          className="hd-tha"
          beforeUpload={(_, danhSach) => {
            // Ant gọi beforeUpload MỖI file nhưng đưa cả danh sách ở tham số thứ hai —
            // nhận trọn một lượt rồi bảo nó bỏ qua, khỏi chạy mười hai lần.
            void chayNhap(danhSach as File[]);
            return Upload.LIST_IGNORE;
          }}
        >
          <p className="hd-tha-icon"><InboxOutlined /></p>
          <p className="hd-tha-chu">
            {dangNhap
              ? `Đang nhập ${tienDo}…`
              : "Kéo thả file vào đây, hoặc bấm để chọn"}
          </p>
          <p className="hd-tha-phu">
            Nhận: <b>hợp đồng lao động</b> · <b>danh sách nhân sự</b> (DS_NV)
            {" · "}<b>bảng chấm công</b> (ccNN) · <b>bảng lương</b> (THANG n)
            <br />
            Chọn được NHIỀU file một lượt · .xls / .xlsx · tự nhận dạng từng file
            <br />
            File cả năm nhập trọn 12 tháng · ghi thẳng vào sổ
          </p>
        </Upload.Dragger>
      </Modal>

      {dvChon.length === 1 && (
        <DanhSachNhanSu
          mo={moNhanSu}
          onDong={() => { setMoNhanSu(false); void nap(); }}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          xemTruoc={nsXemTruoc}
        />
      )}

      {dvChon.length === 1 && (
        <TaoHopDong
          mo={moTao}
          onDong={() => { setMoTao(false); void nap(); }}
          onDaLuu={() => void nap()}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          hopDong={null}
        />
      )}

      {dvChon.length === 1 && (
        <ChamCong
          mo={moChamCong}
          onDong={() => { setMoChamCong(false); void nap(); }}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          xemTruoc={ccXemTruoc}
        />
      )}

      {dvChon.length === 1 && (
        <BangLuong
          mo={moBangLuong}
          onDong={() => { setMoBangLuong(false); void nap(); }}
          maDonVi={dvChon[0]}
          tenDonVi={dongDangChon?.tenDonVi}
          xemTruoc={blXemTruoc}
        />
      )}
    </Card>
  );
}
