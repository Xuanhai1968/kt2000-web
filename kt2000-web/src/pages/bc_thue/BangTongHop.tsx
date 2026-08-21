import { useEffect, useState } from "react";
import { Modal, Table, Empty, message } from "antd";
import { TableOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBaoCao, thueBaoCaoDonVi, loiApi } from "../../api";
import type { ChiTieuTongHop } from "../../api";
import "./bang-tong-hop.css";

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

        rowClassName={(m) => m.laDongChinh ? "bth-chinh" : ""}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Kỳ này chưa có số liệu" /> }}
      />
    </Modal>
  );
}
