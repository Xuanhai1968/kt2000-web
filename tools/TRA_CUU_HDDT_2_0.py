import dbf
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import StaleElementReferenceException
import time
import tempfile
import io
import sys
import json
import datetime
import argparse
import zipfile
import threading
import queue
import xml.etree.ElementTree as ET
import pandas as pd
import openpyxl
from PIL import Image, ImageOps
import ddddocr
import logging
import os
import requests
import shutil
import pythoncom
import win32com.server.register
import calendar
import re
import unicodedata
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')    ##errors='replace' đảm bảo không bao giờ vỡ — ký tự lạ thành ?.
# Cấu hình log
logging.basicConfig(
    filename=r'C:\test\com_server_error.log',
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# =========================
# RUN LOG + HEARTBEAT HELPERS
# =========================
def ensure_parent_dir(path):
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)

def append_run_log(log_path, message):
    try:
        ensure_parent_dir(log_path)
        ts = datetime.datetime.now().isoformat(timespec="seconds")
        with open(log_path, "a", encoding="utf-8", errors="replace") as f:
            f.write(f"[{ts}] {message}\n")
            f.flush()
            os.fsync(f.fileno())
    except Exception:
        pass

def short_exc(e):
    try:
        return f"{type(e).__name__}: {e}"
    except Exception:
        return str(e)

# =========================
# STATUS + EVENTS (NEW)
# =========================
class StatusWriter:
    def __init__(self, path):
        self.path = path

    def write(self, data):
        data["updated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        for i in range(5):
            try:
                os.replace(tmp, self.path)
                return
            except PermissionError:
                time.sleep(0.5)
        os.replace(tmp, self.path)


class EventWriter:
    def __init__(self, path):
        self.path = path

    def log(self, event, **kwargs):
        data = {
            "ts": datetime.datetime.now().isoformat(timespec="seconds"),
            "event": event,
            **kwargs
        }
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")
def make_job_paths(base_dir, job_id, MA_DONVI):
    # job_dir = os.path.join(base_dir, MA_DONVI, job_id)
    # Va #7a: chen tang NAM<nam> (doc nam tu job_id dang T{m}_{yyyy}_...)
    m_nam = re.search(r'_(20\d{2})_', str(job_id) + "_")
    nam_dir = f"NAM{m_nam.group(1)}" if m_nam else ""
    job_dir = os.path.join(base_dir, MA_DONVI, nam_dir, job_id)
    paths = {
        "job_id": job_id,
        "job_dir": job_dir,
        "status": os.path.join(job_dir, "status.json"),
        "events": os.path.join(job_dir, "events.jsonl"),
        "run_log": os.path.join(job_dir, "run.log"),
        "stage_dir": os.path.join(job_dir, "stage"),
        "output_dir": os.path.join(job_dir, "outputs"),
        "raw_dir": os.path.join(job_dir, "raw"),
    }

    dir_keys = {"job_dir", "stage_dir", "output_dir", "raw_dir"}
    file_keys = {"status", "events", "run_log"}

    for k in dir_keys:
        os.makedirs(paths[k], exist_ok=True)

    for k in file_keys:
        os.makedirs(os.path.dirname(paths[k]), exist_ok=True)

    return paths
# def make_job_paths(base_dir, job_id,MA_DONVI):
#     job_dir = os.path.join(base_dir,MA_DONVI, job_id)

#     paths = {
#         "job_id": job_id,
#         "job_dir": job_dir,
#         "status": os.path.join(job_dir, "status.json"),
#         "events": os.path.join(job_dir, "events.jsonl"),
#         "run_log": os.path.join(job_dir, "run.log"),
#         "stage_dir": os.path.join(job_dir, "stage"),
#         "output_dir": os.path.join(job_dir, "outputs"),
#         "raw_dir": os.path.join(job_dir, "raw"),
#     }
#     # paths = {
#     #     "job_id": job_id,
#     #     "job_dir": job_dir,
#     #     "status": os.path.join(job_dir, "status.json"),
#     #     "events": os.path.join(job_dir, "events.jsonl"),
#     #     "stage_dir": os.path.join(job_dir, "stage"),
#     #     "output_dir": os.path.join(job_dir, "outputs"),
#     #     "raw_dir": os.path.join(job_dir, "raw"),
#     # }

#     for p in paths.values():
#         if isinstance(p, str) and (p.endswith(".json") or p.endswith(".jsonl")):
#             os.makedirs(os.path.dirname(p), exist_ok=True)
#         elif isinstance(p, str):
#             os.makedirs(p, exist_ok=True)

#     return paths

# =========================
# XML MAP + XML SAFE PARSE HELPERS
# =========================
def safe_str(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s:
        # Chuan hoa ve dang "dung san" (NFC). XML hoa don nhieu khi luu tieng Viet
        # o dang to hop (NFD), vi du "e" = "e" + dau mu + dau sac roi.
        # Bo chuyen UNICODE->TCVN3 ben VFP chi co bang anh xa dang dung san,
        # gap ky tu to hop se ra dau "?". Chuan hoa NFC o day giup tranh loi do.
        # NFC khong lam thay doi ASCII, so, duong dan -> an toan voi moi gia tri.
        s = unicodedata.normalize("NFC", s)
    return s

def norm_bool(v):
    s = safe_str(v).lower()
    return s in ("1", "true", "yes", "y", "x")

def xml_local_name(tag):
    if not tag:
        return ""
    return tag.split("}", 1)[-1] if "}" in tag else tag

def find_first_child_by_local_name(parent, name):
    if parent is None:
        return None
    for ch in list(parent):
        if xml_local_name(ch.tag) == name:
            return ch
    return None

def xml_find_node_by_path(root, path):
    """
    Tim node theo path day du:
      /HDon/DLHDon/TTChung/KHHDon
    hoac path tuong doi:
      THHDVu
      DVTinh
    Khong phu thuoc namespace.
    """
    if root is None:
        return None

    path = safe_str(path)
    if not path:
        return None

    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
        return None

    cur = root

    # Neu phan dau path trung ten root thi bo qua
    if parts and xml_local_name(cur.tag) == parts[0]:
        parts = parts[1:]

    for part in parts:
        cur = find_first_child_by_local_name(cur, part)
        if cur is None:
            return None

    return cur

def xml_find_text_by_path(root, path, default=""):
    node = xml_find_node_by_path(root, path)
    if node is None:
        return default
    txt = node.text
    if txt is None:
        return default
    return str(txt).strip()

def load_xml_map_from_excel(map_path):
    """
    Doc file XML map Excel.
    Yeu cau toi thieu:
      - node_name
      - target_table   (MASTER / LINE)
      - field_name
    """
    xls = pd.ExcelFile(map_path)
    if not xls.sheet_names:
        raise ValueError("File XML map khong co sheet nao")

    sheet = xls.sheet_names[0]
    df = pd.read_excel(map_path, sheet_name=sheet).fillna("")

    # Chuan hoa ten cot
    normalized_columns = []
    for c in df.columns:
        sc = safe_str(c)
        normalized_columns.append(sc)
    df.columns = normalized_columns

    required = ["node_name", "target_table", "field_name"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"XML map thieu cot bat buoc: {', '.join(missing)}")

    master_map = []
    line_map = []

    for _, row in df.iterrows():
        node_name = safe_str(row.get("node_name"))
        target_table = safe_str(row.get("target_table")).upper()
        field_name = safe_str(row.get("field_name"))

        if not node_name or not field_name or target_table not in ("MASTER", "LINE"):
            continue

        item = {
            "node_name": node_name,
            "target_table": target_table,
            "field_name": field_name,
        }

        if target_table == "MASTER":
            master_map.append(item)
        else:
            line_map.append(item)

    if not master_map and not line_map:
        raise ValueError("XML map khong co dong hop le nao")

    return {
        "master": master_map,
        "line": line_map,
    }
########################################
def normalize_invoice_text(v):
    s = safe_str(v)

    if not s:
        return ""

    # Bo khoang trang
    s = s.strip()

    # Neu la dang so co .0 thi cat ve so nguyen
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".", 1)[0]

    # Bo .0 o cuoi neu co
    if s.endswith(".0"):
        s = s[:-2]

    return s.strip().upper()

def make_invoice_key(huong, khhd, shd):
    return (
        normalize_invoice_text(huong),
        normalize_invoice_text(khhd),
        normalize_invoice_text(shd),
    )
############################################
def extract_thang_from_filename(file_path):
    """
    Lay thang tu ten file dang:
      HD_VAO_USA_MEVA_T3_KM.xlsx
      HD_RA_VINH_HOAN_T11.xlsx
      HD_VAO_XXX_T12_MTT.xlsx
    """
    base = os.path.basename(file_path).upper()
    m = re.search(r'_T(\d{1,2})(?:_|\.XLSX?$)', base)
    if m:
        return m.group(1)
    return ""
###############################################
def them_cot_xml_path(excel_path, xml_paths, header_row=6, col_khhd="Ký hiệu hóa đơn", col_shd="Số hóa đơn", col_moi="Đường dẫn XML"):
    """
    Mo file Excel tai ve tu server, them 1 cot 'Duong dan XML' vao cuoi header,
    khop theo (khhd, shd) voi xml_paths dict de dien duong dan.
    """
    try:
        wb = openpyxl.load_workbook(excel_path)
        ws = wb.active

        # Tim cot khhd va shd trong header_row
        idx_khhd = None
        idx_shd = None
        max_col = ws.max_column
        for c in range(1, max_col + 1):
            val = ws.cell(row=header_row, column=c).value
            if val is None:
                continue
            val_str = str(val).strip()
            if val_str == col_khhd:
                idx_khhd = c
            elif val_str == col_shd:
                idx_shd = c

        if idx_khhd is None or idx_shd is None:
            #print(f"      [Excel] Khong tim thay cot '{col_khhd}' hoac '{col_shd}' o dong {header_row}")
            wb.close()
            return False

        # Them cot moi vao cuoi
        col_xml = max_col + 1
        ws.cell(row=header_row, column=col_xml, value=col_moi)

        # Duyet tung dong data, khop va dien path
        count_match = 0
        for r in range(header_row + 1, ws.max_row + 1):
            khhd = ws.cell(row=r, column=idx_khhd).value
            shd = ws.cell(row=r, column=idx_shd).value
            if khhd is None or shd is None:
                continue
            key = (str(khhd).strip(), str(shd).strip())
            xml_path = xml_paths.get(key, "")
            ws.cell(row=r, column=col_xml, value=xml_path)
            if xml_path:
                count_match += 1

        wb.save(excel_path)
        wb.close()
        #print(f"      [Excel] Da them cot 'Duong dan XML' ({count_match} hoa don co XML)")
        return True
    except Exception as e:
        #print(f"      [Excel] Loi them cot: {e}")
        return False

def an_toan_du_lieu(text, max_bytes=254):
    """
    Chuan bi gia tri ghi vao DBF codepage utf8 (giu nguyen tieng Viet co dau).
    Chi cat theo so byte UTF-8 cho khop field C(max_bytes), khong cat giua
    1 ky tu nhieu byte (dung errors='ignore' khi decode lai).
    """
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    text = text.strip()
    b = text.encode("utf-8")[:max_bytes]
    return b.decode("utf-8", "ignore")

# def excel_to_exact_dbf(excel_path, output_dir):
#     """
#     Chuyen tung sheet trong Excel sang DBF.
#     Ten field DBF lay theo header Excel.
#     Vi field_name trong map da duoc quy chuan DBF, ham nay se:
#       - giu toi da ten field goc
#       - chi chuan hoa nhe de tranh loi
#       - dam bao khong trung ten field
#     """
#     def normalize_dbf_field_name(name, used_names):
#         name = safe_str(name).upper()

#         # Bo dau neu co
#         name = unicodedata.normalize('NFD', name)
#         name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
#         name = name.replace('Đ', 'D').replace('đ', 'd')

#         # Chi giu A-Z 0-9 _
#         name = re.sub(r'[^A-Z0-9_]', '_', name)
#         name = re.sub(r'_+', '_', name).strip('_')

#         if not name:
#             name = "FIELD"

#         # DBF an toan <= 10 ky tu
#         base = name[:10]
#         candidate = base
#         i = 1

#         while candidate in used_names:
#             suffix = str(i)
#             candidate = base[:10 - len(suffix)] + suffix
#             i += 1

#         used_names.add(candidate)
#         return candidate

#     try:
#         xl = pd.ExcelFile(excel_path)
#         sheet_names = xl.sheet_names
#         #print(f"---sheet processing... : {sheet_names} ---")

#         for sheet in sheet_names:
#             df = pd.read_excel(excel_path, sheet_name=sheet)
#             df = df.fillna('')

#             dbf_filename = sheet.upper() + ".DBF"
#             dbf_path = os.path.join(output_dir, dbf_filename)

#             original_cols = list(df.columns)
#             used_names = set()
#             final_cols = [normalize_dbf_field_name(col, used_names) for col in original_cols]
#             df.columns = final_cols

#             specs = [f"{col} C(254)" for col in df.columns]
#             table_spec = "; ".join(specs)

#             # Xoa file DBF cu neu ton tai
#             if os.path.exists(dbf_path):
#                 try:
#                     os.remove(dbf_path)
#                 except Exception:
#                     pass

#             # codepage utf8 (byte header 0xf0) de giu tieng Viet co dau day du nhu Excel.
#             # Luu y: app doc DBF (vd VFP) phai ho tro doc UTF-8 thi moi hien dung.
#             table = dbf.Table(dbf_path, table_spec, codepage='utf8', dbf_type='vfp')
#             table.open(mode=dbf.READ_WRITE)

#             for _, row in df.iterrows():
#                 data = tuple(an_toan_du_lieu(str(val).strip()) for val in row)
#                 table.append(data)

#             table.close()
#             #print(f"Done: {dbf_filename}")
    
#     except Exception as e:
#         #print(f"System error: {repr(e)}")
#         raise
#     finally:
#         table.close()   # luôn chạy, kể cả khi append lỗi

# =========================
# EXCEL FALLBACK + CAP NHAT TTHAI_HD TU EXCEL TONG HOP
# =========================
def normalize_header_text(v):
    s = safe_str(v)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s

def build_header_map(df):
    out = {}
    for c in df.columns:
        out[normalize_header_text(c)] = c
    return out

def pick_col(header_map, candidates):
    for cand in candidates:
        key = normalize_header_text(cand)
        if key in header_map:
            return header_map[key]
    return None

def value_from_row(row, col_name):
    if not col_name:
        return ""
    try:
        v = row[col_name]
        if pd.isna(v):
            return ""
        s = str(v).strip()
        if s:
            # Chuan hoa ve dang "dung san" (NFC) - xem ghi chu o safe_str().
            # File Excel tong hop tai tu cong Thue cung co the o dang to hop (NFD).
            s = unicodedata.normalize("NFC", s)
        return s
    except Exception:
        return ""

def read_excel_summary_rows(excel_path):
    """
    Doc file Excel tong hop GDT, header o dong 6.
    Tra ve DataFrame.
    """
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb.active

    header_row = 6
    headers = [ws.cell(row=header_row, column=c).value for c in range(1, ws.max_column + 1)]
    headers = [safe_str(h) for h in headers]

    data = []
    for r in range(header_row + 1, ws.max_row + 1):
        row_dict = {}
        non_empty = 0

        for c, h in enumerate(headers, start=1):
            val = ws.cell(row=r, column=c).value
            sval = "" if val is None else str(val).strip()
            row_dict[h] = sval
            if sval != "":
                non_empty += 1

        if non_empty == 0:
            continue

        data.append(row_dict)

    wb.close()

    if not data:
        return pd.DataFrame()

    return pd.DataFrame(data).fillna("")

def update_master_tthai_hd_from_excel_files(excel_file_infos, all_master_rows, lock_rows, run_log=None):
    """
    Cap nhat TTHAI_HD cho TAT CA cac hoa don da co trong all_master_rows
    bang cach doi chieu voi cac file Excel tong hop.
    Ap dung cho ca VAO va RA.
    Match theo 2 cap khoa:
      1) HUONG + KHHD + SO_HD
      2) HUONG + KHHD_TRA_C + SHD_TRA_CU
    """
    index_map = {}

    with lock_rows:
        for row in all_master_rows:
            huong = safe_str(row.get("HUONG")).upper()

            key1 = make_invoice_key(
                huong,
                row.get("KHHD"),
                row.get("SO_HD"),
            )
            key2 = make_invoice_key(
                huong,
                row.get("KHHD_TRA_C"),
                row.get("SHD_TRA_CU"),
            )

            if key1[1] and key1[2]:
                index_map[key1] = row

            if key2[1] and key2[2]:
                index_map[key2] = row

    updated = 0

    for info in excel_file_infos:
        excel_path = info.get("path")
        huong = safe_str(info.get("huong")).upper()

        if not excel_path or not os.path.exists(excel_path):
            continue

        try:
            df = read_excel_summary_rows(excel_path)
            if df.empty:
                continue

            header_map = build_header_map(df)

            col_khhd = pick_col(header_map, ["Ký hiệu hóa đơn", "Ky hieu hoa don"])
            col_shd = pick_col(header_map, ["Số hóa đơn", "So hoa don"])
            col_tthai_hd = pick_col(header_map, ["Trạng thái hóa đơn", "Trang thai hoa don"])

            if not col_khhd or not col_shd or not col_tthai_hd:
                if run_log:
                    append_run_log(run_log, f"TTHAI_HD_SKIP file={excel_path} missing_required_columns")
                continue

            updated_this_file = 0

            for _, row_excel in df.iterrows():
                khhd = value_from_row(row_excel, col_khhd)
                shd = value_from_row(row_excel, col_shd)
                tthai_hd_unicode = value_from_row(row_excel, col_tthai_hd)

                key = make_invoice_key(huong, khhd, shd)
                row_master = index_map.get(key)

                if row_master is not None:
                    row_master["TTHAI_HD"] = safe_str(tthai_hd_unicode)
                    updated += 1
                    updated_this_file += 1

            if run_log:
                append_run_log(run_log, f"TTHAI_HD_UPDATED file={excel_path} matched={updated_this_file}")

        except Exception as e:
            if run_log:
                append_run_log(run_log, f"TTHAI_HD_ERROR file={excel_path} err={short_exc(e)}")

    return updated

def build_rows_from_excel_without_xml(excel_path, huong_default="", ma_donvi="", mst_tra_cuu="", thang="", nam=""):
    """
    Chi dung cho file Excel tong hop HOA DON VAO KHONG MA (_KM.xlsx).
    Lay cac dong KHONG CO duong dan XML va sinh:
      - 1 dong master
      - 1 dong line dai dien

    Quy tac line:
      - SO_LUONG = 1
      - DON_GIA = TONG_TIEN
      - THANH_TIEN = TONG_TIEN
      - TEN_HANG = "NOXML - " + TEN_BAN
      - DVT = "Lần"

    TTHAI_HD lay tu Excel (Unicode).
    """
    master_rows = []
    line_rows = []

    base_name = os.path.basename(excel_path).upper()
    if "_KM" not in base_name:
        return master_rows, line_rows

    df = read_excel_summary_rows(excel_path)
    if df.empty:
        return master_rows, line_rows

    header_map = build_header_map(df)

    col_xml = pick_col(header_map, ["Đường dẫn XML", "Duong dan XML"])
    col_kieu_hd = pick_col(header_map, ["Ký hiệu mẫu số", "Ky hieu mau so"])
    col_khhd = pick_col(header_map, ["Ký hiệu hóa đơn", "Ky hieu hoa don"])
    col_shd = pick_col(header_map, ["Số hóa đơn", "So hoa don"])
    col_ngay_hd = pick_col(header_map, ["Ngày lập", "Ngay lap"])

    col_mst_ban = pick_col(header_map, [
        "MST người bán/MST người xuất hàng",
        "Ma so thue nguoi ban/MST nguoi xuat hang"
    ])
    col_ten_ban = pick_col(header_map, [
        "Tên người bán/Tên người xuất hàng",
        "Ten nguoi ban/Ten nguoi xuat hang"
    ])

    col_mst_mua = pick_col(header_map, [
        "MST người mua/MST người nhận hàng",
        "Ma so thue nguoi mua/MST nguoi nhan hang"
    ])
    col_ten_mua = pick_col(header_map, [
        "Tên người mua/Tên người nhận hàng",
        "Ten nguoi mua/Ten nguoi nhan hang"
    ])
    col_dchi_mua = pick_col(header_map, [
        "Địa chỉ người mua",
        "Dia chi nguoi mua"
    ])

    col_tien_hang = pick_col(header_map, [
        "Tổng tiền chưa thuế",
        "Tong tien chua thue"
    ])
    col_tien_vat = pick_col(header_map, [
        "Tổng tiền thuế",
        "Tong tien thue"
    ])
    col_tien_ck = pick_col(header_map, [
        "Tổng tiền chiết khấu thương mại",
        "Tong tien chiet khau thuong mai"
    ])
    col_tien_phi = pick_col(header_map, [
        "Tổng tiền phí",
        "Tong tien phi"
    ])
    col_tong_tien = pick_col(header_map, [
        "Tổng tiền thanh toán",
        "Tong tien thanh toan"
    ])
    col_dvt_te = pick_col(header_map, [
        "Đơn vị tiền tệ",
        "Don vi tien te"
    ])
    col_ty_gia = pick_col(header_map, [
        "Tỷ giá",
        "Ty gia"
    ])
    col_tthai_hd = pick_col(header_map, [
        "Trạng thái hóa đơn",
        "Trang thai hoa don"
    ])
    col_kq_kiemtra = pick_col(header_map, [
        "Kết quả kiểm tra hóa đơn",
        "Ket qua kiem tra hoa don"
    ])

    huong_norm = normalize_invoice_text(huong_default)
    ma_donvi_norm = safe_str(ma_donvi).strip().upper()
    mst_norm = normalize_invoice_text(mst_tra_cuu)
    thang_norm = normalize_invoice_text(thang)
    nam_norm = normalize_invoice_text(nam)

    for _, row in df.iterrows():
        xml_path = value_from_row(row, col_xml)

        if xml_path:
            continue

        kieu_hd = value_from_row(row, col_kieu_hd)
        khhd = normalize_invoice_text(value_from_row(row, col_khhd))
        shd = normalize_invoice_text(value_from_row(row, col_shd))
        ngay_hd = value_from_row(row, col_ngay_hd)

        mst_ban = value_from_row(row, col_mst_ban)
        ten_ban = value_from_row(row, col_ten_ban)

        mst_mua = value_from_row(row, col_mst_mua)
        ten_mua = value_from_row(row, col_ten_mua)
        dchi_mua = value_from_row(row, col_dchi_mua)

        tien_hang = value_from_row(row, col_tien_hang)
        tien_vat = value_from_row(row, col_tien_vat)
        tien_ck = value_from_row(row, col_tien_ck)
        tien_phi = value_from_row(row, col_tien_phi)
        tong_tien = value_from_row(row, col_tong_tien)
        dvt_te = value_from_row(row, col_dvt_te)
        ty_gia = value_from_row(row, col_ty_gia)
        tthai_hd = value_from_row(row, col_tthai_hd)
        kq_kiemtra = value_from_row(row, col_kq_kiemtra)

        # ma_hd = f"{ma_donvi_norm}_{mst_norm}_{khhd}_{shd}"
        # MỚI: mst người bán ở nhánh này lấy từ biến MST người bán có sẵn trong cùng hàm
        #      (tên kiểu mst_nban / nbmst — nhìn 15 dòng phía trên); fallback mst_norm
        mst_ph = str(mst_ban or mst_norm).strip()
        ma_hd = f"{huong_norm}_{mst_ph}_{khhd}_{shd}"
        # ma_hd = f"{huong_norm}_{(mst_ban or mst_norm)}_{khhd}_{shd}"
        master_row = {
            "MA_HD": ma_hd,
            "MA_DONVI": ma_donvi_norm,
            "MST_TRA_CU": mst_norm,
            "HUONG": huong_norm,
            "THANG": thang_norm,
            "NAM": nam_norm,
            "KHHD_TRA_C": khhd,
            "SHD_TRA_CU": shd,
            "XML_PATH": "",
            "NGUON_DL": "EXCEL_NO_XML",

            "KIEU_HD": kieu_hd,
            "KHHD": khhd,
            "SO_HD": shd,
            "NGAY_HD": ngay_hd,

            "MST_BAN": mst_ban,
            "TEN_BAN": ten_ban,

            "MST_MUA": mst_mua,
            "TEN_MUA": ten_mua,
            "DCHI_MUA": dchi_mua,

            "TIEN_HANG": tien_hang,
            "TIEN_VAT": tien_vat,
            "TIEN_CK": tien_ck,
            "TIEN_PHI": tien_phi,
            "TONG_TIEN": tong_tien,
            "DVT_TE": dvt_te,
            "TY_GIA": ty_gia,

            "TTHAI_HD": tthai_hd,
            "KQ_KTRA": kq_kiemtra,
        }

        line_row = {
            "MA_HD": ma_hd,
            "HUONG": huong_norm,
            "THANG": thang_norm,
            "NAM": nam_norm,
            "LINE_NO": "1",
            "NGUON_DL": "EXCEL_NO_XML",

            "TEN_HANG": f"NOXML - {ten_ban}" if ten_ban else "NOXML",
            "SO_LUONG": "1",
            "DVT": "Lần",
            "DON_GIA": tong_tien,
            "THANH_TIEN": tong_tien,
            "PT_VAT": "",
        }

        master_rows.append(master_row)
        line_rows.append(line_row)

    return master_rows, line_rows

def append_non_xml_rows_from_excel_files(
    excel_file_infos,
    all_master_rows,
    all_line_rows,
    lock_rows,
    ma_donvi="",
    mst_tra_cuu="",
    nam="",
    run_log=None
):
    """
    Chi bo sung tu file HOA DON VAO KHONG MA (_KM.xlsx).
    Lay cac dong khong co XML roi append vao all_master_rows / all_line_rows.
    Tu dong lay THANG tu ten file.
    """
    added_master = 0
    added_line = 0

    for info in excel_file_infos:
        excel_path = info.get("path")
        huong = info.get("huong", "")

        if not excel_path or not os.path.exists(excel_path):
            continue

        base_name = os.path.basename(excel_path).upper()
        if huong != "VAO" or "_KM" not in base_name:
            continue

        try:
            thang_file = extract_thang_from_filename(excel_path)

            master_rows, line_rows = build_rows_from_excel_without_xml(
                excel_path=excel_path,
                huong_default=huong,
                ma_donvi=ma_donvi,
                mst_tra_cuu=mst_tra_cuu,
                thang=thang_file,
                nam=nam
            )

            if master_rows or line_rows:
                with lock_rows:
                    all_master_rows.extend(master_rows)
                    all_line_rows.extend(line_rows)

                added_master += len(master_rows)
                added_line += len(line_rows)

                if run_log:
                    append_run_log(
                        run_log,
                        f"APPEND_NO_XML_FROM_EXCEL file={excel_path} huong={huong} thang={thang_file} master={len(master_rows)} line={len(line_rows)}"
                    )
        except Exception as e:
            if run_log:
                append_run_log(run_log, f"APPEND_NO_XML_FROM_EXCEL_ERROR file={excel_path} err={short_exc(e)}")

    return added_master, added_line


def parse_xml_hoa_don(xml_path, ma_hd, MA_DONVI, mst_value, huong, thang, nam, khhd, shd, xml_map):
    """
    Doc 1 file XML hoa don theo map Excel.
    - MASTER: lay 1 lan tren toan bo XML
    - LINE: lap theo tung node HHDVu
    - Neu node khong ton tai -> de rong, khong bao loi
    """
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()

        # ===== Row master co san 1 so field he thong =====
        master_row = {
            "MA_HD": safe_str(ma_hd),
            "MA_DONVI": safe_str(MA_DONVI),
            "MST_TRA_CU": safe_str(mst_value),
            "HUONG": safe_str(huong),
            "THANG": safe_str(thang),
            "NAM": safe_str(nam),
            "KHHD_TRA_C": safe_str(khhd),
            "SHD_TRA_CU": safe_str(shd),
            "XML_PATH": safe_str(xml_path),
            "TTHAI_HD": "",
        }        
        
        # ===== Lay field MASTER tu map =====
        for item in xml_map.get("master", []):
            field_name = safe_str(item.get("field_name"))
            node_path = safe_str(item.get("node_name"))

            val = xml_find_text_by_path(root, node_path, default="")
            master_row[field_name] = safe_str(val)

        # ===== Tim tat ca HHDVu =====
        hhdvu_nodes = []
        for node in root.iter():
            if xml_local_name(node.tag) == "HHDVu":
                hhdvu_nodes.append(node)

        line_rows = []

        for idx, hhdvu in enumerate(hhdvu_nodes, 1):
            line_row = {
                "MA_HD": safe_str(ma_hd),
                "HUONG": safe_str(huong),
                "THANG": safe_str(thang),
                "NAM": safe_str(nam),
                "LINE_NO": str(idx),
            }

            for item in xml_map.get("line", []):
                field_name = safe_str(item.get("field_name"))
                node_path = safe_str(item.get("node_name"))

                # Cat path sau HHDVu de tim tuong doi tren chinh node line
                parts = [p for p in node_path.strip("/").split("/") if p]
                if "HHDVu" in parts:
                    pos = parts.index("HHDVu")
                    rel_parts = parts[pos + 1:]
                    rel_path = "/".join(rel_parts)
                else:
                    rel_path = node_path

                val = xml_find_text_by_path(hhdvu, rel_path, default="")
                line_row[field_name] = safe_str(val)

            line_rows.append(line_row)

        return True, master_row, line_rows

    except Exception as e:
        return False, None, str(e)
    
# def parse_xml_hoa_don(xml_path, ma_hd, MA_DONVI, mst_value, huong, thang, nam, khhd, shd):
#     """Doc 1 file XML hoa don, tra ve (master_row, line_rows)"""
#     try:
#         tree = ET.parse(xml_path)
#         root = tree.getroot()
#         nban = root.find('.//NBan')
#         nmua = root.find('.//NMua')
#         tt_chung = root.find('.//TTChung')
#         # Lay tong tien tu TToan
#         ttoan = root.find('.//TToan')
#         tg_cthue = ttoan.findtext('TgTCThue') if ttoan is not None else None
#         tg_thue = ttoan.findtext('TgTThue') if ttoan is not None else None

#         master_row = {
#             "ma_hd": ma_hd,
#             "KIEU_HD": tt_chung.findtext('.//KHMSHDon') if tt_chung is not None else "",
#             "KHHD": to_tcvn3(tt_chung.findtext('.//KHHDon')) if tt_chung is not None else "",
#             "SO_HD": to_tcvn3(tt_chung.findtext('.//SHDon')) if tt_chung is not None else "",
#             "NGAY_HD": tt_chung.findtext('.//NLap') if tt_chung is not None else "",
#             "TEN_BAN": to_tcvn3(nban.findtext('Ten')) if nban is not None else "",
#             "MST_BAN": nban.findtext('MST') if nban is not None else "",
#             "DIA_CHI_BAN": to_tcvn3(nban.findtext('DChi')) if nban is not None else "",
#             "TEN_MUA": to_tcvn3(nmua.findtext('Ten')) if nmua is not None else "",
#             "MST_MUA": nmua.findtext('MST') if nmua is not None else "",
#             "DIA_CHI_MUA": to_tcvn3(nmua.findtext('DChi')) if nmua is not None else "",
#             "NG_GD": to_tcvn3(nmua.findtext('HVTNMHang')) if nmua is not None else "",
#             "TIEN_HANG": tg_cthue,
#             "TIEN_VAT": tg_thue,
#             "TIEN_CK": ttoan.findtext('TTCKTMai') if ttoan is not None else "",
#         }

#         line_rows = []
#         for hhdvu in root.findall('.//HHDVu'):
#             line_rows.append({
#                 "ma_hd": ma_hd,
#                 "LOAI_HH": to_tcvn3(hhdvu.findtext('TChat')) if hhdvu is not None else "",
#                 "STT_LINE": hhdvu.findtext('STT'),
#                 "MA_NGAN": to_tcvn3(hhdvu.findtext('MHHDVu')) if hhdvu is not None else "",
#                 "TEN_HANG": to_tcvn3(hhdvu.findtext('THHDVu')) if hhdvu is not None else "",
#                 "DVT": to_tcvn3(hhdvu.findtext('DVTinh')) if hhdvu is not None else "",
#                 "SO_LUONG": hhdvu.findtext('SLuong'),
#                 "DON_GIA": hhdvu.findtext('DGia'),
#                 "CK_LINE": hhdvu.findtext('STCKhau') if hhdvu is not None else "",
#                 "THANH_TIEN": hhdvu.findtext('ThTien'),
#                 "PT_VAT": hhdvu.findtext('TSuat') if hhdvu is not None else "",
#             })
#         return True, master_row, line_rows
#     except Exception as e:
#         return False, None, str(e)


# =========================
# WORKER THREAD: parse XML -> append vao all_master_rows + all_line_rows
# =========================
def converter_worker(xml_queue, ket_qua_convert, all_master_rows, all_line_rows, lock_rows, stop_signal, xml_map):
    """
    Worker thread chay song song voi tai XML.
    Parse XML theo xml_map, append vao 2 list dung chung.
    """
    while True:
        try:
            item = xml_queue.get(timeout=2)
        except queue.Empty:
            if stop_signal.is_set():
                break
            continue

        if item is None:
            xml_queue.task_done()
            break

        xml_path, ma_hd, MA_DONVI, mst_value, huong, thang, nam, khhd, shd, ten_base = item

        ok, master_row, line_rows = parse_xml_hoa_don(
            xml_path=xml_path,
            ma_hd=ma_hd,
            MA_DONVI=MA_DONVI,
            mst_value=mst_value,
            huong=huong,
            thang=thang,
            nam=nam,
            khhd=khhd,
            shd=shd,
            xml_map=xml_map
        )

        if ok:
            with lock_rows:
                all_master_rows.append(master_row)
                all_line_rows.extend(line_rows)
            ket_qua_convert["ok"] += 1
        else:
            ket_qua_convert["err"] += 1
            ket_qua_convert["loi"].append((ten_base, line_rows))  # line_rows la error message
            #print(f"      [Parse LOI] {ten_base}: {line_rows}")

        xml_queue.task_done()


def mo_trang_gdt(driver, run_log, url="https://hoadondientu.gdt.gov.vn", so_lan=5):
    for lan in range(1, so_lan + 1):
        try:
            driver.get(url)
        except WebDriverException as e:
            append_run_log(run_log, f"OPEN_SITE_GET_EXC lan={lan}: {e!r}")
            try: driver.get("about:blank")
            except Exception: pass
            time.sleep(min(3 * lan, 15))
            continue

        # Thanh cong = phan tu goc #__next cua trang GDT that su xuat hien
        try:
            WebDriverWait(driver, 12).until(
                lambda d: d.execute_script("return !!document.getElementById('__next');")
            )
            append_run_log(run_log, f"OPEN_SITE_OK lan={lan}")
            return True
        except TimeoutException:
            # Ghi lai trang dang hien ra (de biet la ERR gi)
            body_txt = ""
            try:
                body_txt = (driver.find_element(By.TAG_NAME, "body").text or "")[:150].replace("\n", " ")
            except Exception:
                pass
            append_run_log(run_log, f"OPEN_SITE_FAIL lan={lan} body={body_txt!r}")
            try: driver.get("about:blank")
            except Exception: pass
            time.sleep(min(3 * lan, 15))   # cho tang dan: 3,6,9,12,15s

    return False
# def converter_worker(xml_queue, ket_qua_convert, all_master_rows, all_line_rows, lock_rows, stop_signal):
#     """
#     Worker thread chay song song voi tai XML.
#     Parse XML, append rows vao 2 list dung chung.
#     Cuoi cung main thread se ghi 1 file Excel.
#     """
#     while True:
#         try:
#             item = xml_queue.get(timeout=2)
#         except queue.Empty:
#             if stop_signal.is_set():
#                 break
#             continue

#         if item is None:
#             xml_queue.task_done()
#             break

#         xml_path, ma_hd, MA_DONVI, mst_value, huong, thang, nam, khhd, shd, ten_base = item
#         ok, master_row, line_rows = parse_xml_hoa_don(xml_path, ma_hd, MA_DONVI, mst_value, huong, thang, nam, khhd, shd)
#         if ok:
#             master_row["HUONG"] = huong
#             for lr in line_rows:
#                 lr["HUONG"] = huong
#             with lock_rows:
#                 all_master_rows.append(master_row)
#                 all_line_rows.extend(line_rows)
#             ket_qua_convert["ok"] += 1
#         else:
#             ket_qua_convert["err"] += 1
#             ket_qua_convert["loi"].append((ten_base, line_rows))  # line_rows chua error msg
#             #print(f"      [Parse LOI] {ten_base}: {line_rows}")

#         xml_queue.task_done()


class tra_cuu_hdt:
    my_clsid = pythoncom.CreateGuid()
    _reg_clsid_ = my_clsid
    _reg_desc_ = "tra_cuu_hdt Server"
    _reg_progid_ = "tra_cuu_hdt.Server"
    _public_methods_ = ['xuat_hoa_don']

    # loai_xuat: "all" = tat ca, "ra" = chi ban ra, "vao" = chi mua vao

    # def xuat_hoa_don(self, mst_value, password_value, thang_bd, thang_kt, nam, save_dir, MA_DONVI, job_id,status, events, stagedir, loai_xuat="all"):

    def xuat_hoa_don(self, mst_value, password_value,tu_ngay,den_ngay,thang_bd, thang_kt, nam, save_dir, MA_DONVI, job_id, status, events, stagedir, loai_xuat="all", xml_map_path=None):    
        paths = make_job_paths(save_dir, job_id, MA_DONVI)

        status_path = status
        events_path = events
        run_log = paths["run_log"]

        status = StatusWriter(status_path)
        events = EventWriter(events_path)

        append_run_log(run_log, f"JOB_ENTER xuat_hoa_don pid={os.getpid()} job_id={job_id} ma_donvi={MA_DONVI} mst={mst_value} loai_xuat={loai_xuat}")
        append_run_log(run_log, f"PATHS status={status_path} events={events_path} stage={stagedir}")

        if not xml_map_path:
            raise ValueError("Thieu xml_map_path")

        xml_map = load_xml_map_from_excel(xml_map_path)
        append_run_log(
            run_log,
            f"XML_MAP_LOADED path={xml_map_path} master={len(xml_map.get('master', []))} line={len(xml_map.get('line', []))}"
        )
        # paths = make_job_paths(save_dir, job_id,MA_DONVI)

        # # status = StatusWriter(paths["status"])
        # # events = EventWriter(paths["events"])
        # status = StatusWriter(status)
        # events = EventWriter(events)

        state = {
            "job_id": job_id,
            "ma_donvi": MA_DONVI,
            "mst": mst_value,
            "state": "INIT",
            "message": "Khoi tao Khởi tạo",
            "stage_dbf_dir": stagedir,
            "run_log": run_log,
            "pid": os.getpid(),
            "alive": True,
            "started_at": datetime.datetime.now().isoformat(timespec="seconds")
        }
        # state = {
        #     "job_id": job_id,
        #     "ma_donvi": MA_DONVI,
        #     "mst": mst_value,
        #     "state": "INIT",
        #     "message": "Khởi tạo",
        #     "stage_dbf_dir": stagedir,
        #     "started_at": datetime.datetime.now().isoformat(timespec="seconds")
        # }

        # status.write(state)
        # events.log("LOGIN", ma_donvi=MA_DONVI)
        ##########
        status.write(state)
        events.log("LOGIN", ma_donvi=MA_DONVI)

        last_heartbeat = 0.0

        def set_state(new_state=None, message=None, **extra):
            if new_state is not None:
                state["state"] = new_state
            if message is not None:
                state["message"] = message

            payload = {
                **state,
                "alive": True,
                "pid": os.getpid(),
                **extra
            }
            status.write(payload)

        def heartbeat(message=None, force=False, **extra):
            nonlocal last_heartbeat
            now = time.time()
            if force or (now - last_heartbeat >= 10):
                payload = {
                    **state,
                    "alive": True,
                    "pid": os.getpid(),
                    "heartbeat_at": datetime.datetime.now().isoformat(timespec="seconds"),
                    **extra
                }
                if message:
                    payload["message"] = message
                status.write(payload)
                last_heartbeat = now
        ##########

        # temp_profile_dir = tempfile.mkdtemp(prefix="chrome_profile_")
        # chrome_options = webdriver.ChromeOptions()
        # chrome_options.add_argument("--headless=new")
        # chrome_options.add_argument("--window-size=1920,1080")
        # chrome_options.add_argument(f"--user-data-dir={temp_profile_dir}")
        # chrome_options.add_argument("--force-device-scale-factor=1")
        # chrome_options.add_argument("--high-dpi-support=1")
        # chrome_options.add_argument("--disable-gpu")
        # chrome_options.add_argument("--hide-scrollbars")
        # driver = webdriver.Chrome(options=chrome_options)

        append_run_log(run_log, "CHROME_PROFILE_CREATE")
        # Kill chromedriver/chrome con sot tu lan chay truoc (tranh khoa profile)
        os.system('taskkill /F /IM chromedriver.exe /T >NUL 2>&1')

        # Don sach cac profile rac "chrome_profile_*" con ton tai do lan chay truoc bi crash/kill
        try:
            temp_root = tempfile.gettempdir()
            for name in os.listdir(temp_root):
                if name.startswith("chrome_profile_"):
                    old_path = os.path.join(temp_root, name)
                    if os.path.isdir(old_path):
                        shutil.rmtree(old_path, ignore_errors=True)
        except Exception:
            pass

        # Uu tien cache local cua webdriver-manager, chi tai lai khi Chrome doi version
        os.environ.setdefault('WDM_LOCAL', '1')

        # Chrome + profile duoc tao MOI trong moi lan dang nhap (xem vong retry ben duoi)
        driver = None
        temp_profile_dir = None

        # ===== Khoi tao queue + worker thread =====
        xml_queue = queue.Queue()
        ket_qua_convert = {"ok": 0, "err": 0, "loi": []}
        all_master_rows = []   # Toan bo dong master (sheet ThongTinChung)
        all_line_rows = []     # Toan bo dong line (sheet HangHoa)
        lock_rows = threading.Lock()
        excel_summary_files = []   # Danh sach file Excel tong hop de bo sung NOXML va cap nhat TTHAI_HD        
        stop_signal = threading.Event()

        # worker = threading.Thread(
        #     target=converter_worker,
        #     args=(xml_queue, ket_qua_convert, all_master_rows, all_line_rows, lock_rows, stop_signal),
        #     daemon=True
        # )
        worker = threading.Thread(
            target=converter_worker,
            args=(xml_queue, ket_qua_convert, all_master_rows, all_line_rows, lock_rows, stop_signal, xml_map),
            daemon=True
        )
        worker.start()

        try:
            if not (1 <= thang_bd <= 12 and 1 <= thang_kt <= 12 and thang_bd <= thang_kt):
                status.write({**state, "state": "ERROR", "message": "invalid_month_range"})
                events.log("JOB_ERROR", error="invalid_month_range")
                return "invalid_month_range"
            khoang_cach = []
            if tu_ngay and den_ngay:
                tu_ngay = tu_ngay
                den_ngay = den_ngay
                khoang_cach.append((thang_bd, tu_ngay, den_ngay))
            else:
                for thang in range(thang_bd, thang_kt + 1):
                    tu_ngay = f"01/{thang:02d}/{nam}"
                    _, so_ngay = calendar.monthrange(nam, thang)
                    den_ngay = f"{so_ngay:02d}/{thang:02d}/{nam}"
                    
                    khoang_cach.append((thang, tu_ngay, den_ngay))
                
            # #print("đang mở trình duyệt và đăng nhập...")
            # events.log("LOGIN",message="đang mở trình duyệt và đăng nhập...")
            # t_start = time.time()
            # driver.get("https://hoadondientu.gdt.gov.vn/")

            #print("đang mở trình duyệt và đăng nhập...")
            # ====================================================================
            # DANG NHAP GDT VOI RETRY: that bai -> dong Chrome, mo lai, login lai
            # ====================================================================
            append_run_log(run_log, "LOGIN_OPEN_SITE_START")
            events.log("LOGIN", message="Dang mo trinh duyet va dang nhap...")

            class DangNhapSai(Exception):
                """Sai MST/mat khau, hoac captcha sai sap cham nguong khoa -> dung han, KHONG retry."""
                pass

            # GDT khoa tai khoan neu nhap sai captcha ~5 lan. Vong retry ngoai x so lan thu
            # captcha trong phien co the cong don -> dem TONG so lan captcha SAI da SUBMIT
            # tren toan bo qua trinh login va dung lai truoc khi cham nguong.
            GIOI_HAN_CAPTCHA_SAI = 4   # tong so lan submit captcha sai toi da (an toan duoi 5)
            wrong_captcha_total = 0

            def _tao_chrome():
                _profile = tempfile.mkdtemp(prefix="chrome_profile_")
                _opts = webdriver.ChromeOptions()
                _opts.add_argument("--headless=new")
                _opts.add_argument("--disable-http2")
                _opts.add_argument("--disable-quic")
                _opts.add_argument("--window-size=1920,1080")
                _opts.add_argument(f"--user-data-dir={_profile}")
                _opts.add_argument("--disable-gpu")
                _opts.add_argument("--no-sandbox")
                _opts.add_argument("--disable-dev-shm-usage")
                _opts.add_argument("--disable-blink-features=AutomationControlled")
                _opts.add_argument("--hide-scrollbars")
                _drv = webdriver.Chrome(
                    service=Service(ChromeDriverManager().install()),
                    options=_opts
                )
                return _drv, _profile

            def _login_mot_lan():
                """Mot lan dang nhap voi Chrome moi.
                Tra ve: token (str) | None (loi tam thoi -> retry) | raise DangNhapSai (vinh vien)."""
                nonlocal wrong_captcha_total
                drv = None
                profile = None
                try:
                    append_run_log(run_log, "CHROME_START")
                    drv, profile = _tao_chrome()
                    append_run_log(run_log, "CHROME_STARTED")

                    set_state("LOGIN", "Dang mo website GDT")
                    heartbeat("Dang mo website GDT", force=True)
                    if not mo_trang_gdt(drv, run_log):
                        return None
                    append_run_log(run_log, "LOGIN_OPEN_SITE_DONE")

                    wait = WebDriverWait(drv, 12)

                    time.sleep(2)
                    close_btns = drv.find_elements(By.CSS_SELECTOR, ".ant-modal-close, .ant-modal-close-x")
                    if close_btns:
                        close_btns[0].click()
                    else:
                        modal_wrap = drv.find_elements(By.CSS_SELECTOR, ".ant-modal-wrap")
                        if modal_wrap:
                            ActionChains(drv).move_to_element_with_offset(modal_wrap[0], 10, 10).click().perform()
                    time.sleep(1)

                    login_btn = wait.until(EC.element_to_be_clickable(
                        (By.XPATH, '//*[@id="__next"]/section/header/div[1]/div/div[7]')
                    ))
                    login_btn.click()
                    time.sleep(2)

                    mst_input = wait.until(EC.element_to_be_clickable(
                        (By.XPATH, '/html/body/div[2]/div/div[2]/div/div[2]/div[2]/form/div/div[1]/div/div[2]/div')
                    ))
                    password_input = wait.until(EC.element_to_be_clickable(
                        (By.XPATH, '/html/body/div[2]/div/div[2]/div/div[2]/div[2]/form/div/div[2]/div/div[2]/div')
                    ))
                    mst_input.click()
                    mst_input.find_element(By.TAG_NAME, "input").send_keys(mst_value)
                    password_input.click()
                    password_input.find_element(By.TAG_NAME, "input").send_keys(password_value)
                    events.log("LOGIN", message=f"Da nhap MST: {mst_value}")
                    status.write({**state, "state": "LOGIN", "message": "Dang dang nhap..."})

                    ocr = ddddocr.DdddOcr(show_ad=False)
                    CAPTCHA_IMG_XPATH = '/html/body/div[2]/div/div[2]/div/div[2]/div[2]/form/div/div[3]/div/div[2]/div/span/div/img'
                    CAPTCHA_INPUT_XPATH = '/html/body/div[2]/div/div[2]/div/div[2]/div[2]/form/div/div[4]/div/div[2]/div'
                    MAX_RETRIES = 4

                    for attempt in range(1, MAX_RETRIES + 1):
                        append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_START")
                        time.sleep(1)

                        # Lay anh captcha - chiu duoc loi tam thoi (timeout/stale)
                        png = None
                        for _cap_try in range(3):
                            try:
                                captcha_img = WebDriverWait(drv, 5).until(
                                    EC.visibility_of_element_located((By.XPATH, CAPTCHA_IMG_XPATH))
                                )
                                png = captcha_img.screenshot_as_png
                                if png:
                                    break
                            except (StaleElementReferenceException, TimeoutException, WebDriverException) as e:
                                append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_IMG_RETRY{_cap_try}: {type(e).__name__}")
                                time.sleep(1.5)
                        if png is None:
                            append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_IMG_MISSING")
                            return None   # anh khong len -> server chet -> mo lai phien moi

                        im = Image.open(io.BytesIO(png)).convert('L')
                        im_con = ImageOps.autocontrast(im, cutoff=15)
                        im_con_big = im_con.resize((im.width * 3, im.height * 3), Image.LANCZOS)
                        buf = io.BytesIO()
                        im_con_big.save(buf, format='PNG')
                        captcha_text = ocr.classification(buf.getvalue()).upper()
                        captcha_text = re.sub(r'[^A-Z0-9]', '', captcha_text)   # bo ky tu rac (vd '一', '-')
                        append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_OCR={captcha_text}")
                        # Captcha GDT = 6 ky tu chu/so. Sai do dai => chac chan OCR doc loi,
                        # doi anh captcha moi roi doc lai - KHONG bam dang nhap (khong tinh vao nguong khoa).
                        if len(captcha_text) != 6:
                            append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_BAD_LEN len={len(captcha_text)}")
                            try:
                                drv.find_element(By.XPATH, CAPTCHA_IMG_XPATH).click()  # bam vao anh -> GDT doi captcha moi
                                time.sleep(0.8)
                            except Exception:
                                pass
                            continue
                        events.log("LOGIN", message=f"Lan thu {attempt}: Ma CAPCHA : {captcha_text} ")

                        # Nhap captcha + bam dang nhap - boc try de loi tam thoi khong vo phien
                        try:
                            cap_input = WebDriverWait(drv, 10).until(
                                EC.element_to_be_clickable((By.XPATH, CAPTCHA_INPUT_XPATH)))
                            cap_input.click()
                            input_el = cap_input.find_element(By.TAG_NAME, "input")
                            input_el.clear()
                            input_el.send_keys(captcha_text)
                            login_btn2 = drv.find_element(
                                By.XPATH, '/html/body/div[2]/div/div[2]/div/div[2]/div[2]/form/div/div[6]/button')
                            login_btn2.click()
                            time.sleep(1.5)
                        except (TimeoutException, StaleElementReferenceException, WebDriverException) as e:
                            append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_INPUT_ERR: {type(e).__name__}")
                            return None   # transient -> mo lai phien moi

                        # Kiem tra ket qua dang nhap
                        try:
                            error_notis = drv.find_elements(By.CLASS_NAME, "ant-notification-notice-message")
                            if error_notis:
                                error_text = error_notis[0].text
                                if "Ma captcha khong dung" in error_text or "Mã captcha không đúng" in error_text:
                                    wrong_captcha_total += 1
                                    append_run_log(run_log, f"CAPTCHA_WRONG_TOTAL={wrong_captcha_total}/{GIOI_HAN_CAPTCHA_SAI}")
                                    if wrong_captcha_total >= GIOI_HAN_CAPTCHA_SAI:
                                        append_run_log(run_log, "CAPTCHA_NEAR_LOCK -> dung de tranh khoa tai khoan GDT")
                                        raise DangNhapSai("captcha_near_lock")
                                    try:
                                        drv.find_element(By.XPATH, CAPTCHA_IMG_XPATH).click()  # doi anh captcha moi
                                        time.sleep(0.8)
                                    except Exception:
                                        pass
                                    continue   # thu captcha moi (van trong phien hien tai)
                                elif "Ten dang nhap hoac mat khau khong dung" in error_text or "Tên đăng nhập hoặc mật khẩu không đúng" in error_text:
                                    append_run_log(run_log, f"CAPTCHA_ATTEMPT_{attempt}_SAI_MK")
                                    raise DangNhapSai("login_failed")
                            if len(drv.find_elements(By.ID, "username")) == 0:
                                status.write({**state, "state": "LOGIN_OK", "message": "Dang nhap thanh cong"})
                                events.log("LOGIN_OK", message="DANG NHAP THANH CONG!")
                                append_run_log(run_log, f"LOGIN_OK_ON_ATTEMPT_{attempt}")
                                break   # thanh cong
                        except StaleElementReferenceException:
                            status.write({**state, "state": "LOGIN_OK", "message": "Dang nhap thanh cong"})
                            events.log("LOGIN_OK", message="DANG NHAP THANH CONG!")
                            append_run_log(run_log, f"LOGIN_OK_ON_ATTEMPT_{attempt}")
                            break   # trang da chuyen -> thanh cong
                    else:
                        append_run_log(run_log, "CAPTCHA_FAILED_ALL")
                        return None   # het luot captcha -> phien moi se co captcha khac

                    # ----- Lay token jwt tu cookie -----
                    time.sleep(2)
                    append_run_log(run_log, "GET_TOKEN_FROM_COOKIE_START")
                    _token = ""
                    for cookie in drv.get_cookies():
                        if cookie['name'] == 'jwt':
                            _token = cookie['value']
                            break
                    append_run_log(run_log, f"GET_TOKEN_DONE has_token={bool(_token)}")
                    return _token or None

                finally:
                    # Dong Chrome + xoa profile DU thanh cong hay loi (tranh ro tien trinh/khoa profile)
                    if drv is not None:
                        try:
                            drv.quit()
                        except Exception:
                            pass
                    if profile:
                        shutil.rmtree(profile, ignore_errors=True)

            # ----- Vong retry ngoai: dong/mo lai Chrome, login lai toi N lan -----
            token = None
            _SO_LAN_LOGIN = 5   # so lan dong/mo lai Chrome khi server GDT chap chon (doi 4 neu muon)
            for _vong in range(1, _SO_LAN_LOGIN + 1):
                append_run_log(run_log, f"LOGIN_OUTER_TRY_{_vong}/{_SO_LAN_LOGIN}")
                try:
                    token = _login_mot_lan()
                    if token:
                        append_run_log(run_log, f"LOGIN_OUTER_OK vong={_vong}")
                        break
                    append_run_log(run_log, f"LOGIN_OUTER_EMPTY vong={_vong}")
                except DangNhapSai as _de:
                    _ly_do = str(_de)
                    if _ly_do == "captcha_near_lock":
                        append_run_log(run_log, "LOGIN_STOP_CAPTCHA_NEAR_LOCK")
                        status.write({**state, "state": "ERROR", "message": "captcha_sai_nhieu_dung_tranh_khoa"})
                        events.log("JOB_ERROR", error="captcha_near_lock")
                        return "captcha_failed"
                    append_run_log(run_log, "LOGIN_SAI_MK -> dung han, khong retry")
                    status.write({**state, "state": "ERROR", "message": "login_failed"})
                    events.log("JOB_ERROR", error="login_failed")
                    return "login_failed"
                except Exception as _e:
                    append_run_log(run_log, f"LOGIN_OUTER_EXC vong={_vong}: {type(_e).__name__}: {_e}")
                if _vong < _SO_LAN_LOGIN:
                    _cho = min(10 * _vong, 40)   # backoff tang dan: 10s, 20s, 30s...
                    append_run_log(run_log, f"LOGIN_OUTER_BACKOFF {_cho}s")
                    time.sleep(_cho)

            if not token:
                append_run_log(run_log, "LOGIN_OUTER_GIVEUP")
                status.write({**state, "state": "ERROR", "message": "login_failed_after_retries"})
                events.log("JOB_ERROR", error="login_failed_after_retries")
                return "login_failed"

            # token co roi -> chay tiep phan export (giu nguyen, van trong khoi if nay)
            if token:


                ds_loai_hd = [
                    {
                        "huong": "RA", "hau_to": "",
                        "url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel",
                        "ttxly": None, "type": None,
                        "search_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/sold",
                        "xml_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml",
                        "search_action": "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)",
                        "xml_action": "Xu%E1%BA%A5t%20xml%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)",
                        "action": "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)",
                    },
                    {
                        "huong": "RA", "hau_to": "_MTT",
                        "url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-excel",
                        "ttxly": None, "type": None,
                        "search_url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/sold",
                        "xml_url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-xml",
                        "search_action": "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20b%C3%A1n%20ra)",
                        "xml_action": "Xu%E1%BA%A5t%20xml%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20b%C3%A1n%20ra)",
                        "action": "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)",
                    },
                    {
                        "huong": "VAO", "hau_to": "_CM",
                        "url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel-sold",
                        "ttxly": "5", "type": "purchase",
                        "search_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/purchase",
                        "xml_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml",
                        "search_action": "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                        "xml_action": "Xu%E1%BA%A5t%20xml%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                        "action": "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                    },
                    {
                        "huong": "VAO", "hau_to": "_KM",
                        "url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel-sold",
                        "ttxly": "6", "type": "purchase",
                        "search_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/purchase",
                        "xml_url": "https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml",
                        "search_action": "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                        "xml_action": "Xu%E1%BA%A5t%20xml%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                        "action": "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)",
                    },
                    {
                        "huong": "VAO", "hau_to": "_MTT",
                        "url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-excel-sold",
                        "ttxly": "8", "type": "purchase",
                        "search_url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/purchase",
                        "xml_url": "https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-xml",
                        "search_action": "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20mua%20v%C3%A0o)",
                        "xml_action": "Xu%E1%BA%A5t%20xml%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20mua%20v%C3%A0o)",
                        "action": "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20mua%20v%C3%A0o)",
                    },
                ]

                if loai_xuat == "ra":
                    ds_loai_hd = [l for l in ds_loai_hd if l["huong"] == "RA"]
                elif loai_xuat == "vao":
                    ds_loai_hd = [l for l in ds_loai_hd if l["huong"] == "VAO"]

                if not os.path.exists(save_dir):
                    os.makedirs(save_dir, exist_ok=True)

                status.write({**state, "state": "DOWNLOAD", "message": "Bat dau tai hoa don"})
                events.log("DOWNLOAD_START", loai_xuat=loai_xuat)

                def make_headers(action):
                    return {
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "vi",
                        "Origin": "https://hoadondientu.gdt.gov.vn",
                        "Referer": "https://hoadondientu.gdt.gov.vn/",
                        "End-Point": "/tra-cuu/tra-cuu-hoa-don",
                        "Action": action,
                    }

                def tai_hd(hd, xml_url, xml_action, huong, thang, sub_dir,  MA_DONVI):
                    """Tai XML+HTML, luu vao sub_dir. Tra ve duong dan XML neu thanh cong."""
                    # Them MST nguoi ban (nbmst) vao ten file de tranh GHI DE:
                    # (khhdon, shdon) chi duy nhat THEO TUNG nguoi ban, nen 2 nha cung
                    # cap khac nhau van co the trung khhdon+shdon -> trung ten file.
                    # Dat nbmst TRUOC khhdon_shdon de logic retry (rsplit("_", 2)) van
                    # lay dung (khhdon, shdon) o 2 phan cuoi.
                    nbmst_an_toan = re.sub(r'[\\/:*?"<>|]', '', str(hd.get('nbmst', '')).strip())
                    ten_base = f"{MA_DONVI}_{huong}_T{thang}_{nbmst_an_toan}_{hd['khhdon']}_{hd['shdon']}"
                    url = f"{xml_url}?nbmst={hd['nbmst']}&khhdon={hd['khhdon']}&shdon={hd['shdon']}&khmshdon={hd['khmshdon']}"
                    headers = make_headers(xml_action)
                    ds_loi_chitiet = []
                    xml_path = None
                    for lan in range(1, 6):
                        try:
                            resp = requests.get(url, headers=headers, timeout=90)
                            if resp.status_code == 200:
                                try:
                                    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                                        for name in zf.namelist():
                                            ext = os.path.splitext(name)[1].lower()
                                            if ext in ('.xml', '.html', '.htm'):
                                                out_path = os.path.join(sub_dir, f"{ten_base}{ext}")
                                                with open(out_path, "wb") as f:
                                                    f.write(zf.read(name))
                                                if ext == '.xml':
                                                    xml_path = out_path
                                except zipfile.BadZipFile:
                                    out_path = os.path.join(sub_dir, f"{ten_base}.xml")
                                    with open(out_path, "wb") as f:
                                        f.write(resp.content)
                                    xml_path = out_path
                                return {"ok": True, "ten_base": ten_base, "xml_path": xml_path}
                            elif resp.status_code == 429:
                                ds_loi_chitiet.append(f"Lan {lan}: HTTP 429")
                                time.sleep(5 * lan)
                                #print(f"      {ten_base}: bi 429, doi {5 * lan}s...")
                                events.log("ERROR",message=f"      {ten_base}: bi 429, doi {5 * lan}s...")
                            elif resp.status_code == 500:
                                try:
                                    err_msg = resp.json().get("message", resp.text[:200])
                                except:
                                    err_msg = resp.text[:200] if resp.text else "Khong co thong tin"
                                if "Không tồn tại hồ sơ gốc" in str(err_msg):
                                    return {"ok": False, "ma": ten_base, "lydo": f"HTTP 500 - {err_msg}"}
                                ds_loi_chitiet.append(f"Lan {lan}: HTTP 500 - {err_msg}")
                                time.sleep(3)
                            elif resp.status_code == 504:
                                try:
                                    err_msg = resp.json().get("message", resp.text[:200])
                                except:
                                    err_msg = resp.text[:200] if resp.text else "Khong co thong tin"
                                ds_loi_chitiet.append(f"Lan {lan}: HTTP 504 - {err_msg}")
                                time.sleep(3)
                            else:
                                return {"ok": False, "ma": ten_base, "lydo": f"HTTP {resp.status_code}"}
                        except Exception as e:
                            ds_loi_chitiet.append(f"Lan {lan}: Exception - {e}")
                            time.sleep(3)
                    return {"ok": False, "ma": ten_base, "lydo": "That bai sau 5 lan thu: " + " | ".join(ds_loi_chitiet)}

                # result = []
                # for thang, tu_ngay, den_ngay in khoang_cach:
                #   for loai in ds_loai_hd:
                result = []
                for thang, tu_ngay, den_ngay in khoang_cach:
                  job_id = f"T{thang}_{nam}_{MA_DONVI}"
                  paths = make_job_paths(save_dir, job_id,MA_DONVI)
                  heartbeat(f"Đang sử lý thang {thang}", force=True, current_month=thang)
                  append_run_log(run_log, f"MONTH_START thang={thang} tu_ngay={tu_ngay} den_ngay={den_ngay}")

                  for loai in ds_loai_hd:
                    heartbeat(
                        f"Đang xử lý {loai['huong']}{loai['hau_to']} T{thang}",
                        force=True,
                        current_month=thang,
                        current_huong=loai["huong"],
                        current_suffix=loai["hau_to"]
                    )
                    append_run_log(run_log, f"TYPE_START thang={thang} huong={loai['huong']} hau_to={loai['hau_to']}")
                    try:
                        search_param = f"tdlap=ge={tu_ngay}T00:00:00;tdlap=le={den_ngay}T23:59:59"
                        if loai["ttxly"]:
                            search_param += f";ttxly=={loai['ttxly']}    "
                        api_url = f"{loai['url']}?sort=tdlap:desc&search={search_param}"
                        if loai["type"]:
                            api_url += f"&type={loai['type']}"

                        headers = {
                            "Authorization": f"Bearer {token}",
                            "Accept": "application/json, text/plain, */*",
                            "Accept-Language": "vi",
                            "Origin": "https://hoadondientu.gdt.gov.vn",
                            "Referer": "https://hoadondientu.gdt.gov.vn/",
                            "End-Point": "/tra-cuu/tra-cuu-hoa-don",
                            "Action": loai["action"],
                        }

                        # Duong dan: raw_dir\MST_MA_DONVI\(MV,BR)\NAM{nam}\HD_xx_Tx
                        huong_dir = "RA" if loai["huong"] == "RA" else "VAO"
                        # sub_dir = os.path.join(paths["raw_dir"], f"{MA_DONVI}_{mst_value}", huong_dir, f"NAM{nam}", f"HD_{huong_dir}_T{thang}")
                        sub_dir = os.path.join(paths["raw_dir"], huong_dir)
                        if not os.path.exists(sub_dir):
                            os.makedirs(sub_dir, exist_ok=True)

                        # Tai file Excel danh sach
                        ten_file = f"HD_{loai['huong']}_{MA_DONVI}_T{thang}{loai['hau_to']}.xlsx"
                        #print(f"Dang tai: HD_{loai['huong']}{loai['hau_to']} ({tu_ngay} -> {den_ngay})")
                        status.write({**state, "state": "EXCEL", "message": f"Tai Excel: HD_{loai['huong']}{loai['hau_to']} T{thang}"})
                        events.log("EXCEL_FETCH", huong=loai['huong'], hau_to=loai['hau_to'], thang=thang)
                        resp = None
                        append_run_log(run_log, f"EXCEL_FETCH_START url={api_url}") ###

                        for lan_thu in range(1, 4):
                            try:                           
                                resp = requests.get(api_url, headers=headers, timeout=90)
                                append_run_log(run_log, f"EXCEL_FETCH_RESPONSE status_code={resp.status_code if resp is not None else 'None'}")
                                if resp.status_code == 200:
                                    break
                            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e_net:
                                #print(f"   [Excel] Lan {lan_thu} timeout/connection: {e_net}")
                                events.log("EXCELL",message=f"   [Excel] Lan {lan_thu} timeout/connection: {e_net}")
                                resp = None
                            time.sleep(3)
                        if resp is not None and resp.status_code == 200:
                            save_path = os.path.join(sub_dir, ten_file)
                            with open(save_path, "wb") as f:
                                f.write(resp.content)
                            #print(f"Da luu: {save_path}")
                            events.log("EXCEL",message=f"Da luu: {save_path}")
                            append_run_log(run_log, f"EXCEL_SAVED {save_path}")
                            result.append(save_path)
                            excel_summary_files.append({
                                "path": save_path,
                                "huong": loai["huong"]
                            })
                        # === Search danh sach hoa don ===
                        headers = make_headers(loai["search_action"])
                        #print(f"\nTim kiem: HD_{loai['huong']}{loai['hau_to']} T{thang}...")
                        ds_hd = []
                        seen_ids = set()
                        page = 0
                        page_state = None

                        while True:
                            search_url = f"{loai['search_url']}?sort=tdlap:desc&size=50&search={search_param}"
                            heartbeat(
                                f"Search danh sach {loai['huong']}{loai['hau_to']} T{thang} trang {page}",
                                current_month=thang,
                                current_page=page
                            )
                            append_run_log(run_log, f"SEARCH_PAGE_START page={page} url={search_url if 'search_url' in locals() else ''}")
                            if page_state:
                                search_url += f"&state={page_state}"
                            resp = None
                            for lan in range(1, 5):
                                try:
                                    resp = requests.get(search_url, headers=headers, timeout=90)
                                    append_run_log(run_log, f"SEARCH_PAGE_RESPONSE page={page} status_code={resp.status_code if resp is not None else 'None'}")
                                    if resp.status_code == 200:
                                        break
                                except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e_net:
                                    #print(f"   [Search] Trang {page} lan {lan} timeout/connection: {e_net}")
                                    resp = None
                                time.sleep(3 * lan)
                            if resp is None or resp.status_code != 200:
                                #print(f"   Loi search trang {page}: {resp.status_code if resp else 'timeout'}")
                                break
                            data = resp.json()
                            datas = data.get("datas", [])
                            total = data.get("total", 0)
                            page_state = data.get("state", None)
                            #if page == 0:
                                #print(f"   Tong so hoa don: {total}")
                            if not datas:
                                break
                            for hd in datas:
                                hd_key = f"{hd.get('khhdon')}_{hd.get('shdon')}"
                                if hd_key not in seen_ids:
                                    seen_ids.add(hd_key)
                                    ds_hd.append(hd)
                            #print(f"   Trang {page}: tong: {len(ds_hd)}/{total}")
                            if total and len(ds_hd) >= total:
                                break
                            if len(datas) < 50:
                                break
                            page += 1
                            time.sleep(1)

                        if not ds_hd:
                            #print(f"   Khong co hoa don nao")
                            continue

                        #print(f"   Tong: {len(ds_hd)} hoa don. Tai XML + HTML (convert song song)...")
                        status.write({**state, "state": "XML", "message": f"Tai XML: HD_{loai['huong']}{loai['hau_to']} T{thang}", "total": len(ds_hd), "downloaded": 0})
                        events.log("XML_FETCH_START", huong=loai['huong'], hau_to=loai['hau_to'], thang=thang, total=len(ds_hd))

                        # Tai tuan tu, push XML vao queue de worker convert song song
                        thanh_cong = 0
                        ds_loi = []
                        xml_paths_cho_excel = {}  # { (khhd, shd): xml_path }
                        for i, hd in enumerate(ds_hd, 1):
                            heartbeat(
                                f"Tai XML {loai['huong']}{loai['hau_to']} T{thang}: {i}/{len(ds_hd)}",
                                total=len(ds_hd),
                                downloaded=i - 1,
                                convert_ok=ket_qua_convert["ok"],
                                convert_err=ket_qua_convert["err"],
                                queue_size=xml_queue.qsize(),
                                current_month=thang,
                                current_huong=loai["huong"]
                            )
                        # for i, hd in enumerate(ds_hd, 1):

                            kq = tai_hd(hd, loai["xml_url"], loai["xml_action"], loai["huong"], thang, sub_dir,  MA_DONVI)
                            if kq["ok"]:
                                append_run_log(run_log, f"XML_OK {kq.get('ten_base','')}")
                            else:
                                append_run_log(run_log, f"XML_FAIL {kq.get('ma','')} reason={kq.get('lydo','')}")

                            time.sleep(1)
                            if kq["ok"]:
                                thanh_cong += 1
                                if kq.get("xml_path"):
                                    xml_paths_cho_excel[(str(hd['khhdon']), str(hd['shdon']))] = kq["xml_path"]
                                    # ma_hd = f"{MA_DONVI}_{mst_value}_{hd['khhdon']}_{hd['shdon']}"
                                    # MỚI:
                                    mst_ph = str(hd.get('nbmst') or mst_value).strip()
                                    # ma_hd = f"{huong}_{mst_ph}_{hd['khhdon']}_{hd['shdon']}"
                                    ma_hd = f"{loai['huong']}_{mst_ph}_{hd['khhdon']}_{hd['shdon']}"
                                    xml_queue.put((
                                        kq["xml_path"], ma_hd, MA_DONVI, mst_value,
                                        loai["huong"], thang, nam, hd['khhdon'], hd['shdon'],
                                        kq["ten_base"]
                                    ))
                            else:
                                ds_loi.append(kq)
                            if i % 10 == 0 or i == len(ds_hd):
                                #print(f"   Da tai {i}/{len(ds_hd)} (OK: {thanh_cong}, Loi: {len(ds_loi)}, Queue convert: {xml_queue.qsize()})")
                                status.write({**state, "state": "XML", "message": f"HD_{loai['huong']}{loai['hau_to']} T{thang}: {i}/{len(ds_hd)}", "total": len(ds_hd), "downloaded": i, "ok": thanh_cong, "err": len(ds_loi), "convert_ok": ket_qua_convert["ok"], "convert_err": ket_qua_convert["err"]})
                                append_run_log(
                                    run_log,
                                    f"XML_PROGRESS {i}/{len(ds_hd)} ok={thanh_cong} err={len(ds_loi)} queue={xml_queue.qsize()} convert_ok={ket_qua_convert['ok']} convert_err={ket_qua_convert['err']}"
                                )

                        # Retry loi
                        if ds_loi:
                            ds_retry = [l for l in ds_loi if "hồ sơ gốc" not in str(l.get("lydo", ""))]
                            if ds_retry:
                                #print(f"   Thu lai {len(ds_retry)} hoa don loi (doi 30s)...")
                                append_run_log(run_log,f"   Thu lai {len(ds_retry)} hoa don loi (doi 30s)...")
                                time.sleep(30)

                                # FIX: Lookup chinh xac theo (khhdon, shdon) - tranh substring match nham
                                hd_index = {(str(h['khhdon']), str(h['shdon'])): h for h in ds_hd}

                                ds_loi_final = []
                                for l in ds_retry:
                                    # FIX: Tach khhdon, shdon tu ten_base thay vi substring search
                                    parts = l["ma"].rsplit("_", 2)
                                    key = (parts[-2], parts[-1]) if len(parts) >= 2 else None
                                    hd_retry = hd_index.get(key) if key else None

                                    if hd_retry:
                                        kq = tai_hd(hd_retry, loai["xml_url"], loai["xml_action"], loai["huong"], thang, sub_dir, MA_DONVI)
                                        time.sleep(2)
                                        if kq["ok"]:
                                            thanh_cong += 1
                                            if kq.get("xml_path"):
                                                # xml_paths_cho_excel[(str(hd_retry['khhdon']), str(hd_retry['shdon']))] = kq["xml_path"]
                                                # ma_hd = f"{MA_DONVI}_{mst_value}_{hd_retry['khhdon']}_{hd_retry['shdon']}"
                                                mst_ph = str(hd_retry.get('nbmst') or mst_value).strip()
                                                ma_hd = f"{loai['huong']}_{mst_ph}_{hd_retry['khhdon']}_{hd_retry['shdon']}"
                                                xml_queue.put((
                                                    kq["xml_path"], ma_hd, MA_DONVI, mst_value,
                                                    loai["huong"], thang, nam, hd_retry['khhdon'], hd_retry['shdon'],
                                                    kq["ten_base"]
                                                ))
                                            #print(f"      Retry OK: {kq['ten_base']}")  # FIX: in ten thuc su retry
                                            append_run_log(run_log, f"      Retry OK: {kq['ten_base']}")
                                        else:
                                            ds_loi_final.append(kq)
                                    else:
                                        ds_loi_final.append(l)
                                ds_loi_500 = [l for l in ds_loi if "hồ sơ gốc" in str(l.get("lydo", ""))]
                                ds_loi = ds_loi_final + ds_loi_500


                        if ds_loi:
                            log_path = os.path.join(paths["job_dir"], f"LOI_TAI_{loai['huong']}{loai['hau_to']}_T{thang}.txt")
                            with open(log_path, "w", encoding="utf-8") as f:
                                for loi in ds_loi:
                                    f.write(f"{loi['ma']} - {loi['lydo']}\n")
                            #print(f"   {len(ds_loi)} hoa don loi, xem: {log_path}")
                            events.log("DOWNLOAD_ERRORS", count=len(ds_loi), huong=loai['huong'], thang=thang)

                        #print(f"   Hoan tat tai: {thanh_cong}/{len(ds_hd)} thanh cong")

                        # Them cot 'Duong dan XML' vao file Excel tai tu server
                        excel_server_path = os.path.join(sub_dir, ten_file)
                        if os.path.exists(excel_server_path):
                            them_cot_xml_path(excel_server_path, xml_paths_cho_excel)

                        result.append(sub_dir)
                    except Exception as e_loai:
                        #print(f"   [BO QUA] Loi xu ly HD_{loai['huong']}{loai['hau_to']} T{thang}: {e_loai}")
                        logging.error(f"Loi HD_{loai['huong']}{loai['hau_to']} T{thang}: {e_loai}", exc_info=True)
                        events.log("LOAI_ERROR", huong=loai['huong'], hau_to=loai['hau_to'], thang=thang, error=str(e_loai))
                        status.write({**state, "state": "LOAI_ERROR", "message": f"Bo qua HD_{loai['huong']}{loai['hau_to']} T{thang}: {e_loai}"})
                        continue

                # === Cho worker parse het queue ===
                # #print(f"\nCho worker parse het XML trong queue ({xml_queue.qsize()} con lai)...")
                # xml_queue.join()
                #print(f"\nCho worker parse het XML trong queue ({xml_queue.qsize()} con lai)...")
                append_run_log(run_log, f"QUEUE_JOIN_START remaining={xml_queue.qsize()}")
                heartbeat("Đang cho Worker parse hết XML", force=True, queue_size=xml_queue.qsize())
                xml_queue.join()
                append_run_log(run_log, "QUEUE_JOIN_DONE")

                stop_signal.set()
                xml_queue.put(None)
                worker.join(timeout=10)

                #print(f"Parse: {ket_qua_convert['ok']} OK, {ket_qua_convert['err']} loi")
                # === Bo sung cac dong trong Excel tong hop KHONG CO XML (chi ap dung cho file VAO_KM) ===
                append_run_log(run_log, f"NO_XML_APPEND_START excel_files={len(excel_summary_files)}")
                heartbeat("Đang bổ sung các dòng không có XML từ Excel tổng hợp", force=True)

                added_master_no_xml, added_line_no_xml = append_non_xml_rows_from_excel_files(
                    excel_file_infos=excel_summary_files,
                    all_master_rows=all_master_rows,
                    all_line_rows=all_line_rows,
                    lock_rows=lock_rows,
                    ma_donvi=MA_DONVI,
                    mst_tra_cuu=mst_value,
                    nam=nam,
                    run_log=run_log
                )
                # added_master_no_xml, added_line_no_xml = append_non_xml_rows_from_excel_files(
                #     excel_file_infos=excel_summary_files,
                #     all_master_rows=all_master_rows,
                #     all_line_rows=all_line_rows,
                #     lock_rows=lock_rows,
                #     run_log=run_log
                # )

                append_run_log(
                    run_log,
                    f"NO_XML_APPEND_DONE master={added_master_no_xml} line={added_line_no_xml}"
                )

                #print(f"Bo sung tu Excel khong XML: master={added_master_no_xml}, line={added_line_no_xml}")

                # === Cap nhat TTHAI_HD tu TAT CA file Excel tong hop (ca VAO va RA) ===
                append_run_log(run_log, f"TTHAI_HD_UPDATE_START excel_files={len(excel_summary_files)}")
                heartbeat("Đang cập nhật trạng thái hóa đơn từ Excel tổng hợp", force=True)

                updated_tthai = update_master_tthai_hd_from_excel_files(
                    excel_file_infos=excel_summary_files,
                    all_master_rows=all_master_rows,
                    lock_rows=lock_rows,
                    run_log=run_log
                )

                append_run_log(run_log, f"TTHAI_HD_UPDATE_DONE updated={updated_tthai}")
                #print(f"Cap nhat TTHAI_HD tu Excel tong hop: {updated_tthai} hoa don")                

                # === Ghi Excel + DBF theo huong ===
                excel_tong = None
                excel_tong_list = []
                stage_dir = paths["stage_dir"]
                os.makedirs(paths["output_dir"], exist_ok=True)

                if all_master_rows or all_line_rows:
                    if loai_xuat == "all":
                        # Tach theo huong, ghi 2 file rieng
                        for h in ["RA", "VAO"]:
                            masters_h = [r for r in all_master_rows if r.get("HUONG") == h]
                            lines_h = [r for r in all_line_rows if r.get("HUONG") == h]
                            if not masters_h and not lines_h:
                                continue
                            excel_path = os.path.join(paths["output_dir"], f"HOA_DON_{h}_{MA_DONVI}.xlsx")
                            #print(f"Dang ghi {len(masters_h)} hoa don + {len(lines_h)} dong hang hoa vao: {excel_path}")
                            append_run_log(run_log, f"WRITE_EXCEL_START path={excel_path} master={len(masters_h)} lines={len(lines_h)}")
                            with pd.ExcelWriter(excel_path) as writer:
                                pd.DataFrame(masters_h).to_excel(writer, sheet_name=f'hoa_don_{h.lower()}', index=False)
                                pd.DataFrame(lines_h).to_excel(writer, sheet_name=f'hoa_don_{h.lower()}_line', index=False)
                            #print(f"Da ghi xong: {excel_path}")

                            events.log("EXCEL_TONG_WRITTEN", path=excel_path, master=len(masters_h), lines=len(lines_h), huong=h)
                            append_run_log(run_log, f"WRITE_EXCEL_DONE path={excel_path}")
                            append_run_log(run_log, f"TO_DBF_STAGE_START excel={excel_path} stage_dir={stage_dir}")
                            # excel_to_exact_dbf(excel_path, stage_dir)
                            append_run_log(run_log, f"TO_DBF_STAGE_DONE excel={excel_path}")
                            excel_tong_list.append(excel_path)
                                       
                        excel_tong = excel_tong_list
                    else:
                        # Chi 1 huong (ra hoac vao)
                        append_run_log(run_log, f"WRITE_EXCEL_START path={excel_tong} master={len(all_master_rows)} lines={len(all_line_rows)}")     
                        huong_label = loai_xuat.upper()
                        excel_tong = os.path.join(paths["output_dir"], f"HOA_DON_{huong_label}_{MA_DONVI}.xlsx")
                        append_run_log(run_log, f"WRITE_EXCEL_START path={excel_tong} master={len(all_master_rows)} lines={len(all_line_rows)}")
                        #print(f"Dang ghi {len(all_master_rows)} hoa don + {len(all_line_rows)} dong hang hoa vao: {excel_tong}")                        

                        # huong_label = loai_xuat.upper()
                        # excel_tong = os.path.join(paths["output_dir"], f"HOA_DON_{huong_label}_{MA_DONVI}.xlsx")
                        # #print(f"Dang ghi {len(all_master_rows)} hoa don + {len(all_line_rows)} dong hang hoa vao: {excel_tong}")

                        append_run_log(run_log, f"WRITE_EXCEL_DONE path={excel_tong}") 
                        with pd.ExcelWriter(excel_tong) as writer:
                            pd.DataFrame(all_master_rows).to_excel(writer, sheet_name=f'hoa_don_{huong_label.lower()}', index=False)
                            pd.DataFrame(all_line_rows).to_excel(writer, sheet_name=f'hoa_don_{huong_label.lower()}_line', index=False)

                        #print(f"Da ghi xong: {excel_tong}")
                        events.log("EXCEL_TONG_WRITTEN", path=excel_tong, master=len(all_master_rows), lines=len(all_line_rows))
                        append_run_log(run_log, f"TO_DBF_STAGE_START excel={excel_tong} stage_dir={stage_dir}")
                        # excel_to_exact_dbf(excel_tong, stage_dir)
                        append_run_log(run_log, f"TO_DBF_STAGE_DONE excel={excel_tong}")

                status.write({
                    **state,
                    "state": "PARSING_DONE",
                    "parse_ok": ket_qua_convert["ok"],
                    "parse_err": ket_qua_convert["err"],
                })
                status.write({
                    **state,
                    "state": "DONE_PARSE",
                    "message": "Da tao DBF stage",
                    "dbf_stage_path": stage_dir,
                    "ready_for_vfp_import": True
                })

                if ket_qua_convert["loi"]:
                    log_convert = os.path.join(paths["job_dir"], "LOI_PARSE.txt")
                    with open(log_convert, "w", encoding="utf-8") as f:
                        for ten, err in ket_qua_convert["loi"]:
                            f.write(f"{ten} - {err}\n")
                    events.log("PARSE_ERRORS", count=len(ket_qua_convert["loi"]), path=log_convert)

                status.write({
                    **state,
                    "state": "DONE_PARSE",
                    "message": "Hoan tat",
                    "alive": False,
                    "pid": os.getpid(),
                    "total_files": len(result),
                    "parse_ok": ket_qua_convert["ok"],
                    "parse_err": ket_qua_convert["err"],
                    "excel_tong": excel_tong,
                    "finished_at": datetime.datetime.now().isoformat(timespec="seconds")
                })
                
                events.log("JOB_DONE", total_files=len(result), parse_ok=ket_qua_convert["ok"], parse_err=ket_qua_convert["err"])
                append_run_log(run_log, f"JOB_DONE total_files={len(result)} parse_ok={ket_qua_convert['ok']} parse_err={ket_qua_convert['err']}")
                return result, excel_tong,{
                                                "status": "DONE_PARSE",
                                                "job_id": paths["job_id"],
                                                "stage_dir": paths["stage_dir"]
                                            }              
                  
                # status.write({**state, "state": "DONE_PARSE", "message": "Hoan tat", "total_files": len(result), "parse_ok": ket_qua_convert["ok"], "parse_err": ket_qua_convert["err"], "excel_tong": excel_tong, "finished_at": datetime.datetime.now().isoformat(timespec="seconds")})
                # events.log("JOB_DONE", total_files=len(result), parse_ok=ket_qua_convert["ok"], parse_err=ket_qua_convert["err"])
                # return result, excel_tong,{
                #                                 "status": "DONE_PARSE",
                #                                 "job_id": paths["job_id"],
                #                                 "stage_dir": paths["stage_dir"]
                #                             }
        except Exception as e:
            import traceback
            tb = traceback.format_exc()

            #print(f"Loi: {e}\n{tb}")
            append_run_log(run_log, f"JOB_ERROR {short_exc(e)}")
            append_run_log(run_log, tb)

            try:
                driver.quit()
            except:
                pass

            try:
                shutil.rmtree(temp_profile_dir, ignore_errors=True)
            except:
                pass

            try:
                stop_signal.set()
                xml_queue.put(None)
            except:
                pass

            logging.error(f"Loi xay ra: {str(e)}", exc_info=True)

            try:
                status.write({
                    **state,
                    "state": "ERROR",
                    "message": str(e),
                    "alive": False,
                    "pid": os.getpid(),
                    "last_error": short_exc(e),
                    "finished_at": datetime.datetime.now().isoformat(timespec="seconds")
                })
                events.log("JOB_ERROR", error=str(e))
            except Exception:
                pass

            return f"error: {str(e)}"
        finally:
            if temp_profile_dir:
                shutil.rmtree(temp_profile_dir, ignore_errors=True)

        # except Exception as e:
        #     #print(f"Loi: {e}")
        #     try:
        #         driver.quit()
        #     except:
        #         pass
        #     shutil.rmtree(temp_profile_dir, ignore_errors=True)
        #     stop_signal.set()
        #     xml_queue.put(None)
        #     logging.error(f"Loi xay ra: {str(e)}", exc_info=True)
        #     try:
        #         status.write({**state, "state": "ERROR", "message": str(e), "finished_at": datetime.datetime.now().isoformat(timespec="seconds")})
        #         events.log("JOB_ERROR", error=str(e))
        #     except Exception:
        #         pass
        #     return f"error: {str(e)}"


# =========================
# CLI
# =========================
CLI_ERROR_LOG = r"C:\test\cli_error.log"

def _log_cli_error(msg):
    try:
        os.makedirs(os.path.dirname(CLI_ERROR_LOG), exist_ok=True)
        with open(CLI_ERROR_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now().isoformat(timespec='seconds')}] {msg}\n")
            f.write(f"  argv: {' '.join(sys.argv)}\n")
    except Exception:
        pass

class LoggingArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        _log_cli_error(f"argparse: {message}")
        super().error(message)

def parse_args(argv):
    p = LoggingArgumentParser(description="Xuat hoa don dien tu + convert XML->Excel song song.")
    p.add_argument("--run", action="store_true")
    p.add_argument("--mst", required=False)
    p.add_argument("--password", required=False)
    p.add_argument("--thang_bd", type=int, required=False)
    p.add_argument("--thang_kt", type=int, required=False)
    p.add_argument("--nam", type=int, required=False)
    p.add_argument("--save_dir", required=False)
    p.add_argument("--ma_donvi", required=False)
    p.add_argument("--status", required=False, help="Duong dan file JSON de ghi trang thai va tien do (co the dung de theo doi qua API tu xa)")
    p.add_argument("--events", required=False, help="Duong dan file JSONL de ghi log su kien (co the dung de theo doi qua API tu xa)")
    p.add_argument("--stagedir", required=False, help="Duong dan folder de luu DBF tam truoc khi import vao VFP")
    p.add_argument("--loai", default="all", choices=["all", "ra", "vao"])
    p.add_argument("--job_id", required=False, help="Ma duy nhat cho job, dung de tracking va luu tru ket qua theo job_id")
    p.add_argument("--to_dbf", action="store_true", help="Tu dong chuyen Excel tong sang DBF sau khi tai xong.")
    p.add_argument("--xml_map", required=False, help="Duong dan file XML_MAP.xlsx")
    p.add_argument("--tu_ngay", required=False, help="Tu ngay")
    p.add_argument("--den_ngay", required=False, help="Den ngay")
    args = p.parse_args(argv)
    # Va #1: uu tien bien moi truong HDDT_PASSWORD (tham so dong lenh lo trong Task Manager)
    if not args.password:
        args.password = os.environ.get("HDDT_PASSWORD", "")
    return args
    # return p.parse_args(argv)

def run_cli(args):
    # Co gang tao run_log som nhat co the
    base_for_log = args.save_dir if args.save_dir else r"C:\test"

    ma_donvi_for_log = args.ma_donvi if args.ma_donvi else "UNKNOWN_DV"
    job_id_for_log = args.job_id if args.job_id else f"NOJOB_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    run_log = os.path.join(base_for_log, ma_donvi_for_log, job_id_for_log, "run.log")

    append_run_log(run_log, f"CLI_START pid={os.getpid()}")
    append_run_log(run_log, f"ARGV={' '.join(sys.argv)}")

    required = {
        "mst": args.mst, "password": args.password,
        "thang_bd": args.thang_bd, "thang_kt": args.thang_kt, "nam": args.nam,
        "save_dir": args.save_dir, "ma_donvi": args.ma_donvi, "job_id": args.job_id,
        "status": args.status, "events": args.events, "stagedir": args.stagedir
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        msg = f"Thieu tham so: {', '.join(missing)}"
        append_run_log(run_log, msg)
        #print(msg, file=sys.stderr)
        _log_cli_error(msg)
        sys.exit(2)

    tc = tra_cuu_hdt()

    try:
        append_run_log(run_log, "GO_INTO_XUAT_HOA_DON")
        res = tc.xuat_hoa_don(
            mst_value=args.mst,
            password_value=args.password,
            thang_bd=args.thang_bd,
            thang_kt=args.thang_kt,
            nam=args.nam,
            save_dir=args.save_dir,
            MA_DONVI=args.ma_donvi,
            loai_xuat=args.loai,
            job_id=args.job_id,
            status=args.status,
            events=args.events,
            stagedir=args.stagedir,
            xml_map_path=args.xml_map,
            tu_ngay=args.tu_ngay,
            den_ngay=args.den_ngay
        )

        append_run_log(run_log, f"XUAT_HOA_DON_RETURN {repr(res)[:1000]}")
        #print(f"Ket qua: {res}")

        if args.to_dbf and isinstance(res, tuple) and len(res) >= 2:
            excel_list = res[1]
            if not isinstance(excel_list, list):
                excel_list = [excel_list]
            for excel_path in excel_list:
                if excel_path and os.path.exists(excel_path):
                    out_dir = os.path.dirname(excel_path)
                    append_run_log(run_log, f"TO_DBF_START excel={excel_path}")
                    #print(f"Dang chuyen DBF: {excel_path} -> {out_dir}")
                    try:
                        # excel_to_exact_dbf(excel_path, out_dir)
                        append_run_log(run_log, f"TO_DBF_DONE excel={excel_path}")
                    except Exception as e:
                        append_run_log(run_log, f"TO_DBF_ERROR {short_exc(e)}")
                        #print(f"Loi chuyen DBF: {e}")

        append_run_log(run_log, "CLI_DONE_OK")

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        append_run_log(run_log, f"CLI_ERROR {short_exc(e)}")
        append_run_log(run_log, tb)
        raise




if __name__ == "__main__":
    try:
        if "--run" in sys.argv:

            args = parse_args(sys.argv[1:])
            run_cli(args)
            #lệnh chạy 
            # PS C:\Project\Python\PYTHON> python TRA_CUU_HDDT_1_3.py --run --mst 0107130530 --password Meva852015@c --thang_bd 3 --thang_kt 3 --nam 2023 --save_dir C:\test --ma_donvi USA_MEVA --loai vao --job_id 1234 --status C:\test\jobs\1234\status.json --events C:\test\jobs\1234\events.jsonl
        elif any(a in sys.argv for a in ["--register", "--unregister", "/regserver", "/unregserver"]):
            # Chi dang ky COM khi co arg tuong ung (tranh chay 2 lan do elevation)
            win32com.server.register.UseCommandLine(tra_cuu_hdt)
        else:
            MST = "0500445938"
            Password = "supT1aA@"
            Thang_bd = 1
            Thang_Kt = 1
            Nam = 2025
            Save_dir = r"C:\test"
            xml_map_path = r"\\Server-test\data_hddt\xml_map.xlsx"
            MA_DONVI = "HUY_THANH"
            Loai_xuat = "all"
            job_id = f"T{Thang_bd}_{Nam}_{MA_DONVI}"
            paths = make_job_paths(Save_dir, job_id,MA_DONVI)
            status = paths["status"]
            events = paths["events"]
            stagedir = paths["stage_dir"]

            result = tra_cuu_hdt.xuat_hoa_don(
                tra_cuu_hdt,
                MST, Password,None,None, Thang_bd, Thang_Kt, Nam, Save_dir, MA_DONVI, job_id,
                status=status,
                events=events,
                stagedir=stagedir,
                loai_xuat=Loai_xuat,
                xml_map_path=xml_map_path
            )            
            # result = tra_cuu_hdt.xuat_hoa_don(
            #     tra_cuu_hdt,
            #     MST, Password, Thang_bd, Thang_Kt, Nam, Save_dir, MA_DONVI, job_id,status=status, events=events,stagedir=stagedir,
            #     loai_xuat=Loai_xuat
            # )
            # excel_to_exact_dbf(result[1], Save_dir)
            #cấu trúc thư mục lưu kết quả:
            # Save_dir/{job_id}/raw/RA|VAO/HD_RA_Tx|HD_VAO_Tx.xlsx
            # Save_dir/{job_id}/stage/HOA_DON.dbf|HOA_DON_LINE.dbf
            # Save_dir/{job_id}/status.json
            # Save_dir/{job_id}/events.jsonl
            #print(f"Ket qua: {result}")
            # Tiến độ sẽ theo dõi qua {save_dir}\jobs\{job_id}\status.json và events.jsonl.
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        #print(f"Loi xay ra: {e}", file=sys.stderr)
        _log_cli_error(f"exception: {e}\n{tb}") 
    finally:
        sys.exit(1)

        #python TRA_CUU_HDDT_1_3.py --run --mst "0107130530" --password "Meva852015@c" --thang_bd "4" --thang_kt "4" --nam "2026" --save_dir "\\SERVER-TEST\D\DATA_HDDT\USA_MEVA\jobs\HDDT_USA_MEVA_20260414150635\" --ma_donvi "USA_MEVA" --status "\\SERVER-TEST\D\DATA_HDDT\USA_MEVA\jobs\HDDT_USA_MEVA_20260414150635\status.json" --loai "vao"  --events "\\SERVER-TEST\D\DATA_HDDT\USA_MEVA\jobs\HDDT_USA_MEVA_20260414150635\events.jsonl"  --job_id HDDT_USA_MEVA_20260414150635 --stagedir "\\SERVER-TEST\D\DATA_HDDT\USA_MEVA\jobs\HDDT_USA_MEVA_20260414150635"
        #"C:\Project\Python\.venv\Scripts\python.exe" "C:\Project\Python\PYTHON\TRA_CUU_HDDT_1_3.py" --run --mst "5300670477" --password "eAzB1aA@" --thang_bd "4" --thang_kt "4" --nam "2026" --save_dir "\\SERVER-HYEN\DATA_HDDT\" --ma_donvi "VINH_HOAN" --status "\\SERVER-HYEN\DATA_HDDT\VINH_HOAN\T4_2026_VINH_HOAN\status.json" --loai "vao" --event "\\SERVER-HYEN\DATA_HDDT\VINH_HOAN\T4_2026_VINH_HOAN\events.jsonl" --job_id "T4_2026_VINH_HOAN" --stagedir "\\SERVER-HYEN\DATA_HDDT\VINH_HOAN\T4_2026_VINH_HOAN\stage\"