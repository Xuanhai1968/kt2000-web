import { useEffect, useMemo, useState } from "react";
import { Alert, Typography, Modal, InputNumber, Input, Button, message } from "antd";
import { SaveOutlined, FileDoneOutlined, DiffOutlined, ImportOutlined } from "@ant-design/icons";
import { thueDocToKhaiTay, thueLuuToKhaiTay, thueDoiChieu, thueTkHaiQuan, loiApi } from "../../api";
import type { ToKhaiGtgt, ToKhaiTay, DongDoiChieu, KetQuaHaiQuan } from "../../api";
import "./bang-to-khai.css";

// BangToKhai.tsx — TỜ KHAI 01/GTGT, hai component trong một file:
//
//   BangToKhai (default)  — XEM/IN tờ khai đã TÍNH từ sổ hóa đơn (chỉ đọc)
//   NhapToKhaiTay (named) — NHẬP TAY tờ khai rồi lưu vào bảng TOKHAI
//
// Vì sao chung một file: cùng MỘT tờ khai 01/GTGT, cùng bộ chỉ tiêu ct21…ct43 và
// cùng bộ công thức. Tách hai file thì nhãn chỉ tiêu và công thức bị chép hai bản,
// sửa một bên quên bên kia là hai màn nói hai con số khác nhau.
//
// ============ PHẦN 1: BẢN IN CHUẨN HTKK ============
// Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md
// Khuôn dựng theo bản in thật: docs/NB/TKGTGT_T7_2026_DVT.pdf
//
// Dựng bằng BẢNG HTML THUẦN chứ không dùng Table của antd: bản in phải giống hệt tờ
// khai giấy — chỉ số [21]…[43] nằm trong ô riêng, dòng nhóm A/B/C/I/II/III in đậm,
// công thức ghi ngay dưới tên chỉ tiêu. Table của antd sinh sẵn lớp bọc, thanh cuộn
// và bố cục cột của riêng nó, ép về khuôn giấy còn khổ hơn tự viết.
//
// In ra PDF bằng window.print() + @media print. Không sinh PDF ở server: cái cần là
// bản in đúng khuôn, mà trình duyệt làm sẵn việc đó.

const so = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Ô mã chỉ tiêu + giá trị — cặp ô luôn đi cùng nhau trong tờ khai gốc.
//
// MỘT ô dùng cho CẢ HAI chế độ:
//   sua = undefined → chỉ hiện số (xem/in)
//   sua = hàm       → ô nhập được, gõ thẳng trong khuôn tờ khai
//   sua + tinh      → ô CÔNG THỨC: hiện số nhưng khóa, tô nền khác
// Nhờ vậy bản nhập tay và bản in dùng CHUNG một khuôn bảng, không phải dựng lại
// bố cục lần hai rồi lo hai bên lệch nhau.
function O({ ma, gt, sua, tinh }: {
  ma: string;
  gt?: number | null;
  sua?: (v: number) => void;
  tinh?: boolean;
}) {
  const nhapDuoc = sua != null && !tinh;
  return (
    <>
      <td className="o-ma">[{ma}]</td>
      <td className={`o-gt ${sua != null ? "o-sua" : ""} ${tinh ? "o-tinh" : ""}`}>
        {nhapDuoc ? (
          <InputNumber
            size="small"
            value={gt ?? 0}
            controls={false}
            variant="borderless"
            onFocus={(e) => e.target.select()}
            // Dấu . ngăn nghìn như tờ khai giấy; parser gỡ ra khi gõ.
            formatter={(v) => `${v ?? 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
            parser={(v) => Number((v ?? "").replace(/\./g, "")) || 0}
            onChange={(v) => sua(Number(v) || 0)}
          />
        ) : (gt == null ? "" : so(gt))}
      </td>
    </>
  );
}

export default function BangToKhai(
  { tk, sua }: { tk: ToKhaiGtgt; sua?: (ma: string, v: number) => void }) {
  const chan = tk.canhBao.filter((c) => c.muc === "CHAN");
  const nhac = tk.canhBao.filter((c) => c.muc !== "CHAN");
  const pl = tk.phuLucNq142;

  const homNay = new Date();
  const ngayKy = `Ngày ${String(homNay.getDate()).padStart(2, "0")} `
               + `tháng ${String(homNay.getMonth() + 1).padStart(2, "0")} `
               + `năm ${homNay.getFullYear()}`;

  return (
    <div className="to-khai">
      {/* ===== Cảnh báo: chỉ trên màn hình, không in ra giấy ===== */}
      {chan.length > 0 && (
        <Alert type="error" showIcon className="khong-in"
               style={{ marginBottom: 12 }}
               message={`Còn ${chan.length} lỗi phải xử lý trước khi xuất tờ khai`}
               description={
                 <ul style={{ margin: 0, paddingLeft: 18 }}>
                   {chan.map((c, i) => <li key={i}><b>[{c.ma}]</b> {c.moTa}</li>)}
                 </ul>} />
      )}
      {nhac.length > 0 && (
        <Alert type="warning" showIcon className="khong-in"
               style={{ marginBottom: 12 }}
               message="Điểm cần lưu ý"
               description={
                 <ul style={{ margin: 0, paddingLeft: 18 }}>
                   {nhac.map((c, i) => <li key={i}><b>[{c.ma}]</b> {c.moTa}</li>)}
                 </ul>} />
      )}
      {/* BR-TK-20 — tờ khai chỉ gồm một phần hóa đơn của kỳ. Nêu riêng thành dải
          màu chứ không để lẫn trong danh sách "điểm cần lưu ý": người cầm tờ khai
          này đi nộp phải biết ngay nó KHÔNG phải toàn bộ kỳ. */}
      {tk.locTheoChon && (
        <Alert type="info" showIcon className="khong-in"
               style={{ marginBottom: 12 }}
               message={`Tờ khai lập từ ${tk.soHdDaChon}/${tk.soHdCaKy} hóa đơn `
                      + "được chọn tay"}
               description={"Số liệu dưới đây chỉ gồm những hóa đơn đã tick trên "
                          + "lưới rà soát, không phải toàn bộ hóa đơn của kỳ. Bỏ hết "
                          + "tick rồi tạo lại nếu muốn tờ khai đầy đủ."} />
      )}
      {tk.nguonCt22 && (
        <Typography.Paragraph type="secondary" className="khong-in"
                              style={{ fontSize: 13, marginBottom: 10 }}>
          Chỉ tiêu 22 lấy từ {tk.nguonCt22}
        </Typography.Paragraph>
      )}

      {/* ==================== TRANG 1: TỜ KHAI CHÍNH ==================== */}
      <div className="tk-trang">
        <div className="tk-dau">
          <div className="tk-quocngu">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div className="tk-tieungu">Độc lập - Tự do - Hạnh phúc</div>
          <div className="tk-gach">------------------------</div>
          <div className="tk-ten">TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (MẪU SỐ 01/GTGT)</div>
          <div className="tk-apdung">
            (Áp dụng đối với người nộp thuế tính thuế theo phương pháp khấu trừ
            có hoạt động sản xuất kinh doanh)
          </div>

          {/* Khung mẫu số góc phải — đặc trưng của tờ khai HTKK */}
          <div className="tk-khungmau">
            <div>Mẫu số: <b>01/GTGT</b></div>
            <div className="tk-khungmau-mo">
              (Ban hành kèm theo Thông tư số 80/2021/TT-BTC ngày 29 tháng 9 năm 2021
              của Bộ trưởng Bộ Tài chính)
            </div>
          </div>
        </div>

        <div className="tk-ttin">
          <div className="tk-giua">
            <b>[01a]</b> Tên hoạt động sản xuất kinh doanh:
            Hoạt động sản xuất kinh doanh thông thường
          </div>
          <div className="tk-giua">
            <b>[01b]</b> Kỳ tính thuế: Tháng {String(tk.thang).padStart(2, "0")} năm {tk.nam}
          </div>
          <div className="tk-giua">
            <b>[02]</b> Lần đầu: [X] &nbsp; <b>[03]</b> Bổ sung lần thứ: [ ]
          </div>
          <div><b>[04] Tên người nộp thuế:</b> {tk.tenNnt}</div>
          <div><b>[05]</b> Mã số thuế: {tk.mst}</div>
          <div><b>[06] Tên đại lý thuế (nếu có):</b></div>
          <div><b>[07]</b> Mã số thuế:</div>
          <div><b>[08]</b> Hợp đồng đại lý thuế: Số<span className="tk-phai">Ngày:</span></div>
          <div><b>[09]</b> Tên đơn vị phụ thuộc/địa điểm kinh doanh của hoạt động
            sản xuất kinh doanh khác tỉnh nơi đóng trụ sở chính:</div>
          <div><b>[10]</b> Mã số thuế đơn vị phụ thuộc/Mã số địa điểm kinh doanh:</div>
          <div><b>[11]</b> Địa chỉ nơi có hoạt động sản xuất kinh doanh khác tỉnh
            nơi đóng trụ sở chính:</div>
          <div className="tk-thut">
            <b>[11a]</b> Xã/phường/đặc khu:
            <span className="tk-o11b"><b>[11b]</b> Quận/Huyện:</span>
            <span className="tk-o11c"><b>[11c]</b> Tỉnh/Thành phố:</span>
          </div>
        </div>

        <div className="tk-donvitien"><i>Đơn vị tiền: đồng Việt Nam</i></div>

        <table className="tk-bang">
          <thead>
            <tr>
              <th className="c-stt">STT</th>
              <th className="c-ten">Chỉ tiêu</th>
              <th className="c-gt" colSpan={2}>
                Giá trị hàng hóa, dịch vụ<br />(chưa có thuế giá trị gia tăng)
              </th>
              <th className="c-thue" colSpan={2}>Thuế giá trị gia tăng</th>
            </tr>
          </thead>
          <tbody>
            {/* [21] là Ô ĐÁNH DẤU "X", không phải ô tiền — bản in ghi X hoặc để
                trống. Ở chế độ nhập tay cho bấm để bật/tắt, vì đơn vị không phát
                sinh mua bán trong kỳ vẫn phải nộp tờ khai và đánh dấu đúng ô này. */}
            <tr className="d-nhom">
              <td className="c-stt">A</td>
              <td>Không phát sinh hoạt động mua, bán trong kỳ (đánh dấu "X")</td>
              <td className="o-ma">[21]</td>
              <td className={`o-gt o-danhdau ${sua ? "o-sua" : ""}`}
                  onClick={() => sua?.("ct21", tk.ct21 === 1 ? 0 : 1)}
                  title={sua ? "Bấm để đánh dấu / bỏ dấu" : undefined}>
                {tk.ct21 === 1 ? "X" : ""}
              </td>
              <td className="o-ma" />
              <td className="o-gt">[]</td>
            </tr>
            <tr className="d-nhom">
              <td className="c-stt">B</td>
              <td>Thuế giá trị gia tăng còn được khấu trừ kỳ trước chuyển sang</td>
              <td className="o-ma" /><td className="o-gt" />
              <O ma="22" gt={tk.ct22}
                 sua={sua && ((v) => sua("ct22", v))} />
            </tr>
            <tr className="d-nhom">
              <td className="c-stt">C</td>
              <td colSpan={5}>Kê khai thuế giá trị gia tăng phải nộp ngân sách nhà nước</td>
            </tr>

            <tr className="d-muc">
              <td className="c-stt">I</td>
              <td colSpan={5}>Hàng hoá, dịch vụ mua vào trong kỳ</td>
            </tr>
            <tr>
              <td className="c-stt">1</td>
              <td>Giá trị và thuế giá trị gia tăng của hàng hóa, dịch vụ mua vào</td>
              <O ma="23" gt={tk.ct23}
                 sua={sua && ((v) => sua("ct23", v))} />
              <O ma="24" gt={tk.ct24}
                 sua={sua && ((v) => sua("ct24", v))} />
            </tr>
            <tr>
              <td className="c-stt" />
              <td>Trong đó: hàng hóa, dịch vụ nhập khẩu</td>
              <O ma="23a" gt={tk.ct23a}
                 sua={sua && ((v) => sua("ct23a", v))} />
              <O ma="24a" gt={tk.ct24a}
                 sua={sua && ((v) => sua("ct24a", v))} />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td>Thuế giá trị gia tăng của hàng hóa, dịch vụ mua vào được khấu trừ kỳ này</td>
              <td className="o-ma" /><td className="o-gt" />
              <O ma="25" gt={tk.ct25}
                 sua={sua && ((v) => sua("ct25", v))} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">II</td>
              <td colSpan={5}>Hàng hoá, dịch vụ bán ra trong kỳ</td>
            </tr>
            <tr>
              <td className="c-stt">1</td>
              <td>Hàng hóa, dịch vụ bán ra không chịu thuế giá trị gia tăng</td>
              <O ma="26" gt={tk.ct26}
                 sua={sua && ((v) => sua("ct26", v))} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td>
                Hàng hóa, dịch vụ bán ra chịu thuế giá trị gia tăng
                <div className="ct-ct">([27]=[29]+[30]+[32]+[32a]; [28]=[31]+[33])</div>
              </td>
              <O ma="27" gt={tk.ct27} sua={sua ? (() => {}) : undefined} tinh />
              <O ma="28" gt={tk.ct28} sua={sua ? (() => {}) : undefined} tinh />
            </tr>
            <tr>
              <td className="c-stt">a</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 0%</td>
              <O ma="29" gt={tk.ct29}
                 sua={sua && ((v) => sua("ct29", v))} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">b</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 5%</td>
              <O ma="30" gt={tk.ct30}
                 sua={sua && ((v) => sua("ct30", v))} />
              <O ma="31" gt={tk.ct31}
                 sua={sua && ((v) => sua("ct31", v))} />
            </tr>
            <tr>
              <td className="c-stt">c</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 10%</td>
              <O ma="32" gt={tk.ct32}
                 sua={sua && ((v) => sua("ct32", v))} />
              <O ma="33" gt={tk.ct33}
                 sua={sua && ((v) => sua("ct33", v))} />
            </tr>
            <tr>
              <td className="c-stt">d</td>
              <td>Hàng hoá, dịch vụ bán ra không tính thuế</td>
              <O ma="32a" gt={tk.ct32a}
                 sua={sua && ((v) => sua("ct32a", v))} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">3</td>
              <td>
                Tổng doanh thu và thuế giá trị gia tăng của hàng hóa, dịch vụ bán ra
                <div className="ct-ct">([34]=[26]+[27]; [35]=[28])</div>
              </td>
              <O ma="34" gt={tk.ct34} sua={sua ? (() => {}) : undefined} tinh />
              <O ma="35" gt={tk.ct35} sua={sua ? (() => {}) : undefined} tinh />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">III</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng phát sinh trong kỳ ([36]=[35]-[25])
              </td>
              <O ma="36" gt={tk.ct36} sua={sua ? (() => {}) : undefined} tinh />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">IV</td>
              <td colSpan={5}>
                Điều chỉnh tăng, giảm thuế giá trị gia tăng còn được khấu trừ của các kỳ trước
              </td>
            </tr>
            <tr>
              <td className="c-stt">1</td>
              <td colSpan={3}>Điều chỉnh giảm</td>
              <O ma="37" gt={tk.ct37}
                 sua={sua && ((v) => sua("ct37", v))} />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td colSpan={3}>Điều chỉnh tăng</td>
              <O ma="38" gt={tk.ct38}
                 sua={sua && ((v) => sua("ct38", v))} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">V</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng nhận bàn giao được khấu trừ trong kỳ
              </td>
              {/* Bản in ghi [39a] chứ không phải [39] — đo trên PDF gốc
                  docs/THUE/TOKHAI/TKGTGT_T7_2026_DVT.pdf (mục V). Bảng TOKHAI lại
                  đặt tên cột là ct39_nnt theo khuôn Excel; chỗ đọc/ghi tự ánh xạ. */}
              <O ma="39a" gt={tk.ct39a}
                 sua={sua && ((v) => sua("ct39", v))} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">VI</td>
              <td colSpan={5}>
                Xác định nghĩa vụ thuế giá trị gia tăng phải nộp trong kỳ:
              </td>
            </tr>
            <tr className="d-dam">
              <td className="c-stt">1</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng phải nộp của hoạt động sản xuất kinh doanh trong kỳ
                <div className="ct-ct">{"{[40a]=([36]-[22]+[37]-[38]-[39a]) ≥ 0}"}</div>
              </td>
              <O ma="40a" gt={tk.ct40a} sua={sua ? (() => {}) : undefined} tinh />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">2</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng mua vào của dự án đầu tư được bù trừ với thuế GTGT
                còn phải nộp của hoạt động sản xuất kinh doanh cùng kỳ tính thuế
                ([40b]≤[40a])
              </td>
              <O ma="40b" gt={tk.ct40b}
                 sua={sua && ((v) => sua("ct40b", v))} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">3</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng còn phải nộp trong kỳ ([40]=[40a]-[40b])
              </td>
              <O ma="40" gt={tk.ct40} sua={sua ? (() => {}) : undefined} tinh />
            </tr>
            {/* Dòng 4 của bản in CHỈ có công thức, không có tên chỉ tiêu — đúng như
                PDF gốc. Giữ nguyên để bản in khớp từng dòng với tờ khai giấy. */}
            <tr className="d-dam">
              <td className="c-stt">4</td>
              <td colSpan={3}>
                {"{[41]=([36]-[22]+[37]-[38]-[39a]) ≤ 0}"}
              </td>
              <O ma="41" gt={tk.ct41} sua={sua ? (() => {}) : undefined} tinh />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">4.1</td>
              <td colSpan={3}>Thuế giá trị gia tăng đề nghị hoàn ([42] ≤ [41])</td>
              <O ma="42" gt={tk.ct42}
                 sua={sua && ((v) => sua("ct42", v))} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">4.2</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng còn được khấu trừ chuyển kỳ sau ([43]=[41]-[42])
              </td>
              <O ma="43" gt={tk.ct43} sua={sua ? (() => {}) : undefined} tinh />
            </tr>
          </tbody>
        </table>

        <p className="tk-camdoan">
          Tôi cam đoan số liệu khai trên là đúng và chịu trách nhiệm trước pháp luật
          về những số liệu đã khai./...
        </p>

        <div className="tk-chuky">
          <div className="tk-ky-trai">
            <div className="tk-ky-ten">NHÂN VIÊN ĐẠI LÝ THUẾ</div>
            <div>Họ và tên:</div>
            <div>Chứng chỉ hành nghề số:</div>
          </div>
          <div className="tk-ky-phai">
            <div className="tk-ky-ngay"><i>{ngayKy}</i></div>
            <div className="tk-ky-ten">
              NGƯỜI NỘP THUẾ hoặc<br />
              ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ
            </div>
            <div className="tk-ky-mo">
              <i>Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có)</i>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== TRANG 2: PHỤ LỤC GIẢM THUẾ ==================== */}
      {pl && (
        <div className="tk-trang tk-trang-moi">
          <div className="tk-dau">
            <div className="tk-quocngu">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div className="tk-tieungu">Độc lập - Tự do - Hạnh phúc</div>
            <div className="tk-gach">------------------------</div>
            <div className="tk-ten">
              GIẢM THUẾ GIÁ TRỊ GIA TĂNG THEO NGHỊ QUYẾT SỐ 204/2025/QH15
            </div>
            <div className="tk-apdung">
              (Kèm theo Tờ khai thuế GTGT Kỳ tính thuế:
              Tháng {String(tk.thang).padStart(2, "0")} năm {tk.nam})
            </div>
          </div>

          <div className="tk-ttin">
            <div>[01] Tên người nộp thuế: {tk.tenNnt}</div>
            <div>[02] Mã số thuế: {tk.mst}</div>
            <div>[03] Tên đại lý thuế (nếu có):</div>
            <div>[04] Mã số thuế:</div>
          </div>

          <div className="tk-donvitien"><i>Đơn vị tiền: đồng Việt Nam</i></div>

          <div className="pl-muc">
            <b>I. Hàng hóa, dịch vụ mua vào trong kỳ được áp dụng mức thuế suất thuế
            giá trị gia tăng 8%</b> (áp dụng cho người nộp thuế kê khai theo phương pháp
            khấu trừ thuế)
          </div>
          <table className="tk-bang pl-bang">
            <thead>
              <tr>
                <th style={{ width: 46 }}>STT</th>
                <th style={{ width: 130 }}>Tên hàng hóa, dịch vụ</th>
                <th>Giá trị hàng hóa, dịch vụ mua vào chưa có thuế GTGT
                    được khấu trừ trong kỳ</th>
                <th>Thuế GTGT của hàng hóa, dịch vụ mua vào được khấu trừ trong kỳ</th>
              </tr>
              <tr className="d-sohieu">
                <td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="giua">1</td>
                <td>Hàng hóa, dịch vụ mua vào</td>
                <td className="o-gt">{so(pl.giaTriHhdvMuaVao)}</td>
                <td className="o-gt">{so(pl.thueGtgtHhdvMuaVao)}</td>
              </tr>
              <tr className="d-dam">
                <td colSpan={2} className="phai">Tổng cộng:</td>
                <td className="o-gt">{so(pl.giaTriHhdvMuaVao)}</td>
                <td className="o-gt">{so(pl.thueGtgtHhdvMuaVao)}</td>
              </tr>
            </tbody>
          </table>

          <div className="pl-muc"><b>II. Hàng hóa, dịch vụ bán ra trong kỳ</b></div>
          <table className="tk-bang pl-bang">
            <thead>
              <tr>
                <th style={{ width: 46 }}>STT</th>
                <th style={{ width: 120 }}>Tên hàng hóa, dịch vụ</th>
                <th>Giá trị hàng hóa, dịch vụ chưa có thuế GTGT</th>
                <th>Thuế suất thuế GTGT theo quy định</th>
                <th>Thuế suất thuế GTGT sau giảm</th>
                <th>Thuế GTGT của hàng hóa, dịch vụ bán ra được giảm</th>
              </tr>
              <tr className="d-sohieu">
                <td>(1)</td><td>(2)</td><td>(3)</td><td>(4)</td>
                <td>(5)=(4)x80%</td><td>(6)=(3)x[(4)-(5)]</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="giua">1</td>
                <td>HHBR</td>
                <td className="o-gt">{so(pl.giaTriHhdvBanRa)}</td>
                <td className="giua">{pl.thueSuatTheoQuyDinh}</td>
                <td className="giua">{pl.thueSuatSauGiam}</td>
                <td className="o-gt">{so(pl.thueGtgtDuocGiam)}</td>
              </tr>
              <tr className="d-dam">
                <td colSpan={2} className="phai">Tổng cộng:</td>
                <td className="o-gt">{so(pl.giaTriHhdvBanRa)}</td>
                <td /><td />
                <td className="o-gt">{so(pl.thueGtgtDuocGiam)}</td>
              </tr>
            </tbody>
          </table>

          <div className="pl-muc">
            III. Chênh lệch thuế GTGT của hàng hoá, dịch vụ bán ra và mua vào trong kỳ
            được áp dụng mức thuế suất thuế giá trị gia tăng 8%:
            <b> [09] = [08] - [06]: </b>{so(pl.chenhLechCt9)} đồng
          </div>

          <p className="tk-camdoan">
            Tôi cam đoan những nội dung kê khai trên là đúng và chịu trách nhiệm trước
            pháp luật về thông tin đã khai./.
          </p>

          <div className="tk-chuky">
            <div className="tk-ky-trai">
              <div className="tk-ky-ten">NHÂN VIÊN ĐẠI LÝ THUẾ</div>
              <div>Họ và tên:</div>
              <div>Chứng chỉ hành nghề số:</div>
            </div>
            <div className="tk-ky-phai">
              <div className="tk-ky-ngay"><i>{ngayKy}</i></div>
              <div className="tk-ky-ten">
                NGƯỜI NỘP THUẾ hoặc<br />
                ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ
              </div>
              <div className="tk-ky-mo">
                <i>Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có)</i>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============ PHẦN 2: NHẬP TAY TỜ KHAI 01/GTGT ============
//
// Dùng cho đơn vị CHƯA CÓ HÓA ĐƠN trong sổ nhưng vẫn phải nộp tờ khai (AK_GLOBAL,
// ANH_DAO, CONG_TY_B… — trắng trơn trên lưới chéo). Kế toán gõ tay chỉ tiêu từ tờ
// khai giấy/HTKK rồi lưu vào bảng TOKHAI, để KỲ SAU tự lấy được ct22 (BR-TK-02)
// mà không phải nhớ lại con số.
//
// GÕ THẲNG TRONG KHUÔN TỜ KHAI: dùng lại chính component BangToKhai ở trên, chỉ
// truyền thêm hàm `sua`. Kế toán nhìn thấy đúng bản in PDF quen thuộc và điền vào
// đúng ô [23], [24]… như điền tờ khai giấy — không phải học một bố cục thứ hai,
// và không có nguy cơ hai màn lệch nhau vì chép nhãn/công thức hai bản.
//
// Ô CÔNG THỨC (ct27, ct34, ct36, ct40, ct41, ct43…) tự tính, khóa không cho gõ:
// công thức in sẵn trên tờ khai, cho sửa thì kế toán gõ ra số không cân mà cơ quan
// thuế sẽ trả về.

// Bản rỗng của ToKhaiTay — dùng khi kỳ đó chưa lưu lần nào.
const RONG_TAY: ToKhaiTay = {
  maDonVi: "", nam: 0, thang: 0, lanNop: 0,
  ct21: 0, ct22: 0, ct23: 0, ct24: 0, ct23a: 0, ct24a: 0, ct25: 0, ct26: 0,
  ct27: 0, ct28: 0, ct29: 0, ct30: 0, ct31: 0, ct32: 0,
  ct33: 0, ct32a: 0, ct34: 0, ct35: 0, ct36: 0, ct37: 0,
  ct38: 0, ct39: 0, ct40a: 0, ct40b: 0, ct40: 0, ct41: 0,
  ct42: 0, ct43: 0,
};

interface PropsTay {
  mo: boolean;
  onDong: () => void;
  /** Đã lưu xong — để màn cha nạp lại lưới cho thấy số mới. */
  onDaLuu?: () => void;
  maDonVi: string;
  tenDonVi?: string | null;
  /** MST của đơn vị — điền sẵn vào ô [05] cho tờ khai mới. */
  mstDonVi?: string | null;
  nam: number;
  thang: number;
}

export function NhapToKhaiTay(
  { mo, onDong, onDaLuu, maDonVi, tenDonVi, mstDonVi, nam, thang }: PropsTay) {

  const [tk, setTk] = useState<ToKhaiTay>(RONG_TAY);
  const [tai, setTai] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [daCo, setDaCo] = useState(false);
  // Nguồn của ct22 — hiện dưới chân để kế toán biết số tồn đầu ở đâu ra (BR-TK-02).
  const [nguonCt22, setNguonCt22] = useState<string | null>(null);

  // ----- ĐỐI CHIẾU BA NGUỒN: tờ khai · sổ hóa đơn · bản TCT trả về -----
  const [dc, setDc] = useState<DongDoiChieu[] | null>(null);
  const [dangDc, setDangDc] = useState(false);
  const [hq, setHq] = useState<KetQuaHaiQuan | null>(null);
  const [dangHq, setDangHq] = useState(false);

  // [23a]/[24a] lấy từ kho tờ khai HẢI QUAN — thuế khâu nhập khẩu không có trong bảng
  // kê hóa đơn điện tử nên tờ khai tính tự động luôn thiếu phần này.
  // CHỈ HIỆN SỐ, không tự điền: kế toán xem chi tiết rồi tự bấm "Lấy số" — hai ô này
  // là số kế toán chịu trách nhiệm, không phải số máy suy ra.
  const layHaiQuan = async () => {
    setDangHq(true);
    try {
      const r = await thueTkHaiQuan(maDonVi, thang, nam);
      setHq(r.data);
      if (!r.data.coThuMuc)
        message.warning(`Không có thư mục tờ khai hải quan kỳ ${String(thang).padStart(2, "0")}/${nam}`);
      else if (r.data.soToKhai === 0)
        message.warning("Thư mục có nhưng không đọc được tờ khai nào");
      else
        message.success(`Đọc được ${r.data.soToKhai} tờ khai hải quan`);
    } catch (e) {
      setHq(null);
      message.error(loiApi(e, "Không đọc được tờ khai hải quan"));
    } finally {
      setDangHq(false);
    }
  };

  // Chỉ hiện dòng CÓ LỆCH: 26 chỉ tiêu mà bày hết thì phần khớp lấn át phần lệch,
  // đúng thứ cần nhìn lại chìm nghỉm.
  const doiChieu = async () => {
    setDangDc(true);
    try {
      const r = await thueDoiChieu(maDonVi, thang, nam);
      setDc(r.data.dong.filter((x) => x.coLech));
      if (r.data.soLech === 0) message.success("Khớp cả ba nguồn — không có lệch");
      else message.warning(`${r.data.soLech} chỉ tiêu lệch`);
    } catch (e) {
      setDc(null);
      message.error(loiApi(e, "Không đối chiếu được"));
    } finally {
      setDangDc(false);
    }
  };

  // Nạp bản đã lưu (nếu có) mỗi lần mở — mở ra sửa tiếp chứ không phải lúc nào cũng
  // gõ lại từ đầu. Chưa lưu lần nào thì server trả 204, dữ liệu rỗng → form trắng.
  useEffect(() => {
    if (!mo || !maDonVi) return;
    const id = setTimeout(() => {
      setTai(true);
      thueDocToKhaiTay(maDonVi, thang, nam)
        .then((r) => {
          // Server trả BA dạng (xem ThueController.DocToKhaiTay):
          //   204 rỗng            -> kỳ chưa lưu VÀ kỳ trước cũng chưa có tờ khai
          //   { ct22, nguonCt22 } -> chưa lưu, nhưng ĐIỀN SẴN tồn đầu từ kỳ trước
          //   { tk, nguonCt22 }   -> đã lưu rồi
          const d = r.data as unknown as
            { tk?: ToKhaiTay; ct22?: number; nguonCt22?: string } | "" | null;
          if (!d || typeof d !== "object") {
            setDaCo(false);
            setTk({ ...RONG_TAY, maDonVi, nam, thang });
            setNguonCt22(null);
            return;
          }
          setNguonCt22(d.nguonCt22 ?? null);
          if (d.tk) {
            setDaCo(true);
            setTk(d.tk);
          } else {
            // Khung rỗng nhưng ct22 đã có sẵn từ kỳ trước — kế toán khỏi phải mở
            // tờ khai cũ ra chép tay (chỗ hay sai nhất của cả quy trình).
            setDaCo(false);
            setTk({ ...RONG_TAY, maDonVi, nam, thang, ct22: d.ct22 ?? 0 });
          }
        })
        .catch((e) => {
          setDaCo(false);
          setTk({ ...RONG_TAY, maDonVi, nam, thang });
          setNguonCt22(null);
          message.error(loiApi(e, "Không đọc được tờ khai đã lưu"));
        })
        .finally(() => setTai(false));
    }, 0);
    return () => clearTimeout(id);
  }, [mo, maDonVi, nam, thang]);

  // ----- Ô TỰ TÍNH -----
  // ct40a có thể ÂM — khi âm thì phần âm đó chuyển sang ct41 (chưa khấu trừ hết)
  // chứ không phải "phải nộp số âm". Đây đúng là chỗ tờ khai giấy hay bị điền nhầm.
  const st = useMemo(() => {
    const ct27 = tk.ct29 + tk.ct30 + tk.ct32 + tk.ct32a;
    const ct28 = tk.ct31 + tk.ct33;
    const ct34 = tk.ct26 + ct27;
    const ct35 = ct28;
    const ct36 = ct35 - tk.ct25;
    const con = ct36 - tk.ct22 + tk.ct37 - tk.ct38 - tk.ct39;
    const ct40a = con > 0 ? con : 0;
    const ct40 = Math.max(ct40a - tk.ct40b, 0);
    const ct41 = con < 0 ? -con : 0;
    const ct43 = Math.max(ct41 - tk.ct42, 0);
    return { ct27, ct28, ct34, ct35, ct36, ct40a, ct40, ct41, ct43 };
  }, [tk]);

  // Ghép thành ToKhaiGtgt để đưa vào BangToKhai — component đó nhận kiểu đầy đủ
  // (có cảnh báo, nhóm thuế suất…), còn bản gõ tay không có mấy thứ đó nên để rỗng.
  const tkHien = useMemo(() => ({
    // ...tk PHẢI đứng TRƯỚC mấy dòng dưới: nó mang mst/tenNnt kiểu `string | null`,
    // để nó spread sau thì giá trị null của bản mới ghi đè mất phần dự phòng —
    // đúng lỗi "Mã số thuế: (trống)" nhìn thấy trên màn hình.
    ...tk, ...st,
    nam, thang, maDonVi,
    // Hồ sơ đơn vị: ưu tiên số đã lưu, chưa có thì lấy từ màn cha truyền xuống.
    mst: tk.mst || mstDonVi || "",
    tenNnt: tk.tenNnt || tenDonVi || maDonVi,
    diaChiNnt: tk.diaChiNnt ?? null,
    maCqtNoiNop: tk.maCct ?? null, tenCqtNoiNop: tk.tenCct ?? null,
    // ct23a/24a (hàng nhập khẩu) — kế toán gõ tay, lưu ở ct23a_nnt/ct24a_nnt.
    ct23a: tk.ct23a, ct24a: tk.ct24a,
    // ct39a của bản in ứng với ct39 của bảng TOKHAI (khác tên, cùng chỉ tiêu).
    ct39a: tk.ct39,
    phuLucNq142: null, nhomBanRa: [], nhomMuaVao: [], canhBao: [],
    nguonCt22: null, choXuat: true, tenFileXml: "",
    // BR-TK-20 không áp cho bản gõ tay: người dùng tự gõ chỉ tiêu, không có khái
    // niệm "chọn một phần hóa đơn trong sổ".
    locTheoChon: false, soHdDaChon: 0, soHdCaKy: 0,
  }), [tk, st, nam, thang, maDonVi, tenDonVi, mstDonVi]);

  // Tờ khai RỖNG = mọi chỉ tiêu tiền đều 0. Không cho lưu: lưới sẽ hiện một dòng
  // toàn số 0 trông y như "đã khai và bằng 0", trong khi thực ra chưa khai — và kỳ
  // sau lấy ct43 = 0 đó làm tồn đầu thì sai dây chuyền.
  // Ô [21] "không phát sinh mua bán" là ngoại lệ: đánh dấu nó thì tờ khai toàn 0
  // vẫn hợp lệ. Server chặn lại y hệt (xem ThueController.LuuToKhaiTay).
  const coSoLieu = tk.ct21 === 1
    || [tk.ct22, tk.ct23, tk.ct24, tk.ct25, tk.ct26, tk.ct29, tk.ct30, tk.ct31,
        tk.ct32, tk.ct33, tk.ct32a, tk.ct37, tk.ct38, tk.ct39, tk.ct40b, tk.ct42,
        st.ct27, st.ct34, st.ct36, st.ct40, st.ct43].some((v) => (v || 0) !== 0);

  const luu = async () => {
    setDangLuu(true);
    try {
      // Gộp ô tự tính vào bản ghi TRƯỚC KHI gửi: bảng TOKHAI lưu đủ 26 chỉ tiêu để
      // kỳ sau và lưới chéo đọc thẳng, không phải tính lại.
      await thueLuuToKhaiTay({ ...tk, ...st, maDonVi, nam, thang });
      message.success(`Đã lưu tờ khai ${String(thang).padStart(2, "0")}/${nam}`);
      setDaCo(true);
      onDaLuu?.();
      onDong();
    } catch (e) {
      message.error(loiApi(e, "Không lưu được tờ khai"));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal
      title={
        <span>
          <FileDoneOutlined style={{ marginRight: 8 }} />
          Tạo tờ khai — <b>{maDonVi}</b>
          {tenDonVi && <span className="ntk-ten"> · {tenDonVi}</span>}
          <span className="ntk-ky"> · kỳ {String(thang).padStart(2, "0")}/{nam}</span>
        </span>
      }
      open={mo}
      onCancel={onDong}
      // Rộng đúng khổ tờ khai: hẹp hơn thì bảng bị bóp, mất dáng bản in.
      width={1000}
      style={{ top: 16 }}
      styles={{ body: { maxHeight: "calc(100vh - 200px)", overflowY: "auto",
                        background: "#f0f2f5", padding: 12 } }}
      footer={
        <div className="ntk-chan">
          <span className="ntk-nhac">
            {daCo ? "Kỳ này đã có tờ khai — lưu sẽ ghi đè"
                  : "Kỳ này chưa có tờ khai"}
            {nguonCt22 && <> · tồn đầu lấy từ {nguonCt22}</>}
            {" · ô nền vàng là ô TỰ TÍNH, không gõ được"}
          </span>
          {/* Bỏ nút "Đóng" — dấu X góc phải của Modal đã làm đúng việc đó, để hai
              lối đóng cạnh nhau chỉ tổ chia sự chú ý khỏi nút Lưu. */}
          {/* ĐỐI CHIẾU — chỉ bật khi kỳ này ĐÃ lưu tờ khai: chưa lưu thì không có
              gì để so, bấm vào chỉ nhận bảng rỗng. */}
          <Button icon={<DiffOutlined />} loading={dangDc}
                  disabled={tai || !daCo} onClick={doiChieu}
                  title={daCo ? "So tờ khai với sổ hóa đơn và bản TCT trả về"
                              : "Lưu tờ khai trước rồi mới đối chiếu được"}>
            Đối chiếu
          </Button>
          <Button icon={<ImportOutlined />} loading={dangHq} disabled={tai}
                  onClick={layHaiQuan}
                  title="Đọc kho tờ khai hải quan của kỳ để lấy [23a]/[24a]">
            Tờ khai hải quan
          </Button>
          <Button type="primary" icon={<SaveOutlined />}
                  loading={dangLuu} disabled={tai || !coSoLieu} onClick={luu}
                  title={coSoLieu ? undefined
                    : "Chưa có số liệu — nhập ít nhất một chỉ tiêu, hoặc đánh dấu "
                      + "[21] nếu kỳ này không phát sinh mua bán"}>
            Lưu tờ khai
          </Button>
        </div>
      }
    >
      <div className="ntk-ghichu khong-in">
        <span>Ghi chú</span>
        <Input size="small" value={tk.ghiChu ?? ""} disabled={tai}
               placeholder="Ghi chú nội bộ, không in ra tờ khai"
               onChange={(e) => setTk((c) => ({ ...c, ghiChu: e.target.value }))} />
      </div>

      {hq && (
        <div className="dc-khoi khong-in">
          <div className="dc-dau">
            <b>Tờ khai hải quan {String(thang).padStart(2, "0")}/{nam}</b>
            <span className="dc-mo">
              {hq.soFile} file · {hq.soToKhai} tờ khai
            </span>
            <span className="dc-day" />
            {hq.soToKhai > 0 && (
              <Button size="small" type="primary" onClick={() => {
                setTk((c) => ({ ...c, ct23a: hq.tongTriGia, ct24a: hq.tongTienThue }));
                message.success("Đã điền [23a]/[24a] — kiểm tra lại trước khi lưu");
              }}>
                Lấy số vào [23a]/[24a]
              </Button>
            )}
            <Button size="small" onClick={() => setHq(null)}>Đóng</Button>
          </div>

          {hq.soToKhai === 0 ? (
            <div className="dc-khop">Không có tờ khai hải quan nào đọc được ở kỳ này.</div>
          ) : (
            <table className="dc-bang">
              <thead>
                <tr>
                  <th>Số tờ khai</th>
                  <th>Ngày đăng ký</th>
                  <th>Trị giá tính thuế</th>
                  <th>Thuế suất</th>
                  <th>Tiền thuế GTGT</th>
                </tr>
              </thead>
              <tbody>
                {hq.dong.map((d, i) => (
                  <tr key={`${d.soToKhai}-${i}`}>
                    <td>{d.soToKhai}</td>
                    <td>{d.ngayDangKy ?? ""}</td>
                    <td className="phai">{so(d.triGia)}</td>
                    <td className="giua">{d.thueSuat ?? ""}</td>
                    <td className="phai">{so(d.tienThue)}</td>
                  </tr>
                ))}
                <tr className="d-dam">
                  <td colSpan={2}>Tổng — vào [23a] / [24a]</td>
                  <td className="phai">{so(hq.tongTriGia)}</td>
                  <td />
                  <td className="phai">{so(hq.tongTienThue)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {hq.canhBao.length > 0 && (
            <ul className="hq-canhbao">
              {hq.canhBao.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
        </div>
      )}

      {dc && (
        <div className="dc-khoi">
          <div className="dc-dau">
            <b>Đối chiếu ba nguồn</b>
            <span className="dc-mo">tờ khai - sổ hóa đơn - bản TCT trả về</span>
            <span className="dc-day" />
            <Button size="small" onClick={() => setDc(null)}>Đóng</Button>
          </div>
          {dc.length === 0 ? (
            <div className="dc-khop">
            Cả ba nguồn khớp nhau — không có chỉ tiêu nào lệch.
            </div>
          ) : (
            <table className="dc-bang">
              <thead>
                <tr>
                  <th>CT</th><th>Chỉ tiêu</th>
                  <th>Tờ khai</th><th>Sổ hóa đơn</th><th>TCT trả về</th>
                  <th>Lệch sổ</th><th>Lệch TCT</th>
                </tr>
              </thead>
              <tbody>
                {dc.map((x) => (
                  <tr key={x.ma}>
                    <td className="dc-ma">[{x.ma}]</td>
                    <td>{x.ten}</td>
                    <td className="dc-so">{so(x.toKhai)}</td>
                    <td className="dc-so">{x.so == null ? <i>—</i> : so(x.so)}</td>
                    <td className="dc-so">{x.tct == null ? <i>—</i> : so(x.tct)}</td>
                    <td className={`dc-so ${(x.lechSo ?? 0) !== 0 ? "dc-lech" : ""}`}>
                      {x.lechSo == null ? "" : so(x.lechSo)}
                    </td>
                    <td className={`dc-so ${(x.lechTct ?? 0) !== 0 ? "dc-lech" : ""}`}>
                      {x.lechTct == null ? "" : so(x.lechTct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="ntk-to">
        <BangToKhai
          tk={tkHien}
          sua={(ma, v) => setTk((cu) => ({ ...cu, [ma]: v }))}
        />
      </div>
    </Modal>
  );
}
