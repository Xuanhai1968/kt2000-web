import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Select, Table, Tabs, Space, Button, Typography, message,
} from "antd";
import { AuditOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import ModalRaSoat from "./ModalRaSoat";
import { thueBaoCao, loiApi } from "../api";
import type { BaoCaoThue as BaoCaoThueDto, BangKeHoaDon, ChiTieuTongHop } from "../api";
import { useAuth } from "../AuthContext";
import "./bao-cao-thue.css";

// ============ BÁO CÁO THUẾ GTGT — FRM_BC_THUE ============
// Dựng lại form "Báo cáo thuế GTGT" của KT2000 VFP: thanh lọc kỳ trên cùng, ba
// tab nghiệp vụ, bảng chiếm gần hết màn, thanh tổng hồng dưới đáy.
//
// Dùng Table của antd chứ KHÔNG dùng AG Grid: AG Grid cần chiều cao tường minh từ
// khối cha, mà ở màn này khối cha nằm sau một chuỗi dài (Layout.Content → trang →
// tab), đứt một mắt là lưới cao 0 và mất cả header cột. Table của antd tự dựng
// theo nội dung, chỉ cần khai scroll.y là cuộn trong lòng nó — chắc chắn hơn hẳn.
//
// Nguồn dữ liệu: MỘT lời gọi /thue/bao-cao trả về cả ba bảng (mua vào, bán ra,
// tổng hợp). Gọi một lần cho cả màn thay vì mỗi tab một request — ba bảng đều
// tính từ cùng tập hóa đơn của kỳ đó, tách ra thì vừa chậm vừa có nguy cơ ba tab
// nói ba con số khác nhau nếu ai đó nạp hóa đơn xen giữa.
//
// Bảng tổng hợp KHÔNG cộng ở đây mà lấy thẳng số server tính: đó là số đi vào tờ
// khai thuế, phải có một chỗ định nghĩa công thức (xem ThueService.TinhTongHop).

const CAC_THANG = Array.from({ length: 12 }, (_, i) => i + 1);

// Tiền kiểu VFP: dấu . ngăn nghìn, dấu , ngăn phần lẻ, luôn 2 số lẻ.
const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
};

// Cột chung cho hai bảng kê. Khác nhau đúng một chữ: "Người bán" (mua vào) vs
// "Người mua" (bán ra). Để ngoài component vì không dùng state nào.
const cotBangKe = (vaiTro: string): ColumnsType<BangKeHoaDon> => [
  { title: "STT", dataIndex: "stt", width: 56, fixed: "left", align: "right" },
  { title: "KH HĐ", dataIndex: "khHd", width: 90 },
  { title: "Số HĐ", dataIndex: "soHd", width: 90 },
  { title: "Ngày", dataIndex: "ngay", width: 86,
    render: (v: string | null) => ngayNgan(v) },
  { title: `Tên ${vaiTro}`, dataIndex: "tenDoiTac", width: 300, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: `MST ${vaiTro}`, dataIndex: "mstDoiTac", width: 130 },
  { title: "Mặt hàng", dataIndex: "matHang", width: 240, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "D.Thu Chưa thuế", dataIndex: "doanhThuChuaVat", width: 150,
    align: "right", render: (v: number) => tien(v) },
  // Thuế suất để trống khi HĐ không khai vat — không bịa thành 0%
  { title: "TS", dataIndex: "thueSuat", width: 56, align: "right",
    render: (v: number | null) => v == null ? "" : String(v) },
  { title: "Thuế GTGT", dataIndex: "thueGtgt", width: 140, align: "right",
    render: (v: number) => tien(v) },
  { title: "Ghi chú", dataIndex: "ghiChu", width: 200, ellipsis: true },
];

const COT_VAO = cotBangKe("Người bán");
const COT_RA = cotBangKe("Người mua");

const COT_TONG_HOP: ColumnsType<ChiTieuTongHop> = [
  { title: "STT", dataIndex: "stt", width: 70 },
  { title: "Chỉ tiêu kê khai", dataIndex: "chiTieu" },
  { title: "D.Thu Chưa có VAT", dataIndex: "doanhThuChuaVat", width: 200,
    align: "right", render: (v: number | null) => tien(v) },
  { title: "Thuế GTGT", dataIndex: "thueGtgt", width: 200, align: "right",
    render: (v: number | null) => tien(v) },
];

export default function BaoCaoThue() {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();

  // Mặc định tháng hiện tại nếu nó nằm trong năm làm việc, không thì tháng 1 —
  // mở màn ra là thấy ngay kỳ đang làm, khỏi phải chọn.
  const thangMacDinh = new Date().getFullYear() === namLamViec
    ? new Date().getMonth() + 1 : 1;
  const [thang, setThang] = useState<number | "all">(thangMacDinh);
  const [tab, setTab] = useState("vao");
  const [moRaSoat, setMoRaSoat] = useState(false);

  const [bc, setBc] = useState<BaoCaoThueDto | null>(null);
  const [tai, setTai] = useState(true);

  // Chặn kết quả CŨ ghi đè kết quả mới: đổi tháng nhanh tay thì request trước có
  // thể về sau request sau. Đếm lượt gọi, chỉ nhận lượt mới nhất.
  const luotRef = useRef(0);

  const nap = async () => {
    const luot = ++luotRef.current;
    setTai(true);
    try {
      const r = await thueBaoCao(thang === "all" ? undefined : thang);
      if (luot !== luotRef.current) return;   // đã có lượt mới hơn
      setBc(r.data);
    } catch (e) {
      if (luot !== luotRef.current) return;
      setBc(null);
      message.error(loiApi(e, "Không đọc được báo cáo thuế"));
    } finally {
      if (luot === luotRef.current) setTai(false);
    }
  };

  // setTimeout 0 chứ không gọi nap() thẳng: nap() có setTai(true) chạy ĐỒNG BỘ
  // ngay trong thân effect, React coi đó là cascading render (react-hooks/
  // set-state-in-effect). Đẩy sang lượt sau thì effect chỉ còn việc khởi động.
  useEffect(() => {
    const id = setTimeout(() => void nap(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tenant.id, namLamViec, thang]);

  // Tổng ở thanh đáy đổi theo TAB đang xem — bản gốc cũng vậy: đang xem bảng kê
  // nào thì thấy tổng của bảng đó.
  const tongDangXem = useMemo(() => {
    const ds = tab === "ra" ? bc?.banRa : bc?.muaVao;
    if (!ds) return { dt: 0, thue: 0, soHd: 0 };
    return {
      dt: ds.reduce((s, x) => s + x.doanhThuChuaVat, 0),
      thue: ds.reduce((s, x) => s + x.thueGtgt, 0),
      soHd: ds.length,
    };
  }, [bc, tab]);

  const nhanKy = thang === "all" ? `cả năm ${namLamViec}`
                                 : `tháng ${thang}/${namLamViec}`;

  // Bảng cuộn trong lòng nó, không đẩy dài cả trang. Trừ chỗ cho thanh lọc, dải
  // tab, thanh đáy và khung ngoài của AppShell.
  //
  // PHẢI KHỚP với height của .ant-table-body trong bao-cao-thue.css — chỗ đó ép
  // chiều cao CỐ ĐỊNH để khung không co theo số dòng. Sửa một bên thì sửa cả hai.
  // Trừ: thanh tiêu đề app, padding trang, đầu Card, dải tab, thanh tổng dưới.
  const CAO_BANG = "calc(100vh - 280px)";

  // Dòng TỔNG nằm TRONG bảng (Table.Summary) chứ không phải khối riêng bên dưới:
  // chỉ có cách này số tổng mới thẳng cột tuyệt đối với cột dữ liệu, và antd tự
  // ghim nó ở đáy khi cuộn. Trước để Statistic rời bên ngoài nên số nằm lệch hẳn
  // so với cột "D.Thu Chưa thuế" / "Thuế GTGT" mà nó đang cộng.
  //
  // Vị trí ô phải khớp thứ tự cột trong cotBangKe: 0=STT … 7=D.Thu, 8=TS, 9=Thuế.
  const bangKe = (ds: BangKeHoaDon[] | undefined, cot: ColumnsType<BangKeHoaDon>,
                  nhan: string) => (
    <Table<BangKeHoaDon>
      className="bang-bc"
      size="small"
      rowKey="maHd"
      dataSource={ds ?? []}
      columns={cot}
      loading={tai}
      pagination={false}
      scroll={{ x: 1450, y: CAO_BANG }}
      locale={{ emptyText: `Kỳ này chưa có hóa đơn ${nhan}` }}
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row className="dong-tong">
            <Table.Summary.Cell index={0} colSpan={7}>
              Tổng {tab === "ra" ? "bán ra" : "mua vào"} {nhanKy} —{" "}
              <b>{tongDangXem.soHd}</b> hóa đơn
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              {tien(tongDangXem.dt)}
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} />
            <Table.Summary.Cell index={9} align="right">
              {tien(tongDangXem.thue)}
            </Table.Summary.Cell>
            <Table.Summary.Cell index={10} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  );

  // Thanh lọc kỳ nằm ở `extra` của Card — đúng chỗ antd dành cho thao tác của khối.
  const thanhLoc = (
    <Space size={12} wrap>
      <Space size={8}>
        <Typography.Text type="secondary">Tháng</Typography.Text>
        {/* "Tất cả các tháng" = gộp cả năm làm việc. Dùng đúng chữ như ô lọc bên
            màn Danh sách hóa đơn để hai chỗ không gọi một thứ bằng hai tên. */}
        <Select style={{ width: 170 }} value={thang}
                onChange={(v) => setThang(v)}
                options={[
                  { value: "all" as const, label: "Tất cả" },
                  ...CAC_THANG.map((m) => ({ value: m, label: `Tháng ${m}` })),
                ]} />
      </Space>
      {/* Rà soát: đối chiếu file XML với sổ trước khi nộp tờ khai. CHỈ XEM,
          không ghi gì vào sổ. */}
      <Button icon={<AuditOutlined />} onClick={() => setMoRaSoat(true)}>
        Rà soát
      </Button>
    </Space>
  );

  return (
    <Card
      className="bc-thue"
      title="Báo cáo thuế GTGT"
      extra={thanhLoc}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* Tabs chuẩn antd. Trước đây tự dựng dải nút vì bảng AG Grid cần chiều cao
          tường minh mà Tabs làm đứt chuỗi; nay bảng là Table của antd, tự cuộn
          bằng scroll.y nên dùng Tabs được bình thường.
          destroyOnHidden: chỉ giữ bảng của tab đang xem trong DOM. */}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          {
            key: "vao",
            label: "Hoá đơn mua Vào",
            children: bangKe(bc?.muaVao, COT_VAO, "mua vào"),
          },
          {
            key: "ra",
            label: "Hoá đơn bán Ra",
            children: bangKe(bc?.banRa, COT_RA, "bán ra"),
          },
          {
            key: "tonghop",
            label: "Bảng tổng Hợp",
            children: (
              <Table<ChiTieuTongHop>
                className="bang-bc bang-tong-hop"
                size="small"
                rowKey="stt"
                dataSource={bc?.tongHop ?? []}
                columns={COT_TONG_HOP}
                loading={tai}
                pagination={false}
                scroll={{ y: CAO_BANG }}
                // Chỉ tiêu CHÍNH của tờ khai (1, 2, 3...) in đậm để mắt tách ngay
                // với dòng con 2a/2b/3c.
                rowClassName={(m) => m.laDongChinh ? "dong-chi-tieu-chinh" : ""}
                locale={{ emptyText: "Chưa có số liệu" }}
              />
            ),
          },
        ]}
      />

      <ModalRaSoat
        mo={moRaSoat}
        onDong={() => setMoRaSoat(false)}
        thang={thang === "all" ? undefined : thang}
        nhanKy={nhanKy}
      />
    </Card>
  );
}
