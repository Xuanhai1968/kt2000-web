// BA MODAL PHỤ của màn đánh đơn: thêm nhanh mặt hàng (F2), thêm nhanh đối tượng (F2),
// tra tên hàng bên sổ thuế (Ctrl+T).
//
// GHI CHÚ TRÙNG LẶP (đọc trước khi sửa):
// Ba modal này gần như y hệt ModalThemHang / ModalThemKh / ModalTraThue trong
// ../PhieuXuatNhap.tsx. Chúng thuần NGHIỆP VỤ NB (BR-NB-01/02/03), không mang nét giao
// diện nào của USA_Meva — tức là phần ĐÁNG GỘP, không phải phần đáng nhân đôi.
// Bước 2 của việc port (rà phần trùng với ../) sẽ tách chúng ra một file dùng chung cho
// cả hai form rồi xóa bản này. Trong lúc đó KHÔNG sửa một bên mà quên bên kia.
//
// Gói cả ba vào MỘT component <ModalPhu> để chỗ gọi bên PhieuDanhDonUsa.tsx chỉ có một
// thẻ: lúc tách ra dùng chung chỉ phải đổi đúng một dòng import.

import { useCallback, useEffect, useState } from "react";
import {
  Modal, Input, InputNumber, Row, Col, Radio, Table, Button, Tag, Typography,
  Empty, message,
} from "antd";
import { nbLuuHang, nbLuuKh, nbTraHangThue, loiApi } from "../../api";
import type { DmHangNb, DmKhNb, LoaiDoiTuong, TraHangThue } from "../../api";

// ============================ THÊM NHANH MẶT HÀNG (F2) ============================
function ModalThemHang({ mo, tenGoiY, truongGia, onDong, onXong }: {
  mo: boolean;
  tenGoiY: string;
  truongGia: "giaBan" | "giaMua";
  onDong: () => void;
  onXong: (h: DmHangNb) => void;
}) {
  // Không cần effect dọn form mỗi lần mở: chỗ gọi truyền key={...} nên mỗi lần mở là
  // một component mới hoàn toàn, state khởi tạo lại từ đầu.
  const [ten, setTen] = useState(tenGoiY);
  const [dvt, setDvt] = useState("");
  const [gia, setGia] = useState(0);
  const [vat, setVat] = useState(0);
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async () => {
    if (!ten.trim()) { message.warning("Chưa nhập tên hàng"); return; }
    setDangLuu(true);
    try {
      const r = await nbLuuHang({
        tenHang: ten.trim(),
        dvt: dvt.trim() || null,
        [truongGia]: gia,
        ptVat: vat,
      } as Partial<DmHangNb>);
      message.success(`Đã thêm mặt hàng ${r.data.maHang}`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được mặt hàng"));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal title="Thêm nhanh mặt hàng (F2)" open={mo} onCancel={onDong} onOk={luu}
           okText="Lưu" cancelText="Thôi" confirmLoading={dangLuu} width={520}>
      <div className="umv__nhan">Tên hàng</div>
      <Input autoFocus value={ten} onChange={(e) => setTen(e.target.value)} onPressEnter={luu} />
      <Row gutter={10} style={{ marginTop: 10 }}>
        <Col span={8}>
          <div className="umv__nhan">ĐVT</div>
          <Input value={dvt} onChange={(e) => setDvt(e.target.value)} onPressEnter={luu} />
        </Col>
        <Col span={10}>
          <div className="umv__nhan">{truongGia === "giaBan" ? "Giá bán" : "Giá mua"}</div>
          <InputNumber style={{ width: "100%" }} value={gia} min={0} controls={false}
                       onChange={(v) => setGia(Number(v) || 0)}
                       formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                       parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
        </Col>
        <Col span={6}>
          <div className="umv__nhan">%VAT</div>
          <InputNumber style={{ width: "100%" }} value={vat} min={0} max={100}
                       controls={false} onChange={(v) => setVat(Number(v) || 0)} />
        </Col>
      </Row>
    </Modal>
  );
}

// ============================ THÊM NHANH ĐỐI TƯỢNG (F2) ============================
// BR-NB-01: một danh mục cho cả khách lẫn nhân viên -> modal có ô chọn LOẠI.
// Thêm được cả nhân viên ngay tại đây, khỏi bỏ dở đơn đi mở màn danh mục.
function ModalThemKh({ mo, tenGoiY, nhan, onDong, onXong }: {
  mo: boolean;
  tenGoiY: string;
  nhan: string;
  onDong: () => void;
  onXong: (k: DmKhNb) => void;
}) {
  const [ten, setTen] = useState(tenGoiY);
  const [loaiDt, setLoaiDt] = useState<LoaiDoiTuong>("KH");
  const [tenGiaoDich, setTenGiaoDich] = useState("");
  const [mst, setMst] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [diaChiGiao, setDiaChiGiao] = useState("");
  const [dienThoai, setDienThoai] = useState("");
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async () => {
    if (!ten.trim()) { message.warning("Chưa nhập tên"); return; }
    setDangLuu(true);
    try {
      const r = await nbLuuKh({
        tenKh: ten.trim(),
        loaiDt,
        tenGiaoDich: tenGiaoDich.trim() || null,
        mst: mst.trim() || null,
        diaChi: diaChi.trim() || null,
        diaChiGiao: diaChiGiao.trim() || null,
        dienThoai: dienThoai.trim() || null,
      });
      message.success(`Đã thêm ${r.data.maKh}`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được"));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal title={`Thêm nhanh ${nhan.toLowerCase()} (F2)`} open={mo} onCancel={onDong}
           onOk={luu} okText="Lưu" cancelText="Thôi" confirmLoading={dangLuu} width={560}>
      <div className="umv__nhan">Loại đối tượng</div>
      <Radio.Group value={loaiDt} onChange={(e) => setLoaiDt(e.target.value)}
                   optionType="button" buttonStyle="solid">
        <Radio.Button value="KH">Khách hàng</Radio.Button>
        <Radio.Button value="NV">Nhân viên</Radio.Button>
      </Radio.Group>

      <div className="umv__nhan" style={{ marginTop: 10 }}>Tên</div>
      <Input autoFocus value={ten} onChange={(e) => setTen(e.target.value)} onPressEnter={luu} />

      {loaiDt === "KH" && (
        <>
          {/* BR-NB-01: tên phục vụ NGƯỜI GIAO HÀNG, được phép khác tên trên hóa đơn VAT */}
          <div className="umv__nhan" style={{ marginTop: 10 }}>
            Tên giao dịch <span style={{ fontWeight: 400 }}>(tên người giao hàng hay gọi)</span>
          </div>
          <Input value={tenGiaoDich} onChange={(e) => setTenGiaoDich(e.target.value)}
                 placeholder="vd: Chị Kim chợ đầu mối" onPressEnter={luu} />
        </>
      )}

      <Row gutter={10} style={{ marginTop: 10 }}>
        {loaiDt === "KH" && (
          <Col span={12}>
            <div className="umv__nhan">MST</div>
            <Input value={mst} onChange={(e) => setMst(e.target.value)} onPressEnter={luu} />
          </Col>
        )}
        <Col span={loaiDt === "KH" ? 12 : 24}>
          <div className="umv__nhan">Điện thoại</div>
          <Input value={dienThoai} onChange={(e) => setDienThoai(e.target.value)} onPressEnter={luu} />
        </Col>
      </Row>

      <div className="umv__nhan" style={{ marginTop: 10 }}>Địa chỉ</div>
      <Input value={diaChi} onChange={(e) => setDiaChi(e.target.value)} onPressEnter={luu} />

      {loaiDt === "KH" && (
        <>
          {/* Địa chỉ GIAO khác địa chỉ trên hóa đơn: cái này để người giao tìm đường */}
          <div className="umv__nhan" style={{ marginTop: 10 }}>Địa chỉ giao hàng</div>
          <Input value={diaChiGiao} onChange={(e) => setDiaChiGiao(e.target.value)}
                 placeholder="Để trống nếu giao đúng địa chỉ trên" onPressEnter={luu} />
        </>
      )}
    </Modal>
  );
}

// ============================ TRA TÊN HÀNG BÊN SỔ THUẾ (Ctrl+T) ============================
// BR-NB-03 — một cửa, chỉ đọc, hai nguồn:
//   "đã có mã"    (nguồn A) = dòng HOA_DON_LINE hướng VAO đã được gán ma_hang
//   "tên trên HĐ" (nguồn B) = ten_hang_goc chưa gán mã (hàng mới mua chưa kịp làm kho)
//
// BR-NB-02: chọn một dòng ở đây = CHÉP về DM_HANG_NB (tạo bản ghi mới, giữ vết bằng
// maHangThue), KHÔNG tham chiếu sống. Bên thuế dọn mã về sau không làm biến hình đơn cũ.
function ModalTraThue({ mo, tuGoiY, onDong, onXong }: {
  mo: boolean;
  tuGoiY: string;
  onDong: () => void;
  onXong: (h: DmHangNb) => void;
}) {
  const [tu, setTu] = useState(tuGoiY);
  const [ds, setDs] = useState<TraHangThue[]>([]);
  const [tai, setTai] = useState(false);
  const [dangChep, setDangChep] = useState<string | null>(null);

  const tra = useCallback(async (kw: string) => {
    setTai(true);
    try {
      const r = await nbTraHangThue(kw, 100);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không tra được sổ thuế"));
      setDs([]);
    } finally {
      setTai(false);
    }
  }, []);

  // Mở modal là tra luôn với chữ đang gõ dở trên ô hàng — khỏi gõ lại.
  // Hoãn sang microtask: gọi thẳng trong thân effect thì setTai(true) chạy đồng bộ ngay
  // trong lượt render, sinh render dây chuyền.
  useEffect(() => {
    if (!mo) return;
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void tra(tuGoiY); });
    return () => { huy = true; };
  }, [mo, tuGoiY, tra]);

  const chep = async (h: TraHangThue) => {
    setDangChep(h.tenHang);
    try {
      const r = await nbLuuHang({
        tenHang: h.tenHang,
        dvt: h.dvt,
        maNgan: h.maNgan,
        maHangThue: h.maHang,   // giữ vết nguồn gốc bên sổ thuế (BR-NB-02)
      });
      message.success(`Đã chép "${h.tenHang}" về danh mục (${r.data.maHang})`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không chép được mặt hàng"));
    } finally {
      setDangChep(null);
    }
  };

  return (
    <Modal title="Tra tên hàng bên sổ thuế (Ctrl+T)" open={mo} onCancel={onDong}
           footer={null} width={860}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Chọn một dòng để <b>chép</b> mặt hàng về danh mục nội bộ. Danh mục của đơn vị mình
        vẫn là bản chính — sổ thuế chỉ dùng để tra tên.
      </Typography.Text>
      <Input.Search autoFocus placeholder="Gõ tên hàng cần tìm" value={tu} allowClear
                    onChange={(e) => setTu(e.target.value)} onSearch={(v) => tra(v)}
                    style={{ marginTop: 10, marginBottom: 10 }} />
      <Table<TraHangThue>
        rowKey={(r) => `${r.nguon}-${r.maHang ?? ""}-${r.tenHang}-${r.nam}`}
        size="small" loading={tai} dataSource={ds} pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="Không tìm thấy trong sổ thuế" /> }}
        columns={[
          { title: "Tên hàng", dataIndex: "tenHang", ellipsis: true },
          { title: "ĐVT", dataIndex: "dvt", width: 80 },
          {
            title: "Nguồn", dataIndex: "nguon", width: 130,
            render: (v: string) => v === "da_co_ma"
              ? <Tag color="green">đã có mã</Tag>
              : <Tag>tên trên HĐ</Tag>,
          },
          { title: "Năm", dataIndex: "nam", width: 70 },
          {
            title: "", width: 90,
            render: (_: unknown, r: TraHangThue) => (
              <Button size="small" type="link" loading={dangChep === r.tenHang}
                      onClick={() => chep(r)}>Chép về</Button>
            ),
          },
        ]}
      />
    </Modal>
  );
}

// ============================ GÓI CHUNG ============================
export default function ModalPhu({
  themHang, setThemHang, themKh, setThemKh, traThue, setTraThue,
  truongGia, nhanDoiTac, onChonHang, onChonKh,
}: {
  themHang: { dongId: number; ten: string } | null;
  setThemHang: (v: null) => void;
  themKh: { ten: string } | null;
  setThemKh: (v: null) => void;
  traThue: { dongId: number; ten: string } | null;
  setTraThue: (v: null) => void;
  truongGia: "giaBan" | "giaMua";
  nhanDoiTac: string;
  giaTuDanhMuc: (h: DmHangNb) => number;
  onChonHang: (dongId: number, h: DmHangNb) => void;
  onChonKh: (k: DmKhNb) => void;
}) {
  return (
    <>
      {/* key đổi theo lần mở -> remount, form luôn sạch (thay cho effect dọn state) */}
      <ModalThemHang
        key={themHang ? `hang-${themHang.dongId}-${themHang.ten}` : "hang-dong"}
        mo={!!themHang}
        tenGoiY={themHang?.ten ?? ""}
        truongGia={truongGia}
        onDong={() => setThemHang(null)}
        onXong={(h) => {
          if (themHang && h.maHang) onChonHang(themHang.dongId, h);
          setThemHang(null);
        }}
      />

      <ModalThemKh
        key={themKh ? `kh-${themKh.ten}` : "kh-dong"}
        mo={!!themKh}
        tenGoiY={themKh?.ten ?? ""}
        nhan={nhanDoiTac}
        onDong={() => setThemKh(null)}
        onXong={(k) => { if (k.maKh) onChonKh(k); setThemKh(null); }}
      />

      <ModalTraThue
        key={traThue ? `thue-${traThue.dongId}-${traThue.ten}` : "thue-dong"}
        mo={!!traThue}
        tuGoiY={traThue?.ten ?? ""}
        onDong={() => setTraThue(null)}
        onXong={(h) => {
          if (traThue && h.maHang) onChonHang(traThue.dongId, h);
          setTraThue(null);
        }}
      />
    </>
  );
}
