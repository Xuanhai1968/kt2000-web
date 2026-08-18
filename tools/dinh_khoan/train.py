# -*- coding: utf-8 -*-
"""
=============================================================================
TRAIN v3 (WEB) - thay thế 06_train_only.py + phần train của 02_com_server_v2
=============================================================================
Độc lập hoàn toàn: KHÔNG import 02_com_server_v2, KHÔNG giả lập pythoncom,
KHÔNG database. Pipeline ML GIỮ NGUYÊN bản đã proven 96%:
  TF-IDF (char_wb 3-5 + word 1-2) + LinearSVC(class_weight='balanced')
  + CalibratedClassifierCV(cv=3, sigmoid)

CLI:
  python train.py --input TRAIN_DATA.json --models MODELS_DIR
  python train.py --input DATA_TRAIN.xlsx --models MODELS_DIR

Input nhận 2 dạng (theo đuôi file):
  .json : {"items": [{"ten": "...", "vr": "V", "dv": "TUAN_NGA", "label": "152"}, ...]}
          (C# export từ bảng KT2000_PUB.dbo.DK_DATA_TRAIN, CHỈ status='ACTIVE',
           ORDER BY id ASC - dedup last-write-wins cần thứ tự này)
  .xlsx : sheet đầu tiên, cột TEN_UNI | VAO_RA | MA_DONVI | LABEL
          (để train ngay từ DATA_TRAIN.xlsx hiện tại trong giai đoạn chuyển tiếp)

Output:
  MODELS_DIR/model_v3.joblib       - model (TÊN MỚI, không dùng chung với VFP)
  MODELS_DIR/model_v3_meta.json    - metadata
  MODELS_DIR/last_train_stats.json - stats cho C# đọc
Exit code: 0 = OK, 1 = lỗi.
LƯU Ý: các dòng print giữ KHÔNG DẤU chủ đích (log console codepage cũ).
"""
import sys
import os
import json
import time
import argparse
from datetime import datetime
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dk_core as dk

MIN_CLASS_COUNT = 5   # class < 5 records -> bỏ (không đủ để train)
TEST_SIZE = 0.15


def load_records(input_path):
    """Đọc input -> list (ten, vr, dv, label). Hỗ trợ .json và .xlsx."""
    ext = os.path.splitext(input_path)[1].lower()

    if ext == '.json':
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        rows = [
            (str(it.get('ten') or ''), str(it.get('vr') or 'V'),
             str(it.get('dv') or 'UNK'), str(it.get('label') or ''))
            for it in data.get('items', [])
        ]
    elif ext in ('.xlsx', '.xlsm'):
        import pandas as pd
        df = pd.read_excel(input_path, dtype=str)
        df.columns = [str(c).strip().upper() for c in df.columns]
        df = df.fillna('')

        def find_col(cands):
            for c in cands:
                if c in df.columns:
                    return c
            raise ValueError(f'Khong tim thay cot, can mot trong: {cands}. '
                             f'Co: {list(df.columns)}')

        col_ten = find_col(['TEN_UNI', 'TEN_UNICODE', 'TEN'])
        col_vr = find_col(['VAO_RA', 'V/R', 'VR'])
        col_dv = find_col(['MA_DONVI', 'MA_DV', 'UNIT'])
        col_label = find_col(['LABEL', 'LABEL_DK', 'DK'])
        print(f'[train] Cot map: TEN={col_ten}, VAO_RA={col_vr}, '
              f'MA_DONVI={col_dv}, LABEL={col_label}')
        rows = list(zip(df[col_ten], df[col_vr], df[col_dv], df[col_label]))
    else:
        raise ValueError(f'Khong ho tro duoi file: {ext} (chi .json / .xlsx)')

    # Clean: strip + bỏ dòng thiếu ten/label + chuẩn hóa vr
    records = []
    n_dropped = 0
    for ten, vr, dv, label in rows:
        ten = str(ten).strip()
        label = str(label).strip()
        vr = dk.normalize_vao_ra(vr) or 'V'
        dv = str(dv).strip() or 'UNK'
        if not ten or not label or ten.lower() in ('nan', 'none'):
            n_dropped += 1
            continue
        records.append((ten, vr, dv, label))
    if n_dropped:
        print(f'[train] Loai {n_dropped} dong thieu ten/label')
    return records


def write_stats(models_dir, stats):
    path = os.path.join(models_dir, 'last_train_stats.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f'[train] Stats: {path}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--models', required=True)
    args = ap.parse_args()

    t0 = time.time()
    os.makedirs(args.models, exist_ok=True)
    stats = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'input': args.input,
        'models_dir': args.models,
        'success': False,
    }

    try:
        if not os.path.exists(args.input):
            raise FileNotFoundError(f'Khong tim thay {args.input}')

        print('=' * 70)
        print(f'TRAINING v3 - {args.input} -> {args.models}')
        print('=' * 70)

        # === 1. Đọc data ===
        records = load_records(args.input)
        print(f'[train] {len(records):,} records hop le')

        # === 2. Build feature + label ===
        X = [dk.make_feature(ten, vr, dv) for ten, vr, dv, _ in records]
        y = [label for _, _, _, label in records]

        # Bỏ class quá hiếm
        counts = Counter(y)
        rare = {k for k, v in counts.items() if v < MIN_CLASS_COUNT}
        if rare:
            print(f'[train] Bo class hiem (<{MIN_CLASS_COUNT}): {sorted(rare)}')
            keep = [lab not in rare for lab in y]
            X = [x for x, k in zip(X, keep) if k]
            y = [lab for lab, k in zip(y, keep) if k]

        # Dedup theo feature - last write wins (record mới nhất thắng,
        # nên C# export DK_DATA_TRAIN cần ORDER BY id ASC)
        seen = {}
        for xx, yy in zip(X, y):
            seen[xx] = yy
        X = list(seen.keys())
        y = list(seen.values())
        print(f'[train] Sau dedup: {len(X):,} records, '
              f'{len(set(y))} classes: {sorted(set(y))}')

        if len(X) < 100:
            raise ValueError(f'Qua it data de train: {len(X)} records')

        # === 3. Pipeline (GIỮ NGUYÊN bản proven) ===
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.svm import LinearSVC
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.pipeline import Pipeline, FeatureUnion
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score
        import joblib

        union = FeatureUnion([
            ('char', TfidfVectorizer(
                analyzer='char_wb', ngram_range=(3, 5),
                max_features=200000, min_df=2, sublinear_tf=True,
            )),
            ('word', TfidfVectorizer(
                analyzer='word', ngram_range=(1, 2),
                max_features=50000, min_df=2, sublinear_tf=True,
            )),
        ])
        base = LinearSVC(class_weight='balanced', C=1.0,
                         max_iter=3000, dual='auto')
        clf = CalibratedClassifierCV(base, cv=3, method='sigmoid')
        pipeline = Pipeline([('feat', union), ('clf', clf)])

        # === 4. Split để log accuracy, rồi refit trên toàn bộ ===
        try:
            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y, test_size=TEST_SIZE, random_state=42, stratify=y)
        except ValueError:
            X_tr, X_te, y_tr, y_te = X, [], y, []

        print('[train] Bat dau train...')
        pipeline.fit(X_tr, y_tr)

        accuracy = 0.0
        if X_te:
            accuracy = accuracy_score(y_te, pipeline.predict(X_te))
            print(f'[train] Test acc: {accuracy:.4f} ({len(X_te):,} samples)')
            print('[train] Re-train tren toan bo data...')
            pipeline.fit(X, y)

        # === 5. Lưu model + meta ===
        model_path = os.path.join(args.models, dk.MODEL_FILE)
        joblib.dump(pipeline, model_path)
        meta = {
            'version': 3,
            'feature': 'dk_core.make_feature v3 (Unicode sach, khong TCVN3)',
            'train_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'n_samples': len(X),
            'n_classes': len(set(y)),
            'classes': sorted(set(y)),
            'test_accuracy': round(accuracy, 4),
            'duration_seconds': round(time.time() - t0, 1),
        }
        with open(os.path.join(args.models, dk.META_FILE), 'w',
                  encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        stats.update({
            'success': True,
            'n_samples': len(X),
            'n_classes': len(set(y)),
            'classes': sorted(set(y)),
            'accuracy': round(accuracy, 4),
            'elapsed_sec': round(time.time() - t0, 2),
            'model_path': model_path,
        })
        write_stats(args.models, stats)

        print('=' * 70)
        print(f'XONG. Acc: {accuracy:.4f} | {len(X):,} records | '
              f'{stats["elapsed_sec"]}s')
        print('=' * 70)
        return 0

    except Exception as e:
        import traceback
        print(f'ERROR: {e}')
        print(traceback.format_exc())
        stats['error'] = str(e)
        stats['elapsed_sec'] = round(time.time() - t0, 2)
        try:
            write_stats(args.models, stats)
        except Exception:
            pass
        return 1


if __name__ == '__main__':
    sys.exit(main())
