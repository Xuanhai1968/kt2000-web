import { Alert, Typography } from "antd";
import type { ToKhaiGtgt } from "../api";
import "./bang-to-khai.css";

// ============ TỜ KHAI 01/GTGT — BẢN IN CHUẨN HTKK ============
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
function O({ ma, gt }: { ma: string; gt?: number | null }) {
  return (
    <>
      <td className="o-ma">[{ma}]</td>
      <td className="o-gt">{gt == null ? "" : so(gt)}</td>
    </>
  );
}

export default function BangToKhai({ tk }: { tk: ToKhaiGtgt }) {
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
            <tr className="d-nhom">
              <td className="c-stt">A</td>
              <td>Không phát sinh hoạt động mua, bán trong kỳ (đánh dấu "X")</td>
              <td className="o-ma">[21]</td>
              <td className="o-gt">{tk.ct21 === 1 ? "X" : ""}</td>
              <td className="o-ma" />
              <td className="o-gt">[]</td>
            </tr>
            <tr className="d-nhom">
              <td className="c-stt">B</td>
              <td>Thuế giá trị gia tăng còn được khấu trừ kỳ trước chuyển sang</td>
              <td className="o-ma" /><td className="o-gt" />
              <O ma="22" gt={tk.ct22} />
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
              <O ma="23" gt={tk.ct23} />
              <O ma="24" gt={tk.ct24} />
            </tr>
            <tr>
              <td className="c-stt" />
              <td>Trong đó: hàng hóa, dịch vụ nhập khẩu</td>
              <O ma="23a" gt={tk.ct23a} />
              <O ma="24a" gt={tk.ct24a} />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td>Thuế giá trị gia tăng của hàng hóa, dịch vụ mua vào được khấu trừ kỳ này</td>
              <td className="o-ma" /><td className="o-gt" />
              <O ma="25" gt={tk.ct25} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">II</td>
              <td colSpan={5}>Hàng hoá, dịch vụ bán ra trong kỳ</td>
            </tr>
            <tr>
              <td className="c-stt">1</td>
              <td>Hàng hóa, dịch vụ bán ra không chịu thuế giá trị gia tăng</td>
              <O ma="26" gt={tk.ct26} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td>
                Hàng hóa, dịch vụ bán ra chịu thuế giá trị gia tăng
                <div className="ct-ct">([27]=[29]+[30]+[32]+[32a]; [28]=[31]+[33])</div>
              </td>
              <O ma="27" gt={tk.ct27} />
              <O ma="28" gt={tk.ct28} />
            </tr>
            <tr>
              <td className="c-stt">a</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 0%</td>
              <O ma="29" gt={tk.ct29} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">b</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 5%</td>
              <O ma="30" gt={tk.ct30} />
              <O ma="31" gt={tk.ct31} />
            </tr>
            <tr>
              <td className="c-stt">c</td>
              <td>Hàng hoá, dịch vụ bán ra chịu thuế suất 10%</td>
              <O ma="32" gt={tk.ct32} />
              <O ma="33" gt={tk.ct33} />
            </tr>
            <tr>
              <td className="c-stt">d</td>
              <td>Hàng hoá, dịch vụ bán ra không tính thuế</td>
              <O ma="32a" gt={tk.ct32a} />
              <td className="o-ma" /><td className="o-gt" />
            </tr>
            <tr>
              <td className="c-stt">3</td>
              <td>
                Tổng doanh thu và thuế giá trị gia tăng của hàng hóa, dịch vụ bán ra
                <div className="ct-ct">([34]=[26]+[27]; [35]=[28])</div>
              </td>
              <O ma="34" gt={tk.ct34} />
              <O ma="35" gt={tk.ct35} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">III</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng phát sinh trong kỳ ([36]=[35]-[25])
              </td>
              <O ma="36" gt={tk.ct36} />
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
              <O ma="37" gt={tk.ct37} />
            </tr>
            <tr>
              <td className="c-stt">2</td>
              <td colSpan={3}>Điều chỉnh tăng</td>
              <O ma="38" gt={tk.ct38} />
            </tr>

            <tr className="d-muc">
              <td className="c-stt">V</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng nhận bàn giao được khấu trừ trong kỳ
              </td>
              <O ma="39a" gt={tk.ct39a} />
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
              <O ma="40a" gt={tk.ct40a} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">2</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng mua vào của dự án đầu tư được bù trừ với thuế GTGT
                còn phải nộp của hoạt động sản xuất kinh doanh cùng kỳ tính thuế
                ([40b]≤[40a])
              </td>
              <O ma="40b" gt={tk.ct40b} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">3</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng còn phải nộp trong kỳ ([40]=[40a]-[40b])
              </td>
              <O ma="40" gt={tk.ct40} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">4</td>
              <td colSpan={3}>
                {"{[41]=([36]-[22]+[37]-[38]-[39a]) ≤ 0}"}
              </td>
              <O ma="41" gt={tk.ct41} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">4.1</td>
              <td colSpan={3}>Thuế giá trị gia tăng đề nghị hoàn ([42] ≤ [41])</td>
              <O ma="42" gt={tk.ct42} />
            </tr>
            <tr className="d-dam">
              <td className="c-stt">4.2</td>
              <td colSpan={3}>
                Thuế giá trị gia tăng còn được khấu trừ chuyển kỳ sau ([43]=[41]-[42])
              </td>
              <O ma="43" gt={tk.ct43} />
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
