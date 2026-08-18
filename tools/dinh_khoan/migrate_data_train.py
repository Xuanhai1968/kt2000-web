# -*- coding: utf-8 -*-
"""
=============================================================================
MIGRATE DATA_TRAIN.xlsx -> KT2000_PUB.dbo.DK_DATA_TRAIN  (chạy trên .106)
=============================================================================
Việc chạy MỘT LẦN (+ một lần đổ bù vào ngày cắt chuyển VFP -> web).
An toàn chạy lại: dòng đã tồn tại giống hệt (ten_norm, vao_ra, ma_donvi,
label) sẽ bị bỏ qua (DUPLICATE) — lần chạy bù chỉ những dòng mới lọt vào.

Quy tắc chép:
- Chép NGUYÊN TRẠNG theo thứ tự dòng file (id IDENTITY giữ thứ tự ->
  dedup "last write wins" lúc train vẫn đúng như bản Excel).
- Dòng cùng key khác label (conflict lịch sử) GIỮ CẢ — đúng cách Excel
  đang append; is_conflict = 0, status = 'ACTIVE' (dữ liệu lịch sử coi
  như đã audit bên VFP; luật CHO_GIAI_THICH chỉ áp cho dòng mới từ web).
- Dòng lặp TUYỆT ĐỐI trong file (key + label giống hệt) chỉ chép 1 lần.
- created_by = 'MIGRATE_XLSX' để sau này phân biệt nguồn.

Cách dùng (chạy từ repo root trên server .106):
  1. Xem trước, KHÔNG đụng DB:
     python tools\\dinh_khoan\\migrate_data_train.py --excel docs\\DATA_TRAIN.xlsx --dry-run
  2. Chạy thật:
     python tools\\dinh_khoan\\migrate_data_train.py --excel docs\\DATA_TRAIN.xlsx ^
            --server localhost --db KT2000_PUB --user sa
     (không truyền --password thì script hỏi, gõ không hiện chữ —
      tránh lộ password trong lịch sử lệnh)

Yêu cầu: pip install pyodbc pandas openpyxl
Log: ghi cạnh file Excel: MIGRATE_LOG_<timestamp>.txt
Exit code: 0 = OK, 1 = lỗi.
LƯU Ý: các dòng print giữ KHÔNG DẤU chủ đích (console codepage cũ).
"""
import argparse
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dk_core as dk

BATCH_SIZE = 1000


# ============================================================
# ĐỌC + LÀM SẠCH EXCEL
# ============================================================
def load_and_clean(excel_path):
    """
    Đọc Sheet1, làm sạch, tính ten_norm, bỏ lặp tuyệt đối trong file.
    Trả về (rows, stats): rows = list dict theo đúng thứ tự dòng file.
    """
    import pandas as pd

    df = pd.read_excel(excel_path, sheet_name=0, dtype=str)
    df.columns = [str(c).strip().upper() for c in df.columns]
    df = df.fillna('')

    def find_col(cands, required=True):
        for c in cands:
            if c in df.columns:
                return c
        if required:
            raise ValueError(f'Khong tim thay cot, can mot trong: {cands}. '
                             f'Co: {list(df.columns)}')
        return None

    col_ten = find_col(['TEN_UNI', 'TEN_UNICODE', 'TEN'])
    col_vr = find_col(['VAO_RA', 'V/R', 'VR'])
    col_dv = find_col(['MA_DONVI', 'MA_DV', 'UNIT'])
    col_label = find_col(['LABEL', 'LABEL_DK', 'DK'])
    col_mota = find_col(['MO_TA'], required=False)
    col_notes = find_col(['NOTES'], required=False)

    stats = {
        'total_rows': len(df),
        'dropped_empty': 0,      # thiếu tên hoặc label
        'dropped_bad_vr': 0,     # VAO_RA không phải V/R
        'dropped_dup_exact': 0,  # lặp tuyệt đối trong file
        'kept': 0,
    }

    rows = []
    seen_exact = set()   # (ten_norm, vr, dv, label) — lặp tuyệt đối trong file

    for _, r in df.iterrows():
        ten = str(r[col_ten]).strip()
        label = str(r[col_label]).strip()
        if not ten or not label or ten.lower() in ('nan', 'none'):
            stats['dropped_empty'] += 1
            continue

        vr = dk.normalize_vao_ra(r[col_vr])
        if vr not in ('V', 'R'):
            stats['dropped_bad_vr'] += 1
            continue

        dv = str(r[col_dv]).strip() or 'UNK'
        ten_norm = dk.normalize_for_match(ten)
        key = (ten_norm, vr, dv, label)
        if key in seen_exact:
            stats['dropped_dup_exact'] += 1
            continue
        seen_exact.add(key)

        rows.append({
            'ten_uni': ten[:500],
            'ten_norm': ten_norm[:500],
            'vao_ra': vr,
            'ma_donvi': dv[:50],
            'label': label[:10],
            'mo_ta': (str(r[col_mota]).strip()[:500] or None) if col_mota else None,
            'notes': (str(r[col_notes]).strip()[:500] or None) if col_notes else None,
        })

    stats['kept'] = len(rows)
    return rows, stats


# ============================================================
# DB
# ============================================================
def connect_db(args):
    import pyodbc
    parts = [
        f'DRIVER={{{args.driver}}}',
        f'SERVER={args.server}',
        f'DATABASE={args.db}',
        f'UID={args.user}',
        f'PWD={args.password}',
    ]
    # Driver 18 mặc định bắt mã hóa — với localhost tin chứng chỉ tự ký
    if '18' in args.driver:
        parts.append('TrustServerCertificate=yes')
    conn = pyodbc.connect(';'.join(parts), autocommit=False)
    return conn


def load_existing_keys(cur):
    """Key đã có trong DB — để lần chạy bù bỏ qua dòng cũ."""
    cur.execute('SELECT ten_norm, vao_ra, ma_donvi, label FROM dbo.DK_DATA_TRAIN')
    return {(r[0], r[1], r[2], r[3]) for r in cur.fetchall()}


def insert_rows(conn, rows, existing):
    cur = conn.cursor()
    cur.fast_executemany = True
    sql = ('INSERT INTO dbo.DK_DATA_TRAIN '
           '(ten_uni, ten_norm, vao_ra, ma_donvi, label, mo_ta, notes, created_by) '
           "VALUES (?, ?, ?, ?, ?, ?, ?, 'MIGRATE_XLSX')")

    n_inserted = 0
    n_skipped = 0
    batch = []
    for row in rows:
        key = (row['ten_norm'], row['vao_ra'], row['ma_donvi'], row['label'])
        if key in existing:
            n_skipped += 1
            continue
        batch.append((row['ten_uni'], row['ten_norm'], row['vao_ra'],
                      row['ma_donvi'], row['label'], row['mo_ta'], row['notes']))
        if len(batch) >= BATCH_SIZE:
            cur.executemany(sql, batch)
            n_inserted += len(batch)
            batch = []
            print(f'[migrate] Inserted {n_inserted:,}...')
    if batch:
        cur.executemany(sql, batch)
        n_inserted += len(batch)

    conn.commit()
    return n_inserted, n_skipped


def verify(cur, rows, n_inserted):
    """Đếm chéo + so mẫu vài dòng để chắc chắn không mất/không vỡ chữ."""
    cur.execute("SELECT COUNT(*) FROM dbo.DK_DATA_TRAIN WHERE created_by = 'MIGRATE_XLSX'")
    n_db = cur.fetchone()[0]
    print(f'[verify] DB co {n_db:,} dong created_by=MIGRATE_XLSX')

    ok = True
    # So mẫu: dòng đầu, giữa, cuối của batch vừa đổ
    for i in (0, len(rows) // 2, len(rows) - 1):
        r = rows[i]
        cur.execute(
            'SELECT TOP 1 ten_uni FROM dbo.DK_DATA_TRAIN '
            'WHERE ten_norm = ? AND vao_ra = ? AND ma_donvi = ? AND label = ?',
            r['ten_norm'], r['vao_ra'], r['ma_donvi'], r['label'])
        got = cur.fetchone()
        if got is None:
            print(f'[verify] LOI: khong tim thay dong mau: {r["ten_uni"]!r}')
            ok = False
        elif got[0] != r['ten_uni']:
            # Cho phép lệch nếu key trùng từ dòng khác cùng norm — chỉ cảnh báo
            print(f'[verify] CHU Y: ten_uni khac ban mau (cung key norm):')
            print(f'  FILE: {r["ten_uni"]!r}')
            print(f'  DB  : {got[0]!r}')
    return ok, n_db


# ============================================================
# MAIN
# ============================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--excel', required=True, help='docs\\DATA_TRAIN.xlsx')
    ap.add_argument('--dry-run', action='store_true',
                    help='Chi doc + lam sach + bao so lieu, KHONG dung DB')
    ap.add_argument('--server', default='localhost')
    ap.add_argument('--db', default='KT2000_PUB')
    ap.add_argument('--user', default='sa')
    ap.add_argument('--password', default=None)
    ap.add_argument('--driver', default='ODBC Driver 17 for SQL Server')
    args = ap.parse_args()

    t0 = time.time()
    if not os.path.exists(args.excel):
        print(f'ERROR: Khong tim thay {args.excel}')
        return 1

    print('=' * 70)
    print(f'MIGRATE {args.excel} -> {args.db}.dbo.DK_DATA_TRAIN')
    print('=' * 70)

    try:
        rows, stats = load_and_clean(args.excel)
    except Exception as e:
        print(f'ERROR doc Excel: {e}')
        return 1

    print(f'[clean] Tong dong file      : {stats["total_rows"]:,}')
    print(f'[clean] Bo thieu ten/label  : {stats["dropped_empty"]:,}')
    print(f'[clean] Bo VAO_RA khong V/R : {stats["dropped_bad_vr"]:,}')
    print(f'[clean] Bo lap tuyet doi    : {stats["dropped_dup_exact"]:,}')
    print(f'[clean] Se dua vao DB       : {stats["kept"]:,}')

    if args.dry_run:
        print('\n[dry-run] 5 dong mau (ten_uni | vr | dv | label | ten_norm):')
        for r in rows[:5]:
            print(f'  {r["ten_uni"][:40]:42s} | {r["vao_ra"]} | '
                  f'{r["ma_donvi"]:12s} | {r["label"]:4s} | {r["ten_norm"][:40]}')
        print('\n[dry-run] XONG - chua dung den DB. Bo --dry-run de chay that.')
        return 0

    if not args.password:
        import getpass
        args.password = getpass.getpass(f'Password cho {args.user}@{args.server}: ')

    try:
        conn = connect_db(args)
        cur = conn.cursor()
        # Bảng phải tồn tại trước (chạy KT2000_PUB_schema.sql trước script này)
        cur.execute("SELECT COUNT(*) FROM sys.tables WHERE name = 'DK_DATA_TRAIN'")
        if cur.fetchone()[0] == 0:
            print('ERROR: Chua co bang DK_DATA_TRAIN. '
                  'Chay KT2000_PUB_schema.sql truoc!')
            return 1

        existing = load_existing_keys(cur)
        print(f'[db] Da co san {len(existing):,} key trong DK_DATA_TRAIN')

        n_inserted, n_skipped = insert_rows(conn, rows, existing)
        print(f'[migrate] Inserted: {n_inserted:,} | Skipped (da ton tai): {n_skipped:,}')

        ok, n_db = verify(cur, rows, n_inserted)
        conn.close()

        elapsed = round(time.time() - t0, 1)
        # Ghi log cạnh file Excel
        log_path = os.path.join(
            os.path.dirname(os.path.abspath(args.excel)),
            f'MIGRATE_LOG_{datetime.now():%Y%m%d_%H%M%S}.txt')
        with open(log_path, 'w', encoding='utf-8') as f:
            f.write(f'Migrate {args.excel} -> {args.db}.dbo.DK_DATA_TRAIN\n')
            f.write(f'Thoi diem : {datetime.now():%Y-%m-%d %H:%M:%S}\n')
            f.write(f'Tong dong file      : {stats["total_rows"]:,}\n')
            f.write(f'Bo thieu ten/label  : {stats["dropped_empty"]:,}\n')
            f.write(f'Bo VAO_RA khong V/R : {stats["dropped_bad_vr"]:,}\n')
            f.write(f'Bo lap tuyet doi    : {stats["dropped_dup_exact"]:,}\n')
            f.write(f'Inserted            : {n_inserted:,}\n')
            f.write(f'Skipped (ton tai)   : {n_skipped:,}\n')
            f.write(f'DB (MIGRATE_XLSX)   : {n_db:,}\n')
            f.write(f'Thoi gian           : {elapsed}s\n')
        print(f'[log] {log_path}')
        print('=' * 70)
        print(f'XONG trong {elapsed}s - Verify {"OK" if ok else "CO CANH BAO, doc lai log"}')
        print('=' * 70)
        return 0 if ok else 1

    except Exception as e:
        import traceback
        print(f'ERROR: {e}')
        print(traceback.format_exc())
        return 1


if __name__ == '__main__':
    sys.exit(main())
