"""Quét kho SCAN_DOC, đọc XML TỜ KHAI GỐC của mọi đơn vị rồi nạp vào bảng TOKHAI.

Nguồn : \\\\Server-test\\scan_doc\\<MÃ_ĐƠN_VỊ>\\NAM<năm>\\TO_KHAI\\TO_KHAI_GOC\\
        TKG_T<tháng>_<năm>\\<MST>000-01_GTGT_TT80-M<MMyyyy>-L<lần>.xml
Đích  : KT2000_Base.dbo.TOKHAI

Đây là NGUỒN CHUẨN NHẤT: file XML do chính HTKK sinh và đã nộp lên cổng, không phải
số gõ tay hay khuôn Excel trung gian.

CÁCH CHẠY
    python tools/nap_tokhai_xml.py --thu     # chỉ đọc và in, KHÔNG ghi
    python tools/nap_tokhai_xml.py           # nạp thật
    python tools/nap_tokhai_xml.py --nam 2026

AN TOÀN
  * UPSERT theo khóa (ma_donvi, ky_kekhai, lan_nop) — chạy lại không đẻ bản trùng.
  * CHỈ ghi bảng TOKHAI ở Base; không đụng sổ hóa đơn của đơn vị nào.
  * Đơn vị không có thư mục TO_KHAI_GOC, hoặc có thư mục mà không có XML tờ khai
    (HUYEN_LINH chỉ có bảng kê Excel) → BỎ QUA và báo ở cuối, không đoán.

VÌ SAO KHỚP THEO MST TRONG FILE, không theo tên thư mục: tên thư mục do người đặt,
đổi lúc nào không biết; MST nằm trong chính tờ khai nên chắc chắn đúng chủ. Tên thư
mục chỉ dùng để BIẾT chỗ mà đi tìm.
"""
import os
import re
import sys
import glob
import xml.etree.ElementTree as ET

import pyodbc

GOC = r"\\Server-test\scan_doc"

CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=192.168.0.106\\SQLEXPRESS,1433;DATABASE=KT2000_Base;"
        "UID=sa;PWD=Ngocdiep@@2026;TrustServerCertificate=yes")

# Chỉ tiêu tờ khai: thẻ trong XML → cột SQL.
# XML gọi ct39a, bảng TOKHAI đặt tên ct39_nnt theo khuôn Excel — ánh xạ ở đây.
CT = {
    "ct21": "ct21_nnt", "ct22": "ct22_nnt", "ct23": "ct23_nnt",
    "ct24": "ct24_nnt", "ct25": "ct25_nnt", "ct26": "ct26_nnt",
    "ct27": "ct27_nnt", "ct28": "ct28_nnt", "ct29": "ct29_nnt",
    "ct30": "ct30_nnt", "ct31": "ct31_nnt", "ct32": "ct32_nnt",
    "ct33": "ct33_nnt", "ct32a": "ct32a_nnt", "ct34": "ct34_nnt",
    "ct35": "ct35_nnt", "ct36": "ct36_nnt", "ct37": "ct37_nnt",
    "ct38": "ct38_nnt", "ct39a": "ct39_nnt", "ct40a": "ct40a_nnt",
    "ct40b": "ct40b_nnt", "ct40": "ct40_nnt", "ct41": "ct41_nnt",
    "ct42": "ct42_nnt", "ct43": "ct43_nnt",
}


def go_ns(t):
    """Bỏ namespace khỏi tên thẻ: '{http://...}ct43' -> 'ct43'."""
    return t.rsplit("}", 1)[-1]


def doc_to_khai(duong_dan):
    """Đọc một file XML tờ khai. Trả dict, hoặc None nếu không phải tờ khai 01/GTGT.

    Lấy thẻ trong khối CTieuTKhaiChinh — bản BỔ SUNG có thêm khối KHBSung lặp lại
    nhiều thẻ cùng tên, quét cả cây rồi lấy thẻ đầu là dính nhầm số của khối phụ.
    """
    try:
        cay = ET.parse(duong_dan).getroot()
    except ET.ParseError:
        return None

    nut = {}
    for e in cay.iter():
        ten = go_ns(e.tag)
        # Giữ lần gặp ĐẦU TIÊN của mỗi thẻ định danh; khối chính luôn đứng trước
        # khối bổ sung trong file HTKK.
        if ten not in nut and (e.text or "").strip():
            nut[ten] = e.text.strip()

    mst = nut.get("mst")
    ky = nut.get("kyKKhai", "")
    if not mst or "/" not in ky:
        return None

    thang_s, nam_s = ky.split("/", 1)
    if not (thang_s.isdigit() and nam_s.isdigit()):
        return None
    thang, nam = int(thang_s), int(nam_s)
    if not 1 <= thang <= 12:
        return None

    def so(ten):
        v = nut.get(ten)
        if v is None:
            return None
        try:
            return int(round(float(v)))
        except ValueError:
            return None

    d = {
        "mst_nnt": mst,
        "ky_kekhai": f"{thang:02d}/{nam}",
        "thang": thang,
        "nam": nam,
        "lan_nop": so("soLan") or 0,
        "ma_tk": nut.get("maTKhai"),
        "ten_tk": nut.get("tenTKhai"),
        "xml_ver": nut.get("pbanTKhaiXML"),
        "loai_tk": nut.get("loaiTKhai"),
        "ma_cct": nut.get("maCQTNoiNop"),
        "ten_cct": nut.get("tenCQTNoiNop"),
        "ten_nnt": nut.get("tenNNT"),
        "dia_chi_nnt": nut.get("dchiNNT"),
        "tinh_nnt": nut.get("tenTinhNNT"),
        "sdt_nnt": nut.get("dthoaiNNT"),
        "email_nnt": nut.get("emailNNT"),
        "ma_nganh_nnt": nut.get("ma_NganhNghe"),
        "ten_nganh_nnt": nut.get("ten_NganhNghe"),
        "tieu_muc_nnt": nut.get("tieuMucHachToan"),
        "xml_name": os.path.basename(duong_dan),
        "xml_path": duong_dan,
    }
    for the, cot in CT.items():
        d[cot] = so(the)
    return d


def main():
    thu = "--thu" in sys.argv
    nam = 2026
    if "--nam" in sys.argv:
        nam = int(sys.argv[sys.argv.index("--nam") + 1])

    if not os.path.isdir(GOC):
        print(f"KHÔNG mở được kho {GOC} — kiểm tra kết nối mạng.")
        return

    # MST → mã đơn vị, lấy từ Master. Khớp theo MST TRONG FILE chứ không theo tên
    # thư mục (xem chú thích đầu file). So phần SỐ vì cổng có thể khai chi nhánh
    # dạng '0100686174-634'.
    cn = pyodbc.connect(CONN.replace("DATABASE=KT2000_Base", "DATABASE=KT2000_Master"))
    theo_mst = {}
    for ma, mst in cn.cursor().execute(
            "SELECT Code, TaxCode FROM Tenants WHERE TaxCode IS NOT NULL"):
        theo_mst[re.split(r"-", (mst or "").strip())[0]] = ma
    cn.close()

    dong, bo = [], []
    for dv in sorted(os.listdir(GOC)):
        goc_tk = os.path.join(GOC, dv, f"NAM{nam}", "TO_KHAI", "TO_KHAI_GOC")
        if not os.path.isdir(goc_tk):
            continue

        # Quét CẢ THƯ MỤC CON: bản bổ sung nằm trong BSL1/, BSL2/…
        files = glob.glob(os.path.join(goc_tk, "**", "*.xml"), recursive=True)
        tk = [f for f in files if "_GTGT_TT80-" in os.path.basename(f)]
        if not tk:
            bo.append((dv, f"có thư mục nhưng không có XML tờ khai "
                           f"({len(files)} file .xml khác)"))
            continue

        # Sắp theo NGÀY SỬA rồi mới tới tên: cùng một kỳ có thể có NHIỀU file cùng
        # soLan (TUAN_NGA T1 có thêm thư mục SUA_LAI_TON_DAU\ chứa bản sửa lại tồn
        # đầu, vẫn soLan=0). Trùng khóa thì bản GHI SAU thắng, nên phải để file mới
        # nhất chạy sau cùng — sắp bừa là kết quả đổi theo thứ tự đọc thư mục.
        for f in sorted(tk, key=lambda x: (os.path.getmtime(x), x)):
            d = doc_to_khai(f)
            if d is None:
                bo.append((dv, f"không đọc được {os.path.basename(f)}"))
                continue
            ma = theo_mst.get(d["mst_nnt"])
            if not ma:
                bo.append((dv, f"MST {d['mst_nnt']} không có đơn vị nào trong Master"))
                continue
            d["ma_donvi"] = ma
            dong.append(d)

    print(f"Tìm thấy {len(dong)} tờ khai từ kho SCAN_DOC (năm {nam})")
    for dv, ly in bo:
        print(f"  bỏ {dv}: {ly}")

    if thu:
        print("\n--thu: KHÔNG ghi vào database. Danh sách:")
        for d in dong:
            bs = f" (bổ sung lần {d['lan_nop']})" if d["lan_nop"] else ""
            print(f"  {d['ma_donvi']:16} {d['ky_kekhai']}{bs}"
                  f"  ct22={d['ct22_nnt']:>15,}  ct43={d['ct43_nnt']:>15,}")
        return

    cot = (["ma_donvi", "ky_kekhai", "lan_nop", "thang", "nam", "ma_tk", "ten_tk",
            "xml_ver", "loai_tk", "ma_cct", "ten_cct", "mst_nnt", "ten_nnt",
            "dia_chi_nnt", "tinh_nnt", "sdt_nnt", "email_nnt", "ma_nganh_nnt",
            "ten_nganh_nnt", "tieu_muc_nnt", "xml_name", "xml_path"]
           + list(CT.values()))
    dat = ", ".join(f"{c} = ?" for c in cot[3:])
    sql = f"""
        MERGE TOKHAI AS t
        USING (SELECT ? AS ma_donvi, ? AS ky_kekhai, ? AS lan_nop) AS s
           ON t.ma_donvi = s.ma_donvi AND t.ky_kekhai = s.ky_kekhai
          AND t.lan_nop = s.lan_nop
        WHEN MATCHED THEN UPDATE SET {dat}, updated_by = 'nap_xml',
                                     updated_at = SYSDATETIME()
        WHEN NOT MATCHED THEN
            INSERT ({", ".join(cot)}, created_by)
            VALUES ({", ".join("?" for _ in cot)}, 'nap_xml');"""

    cn = pyodbc.connect(CONN, autocommit=False)
    cur = cn.cursor()
    for d in dong:
        khoa = [d["ma_donvi"], d["ky_kekhai"], d["lan_nop"]]
        conlai = [d.get(c) for c in cot[3:]]
        cur.execute(sql, khoa + conlai + khoa + conlai)
    cn.commit()

    cur.execute("SELECT COUNT(*) FROM TOKHAI")
    print(f"\nĐã nạp xong. Bảng TOKHAI hiện có {cur.fetchone()[0]} dòng.")
    cn.close()


if __name__ == "__main__":
    main()
