import { useEffect, useState } from "react";
import { Modal, Table, Empty, message } from "antd";
import { TableOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBaoCao, thueBaoCaoDonVi, loiApi } from "../api";
import type { ChiTieuTongHop } from "../api";
import "./bang-tong-hop.css";

// ============ BẢNG TỔNG HỢP CHỈ TIÊU KÊ KHAI — FRM_BC_THUE tab "Bảng tổng Hợp" ============
//
// Dựng lại đúng bảng của form VFP (ảnh 15/08): 15 dòng chỉ tiêu 1…8 kèm dòng con
// 2a–2d và 3a–3c, hai cột số "D.Thu Chưa có VAT" và "Thuế GTGT".
//
// SỐ LẤY THẲNG TỪ SERVER (ThueService.TinhTongHop) — KHÔNG cộng lại ở đây. Đây là số
// đi vào tờ khai thuế, phải có MỘT chỗ định nghĩa công thức; frontend cộng lại thì
// mai này thêm màn khác là có hai công thức song song, lệch nhau lúc nào không biết.
//
// Đối chiếu công thức với ảnh form gốc: dòng 8 = dòng 2 − dòng 4
//   4.257.738.117 − 753.548.192 = 3.504.189.925 ✓ khớp

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COT: ColumnsType<ChiTieuTongHop> = [
  { title: "STT", dataIndex: "stt", width: 60, align: "center" },
  { title: "Chỉ tiêu kê khai", dataIndex: "chiTieu" },
  { title: "D.Thu Chưa có VAT", dataIndex: "doanhThuChuaVat", width: 190,
    align: "right", render: (v: number | null) => tien(v) },
  { title: "Thuế GTGT", dataIndex: "thueGtgt", width: 190, align: "right",
    render: (v: number | null) => tien(v) },
];

interface Props {
  mo: boolean;
  onDong: () => void;
  /** Rỗng = đơn vị đang đăng nhập; có mã = MDN_NB soi đơn vị khác. */
  maDonVi: string;
  tenDonVi?: string | null;
  nam: number;
  thang: number;
}

export default function BangTongHop(
  { mo, onDong, maDonVi, tenDonVi, nam, thang }: Props) {

  const [ds, setDs] = useState<ChiTieuTongHop[]>([]);
  const [tai, setTai] = useState(false);

  useEffect(() => {
    if (!mo) return;
    const id = setTimeout(() => {
      setTai(true);
      (maDonVi ? thueBaoCaoDonVi(maDonVi, nam, thang) : thueBaoCao(thang))
        .then((r) => setDs(r.data.tongHop ?? []))
        .catch((e) => {
          setDs([]);
          message.error(loiApi(e, "Không đọc được bảng tổng hợp"));
        })
        .finally(() => setTai(false));
    }, 0);
    return () => clearTimeout(id);
  }, [mo, maDonVi, nam, thang]);

  return (
    <Modal
      title={
        <span>
          <TableOutlined style={{ marginRight: 8 }} />
          Bảng tổng hợp
          {maDonVi && <> — <b>{maDonVi}</b></>}
          {tenDonVi && <span className="bth-ten"> · {tenDonVi}</span>}
          <span className="bth-ky"> · kỳ {String(thang).padStart(2, "0")}/{nam}</span>
        </span>
      }
      open={mo}
      onCancel={onDong}
      footer={null}
      width={900}
      style={{ top: 24 }}
      styles={{ body: { padding: 12 } }}
    >
      <Table<ChiTieuTongHop>
        className="bth-bang"
        size="small"
        rowKey="stt"
        dataSource={ds}
        columns={COT}
        loading={tai}
        pagination={false}
        // Chỉ tiêu CHÍNH (1, 2, 3, 4…) in đậm đỏ như bản VFP để mắt tách ngay khỏi
        // dòng con 2a/2b/3c — bản gốc cũng phân biệt đúng bằng màu này.
        rowClassName={(m) => m.laDongChinh ? "bth-chinh" : ""}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Kỳ này chưa có số liệu" /> }}
      />
    </Modal>
  );
}
