# -*- coding: utf-8 -*-
"""
=============================================================================
PREDICT v3 (WEB) - JSON vào -> JSON ra. Thay thế 04_predict_pipeline.py
=============================================================================
Python là "PRG thuần túy": KHÔNG mở database. C# Worker lo toàn bộ I/O
với SQL Server (SELECT DISTINCT dòng chưa định khoản -> ghi INPUT.json,
đọc OUTPUT.json -> UPDATE HOA_DON_LINE từng tenant).

Vì tất cả tenant gộp chung 1 lần gọi (model load 1 lần), field "dv"
chính là mã đơn vị - vẫn là feature của model như bản VFP.

CLI:
  python predict.py --input INPUT.json --output OUTPUT.json
                    --models MODELS_DIR [--threshold 0.70]

INPUT.json (C# ghi, UTF-8):
{
  "items": [
    {"id": "TENANT01|12345", "ten": "Vải cotton trắng", "vr": "V", "dv": "TUAN_NGA",
     "allow": ["152", "641"]},
    ...
  ]
}
  - id : chuỗi bất kỳ, C# tự đặt để map ngược (opaque với Python)
  - ten: tên hàng Unicode (từ cột NVARCHAR của HOA_DON_LINE)
  - vr : 'V' (đầu vào) / 'R' (đầu ra)
  - dv : mã đơn vị
  - allow (TÙY CHỌN): bộ tài khoản đơn vị này được phép dùng. Có thì model
    chọn nhãn xác suất cao nhất TRONG bộ đó; thiếu/rỗng thì đoán tự do
    trong cả 7 nhãn. Dùng để đơn vị thương mại không nhận phải nhãn
    "thành phẩm" học từ một đơn vị sản xuất nào đó (chốt Trường 20/08).

OUTPUT.json:
{
  "success": true, "n": 120, "n_auto": 100, "n_review": 20,
  "threshold": 0.70, "model": ".../model_v3.joblib", "elapsed_sec": 1.2,
  "results": [
    {"id": "TENANT01|12345", "label": "156", "conf": 0.9876, "auto": 1},
    ...
  ]
}
Lỗi -> {"success": false, "error": "..."} + exit code 1.
Item có "ten" rỗng -> không predict, trả {"id", "label": "", "conf": 0,
"auto": 0, "skip": "EMPTY_NAME"}.

Exit code: 0 = OK, 1 = lỗi (C# check exit code TRƯỚC, rồi đọc JSON).
LƯU Ý: các dòng print giữ KHÔNG DẤU chủ đích - console qua Task
Scheduler/Windows Service hay rơi vào codepage cũ, chữ có dấu vỡ log.
"""
import sys
import os
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dk_core as dk

DEFAULT_THRESHOLD = 0.70


def write_output(path, payload):
    out_dir = os.path.dirname(path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--models', required=True)
    ap.add_argument('--threshold', type=float, default=DEFAULT_THRESHOLD)
    args = ap.parse_args()

    t0 = time.time()
    try:
        if not (0 <= args.threshold <= 1):
            raise ValueError(f'threshold {args.threshold} phai trong [0, 1]')

        # === 1. Đọc input ===
        with open(args.input, 'r', encoding='utf-8') as f:
            data = json.load(f)
        items = data.get('items', [])
        print(f'[predict] Input: {len(items)} items')

        if not items:
            write_output(args.output, {
                'success': True, 'n': 0, 'n_auto': 0, 'n_review': 0,
                'threshold': args.threshold, 'model': '',
                'elapsed_sec': round(time.time() - t0, 2), 'results': [],
            })
            print('[predict] Khong co item nao. Xong.')
            return 0

        # === 2. Load model (import nặng để ở đây cho --help nhanh) ===
        import joblib
        import numpy as np

        model_path = os.path.join(args.models, dk.MODEL_FILE)
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f'Khong co model tai {model_path}. Chay train.py truoc! '
                f'(LUU Y: ban web dung {dk.MODEL_FILE}, KHONG dung chung '
                f'model_v2.joblib cua ban VFP - feature khac nhau)'
            )
        print(f'[predict] Load model {model_path}')
        model = joblib.load(model_path)
        classes = model.classes_

        # === 3. Build feature + predict batch ===
        idx_predict = []      # vị trí item có tên hợp lệ
        features = []
        results = [None] * len(items)

        for i, it in enumerate(items):
            ten = str(it.get('ten') or '').strip()
            if not ten:
                results[i] = {'id': it.get('id'), 'label': '', 'conf': 0.0,
                              'auto': 0, 'skip': 'EMPTY_NAME'}
                continue
            idx_predict.append(i)
            features.append(dk.make_feature(ten, it.get('vr', 'V'),
                                            it.get('dv', 'UNK')))

        n_auto = 0
        n_review = 0
        n_gioi_han = 0
        if features:
            print(f'[predict] Predict batch ({len(features)} items)...')
            # Vị trí của từng nhãn trong classes_, để lọc theo "allow" cho nhanh.
            vi_tri = {str(c): j for j, c in enumerate(classes)}
            probas = model.predict_proba(features)
            for i, p in zip(idx_predict, probas):
                # "allow" (tùy chọn, C# gửi xuống): bộ tài khoản mà ĐƠN VỊ NÀY được phép
                # dùng. Model là model chung học từ mọi đơn vị, nên không chặn thì một
                # đơn vị thương mại có ngày nhận nhãn "thành phẩm" học từ đơn vị sản
                # xuất - sổ của họ không có khái niệm đó.
                # Thiếu "allow", rỗng, hay toàn nhãn model không biết -> đoán tự do như
                # cũ. Thà đoán rộng còn hơn không đoán được gì.
                allow = items[i].get('allow') or []
                cho_phep = [vi_tri[a] for a in allow if a in vi_tri]
                if cho_phep:
                    top = max(cho_phep, key=lambda j: p[j])
                    n_gioi_han += 1
                else:
                    top = int(np.argmax(p))
                # conf là xác suất THẬT của nhãn đã chọn, KHÔNG chuẩn hóa lại trong bộ
                # cho phép: conf thấp chính là tín hiệu "model muốn chọn cái khác nhưng
                # bị chặn" - đó là thứ người dùng cần thấy để soi.
                conf = float(p[top])
                is_auto = 1 if conf >= args.threshold else 0
                n_auto += is_auto
                n_review += 1 - is_auto
                results[i] = {
                    'id': items[i].get('id'),
                    'label': str(classes[top]),
                    'conf': round(conf, 4),
                    'auto': is_auto,
                }

        # === 4. Ghi output ===
        elapsed = round(time.time() - t0, 2)
        write_output(args.output, {
            'success': True,
            'n': len(items),
            'n_auto': n_auto,
            'n_review': n_review,
            'threshold': args.threshold,
            'model': model_path,
            'elapsed_sec': elapsed,
            'results': results,
        })

        print(f'[predict] AUTO: {n_auto} | REVIEW: {n_review} | '
              f'skip: {len(items) - len(features)} | gioi han: {n_gioi_han} | {elapsed}s')
        print(f'[predict] Output: {args.output}')
        return 0

    except Exception as e:
        import traceback
        print(f'ERROR: {e}')
        print(traceback.format_exc())
        try:
            write_output(args.output, {'success': False, 'error': str(e)})
        except Exception:
            pass
        return 1


if __name__ == '__main__':
    sys.exit(main())
