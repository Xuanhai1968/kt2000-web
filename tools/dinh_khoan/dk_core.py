# -*- coding: utf-8 -*-
"""
=============================================================================
DK_CORE v3 - Module dùng chung cho bản WEB (SQL Server, Unicode toàn tuyến)
=============================================================================
THAY ĐỔI v2 -> v3:
- BỎ HOÀN TOÀN bảng TCVN3_TO_UNI và tcvn3_to_unicode:
  Input từ SQL Server là NVARCHAR Unicode sạch, không bao giờ là TCVN3.
  QUAN TRỌNG: map cũ có bug khi áp lên Unicode sạch ('à' -> 'ồ',
  'ý' -> 'ỳ'). Bug này vô hại ở bản VFP vì train và predict cùng bị
  đối xứng nhau, nhưng v3 bỏ hẳn cho sạch.
- HỆ QUẢ: feature v3 KHÁC feature v2 -> model_v3.joblib KHÔNG tương thích
  với model_v2.joblib. Bản web dùng MODELS_DIR riêng, KHÔNG trỏ chung
  thư mục với bản VFP.

make_feature() PHẢI giống hệt nhau giữa train.py và predict.py
-> cả hai đều import từ file này, KHÔNG copy riêng.
"""
import re
import unicodedata


VALID_LABELS = {'152', '153', '154', '155', '156', '211', '641'}
# Lưu ý: train.py học bộ lớp từ chính dữ liệu, không hardcode theo set này.
# Khi DATA_TRAIN có đủ mẫu lớp mới (vd 642), model tự mọc thêm lớp.

MODEL_FILE = 'model_v3.joblib'
META_FILE = 'model_v3_meta.json'


def normalize_for_match(text):
    r"""
    Làm sạch text: NFC normalize, lowercase, bỏ ký tự điều khiển,
    gộp khoảng trắng. Dùng cho cả feature building lẫn lookup key.
    (C# port cho cột ten_norm: string.Normalize(NormalizationForm.FormC)
     .ToLowerInvariant() + Regex.Replace(@"\s+", " ").Trim())
    """
    if text is None:
        return ''
    text = str(text)
    text = unicodedata.normalize('NFC', text)
    text = text.lower().strip()
    text = re.sub(r'[\x00-\x1F\x7F-\x9F]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def make_feature(ten, vao_ra, ma_donvi):
    """
    Build chuỗi feature (TÊN, VÀO_RA, MÃ_ĐƠN_VỊ).
    Dạng: "tên đã normalize | __vr_v | __dv_tuan_nga"

    v3: KHÔNG còn tcvn3_to_unicode - input mặc định là Unicode sạch.
    """
    ten_clean = normalize_for_match(ten)

    vr = str(vao_ra).upper().strip()[:1] if vao_ra else 'V'
    vr_token = f"__vr_{vr.lower()}"

    dv = str(ma_donvi).strip().lower().replace(' ', '_') if ma_donvi else 'unknown'
    dv = re.sub(r'[^a-z0-9_]', '_', dv)
    dv_token = f"__dv_{dv}"

    return f"{ten_clean} | {vr_token} | {dv_token}"


def normalize_vao_ra(vr):
    if vr is None:
        return ''
    s = str(vr).upper().strip()
    if s.startswith('V'):
        return 'V'
    if s.startswith('R'):
        return 'R'
    return s


if __name__ == '__main__':
    samples = [
        ("Sơn lót màu vàng", "R", "USA_MEVA"),
        ("Vải cotton trắng", "V", "TUAN_NGA"),
    ]
    for ten, vr, dv in samples:
        print(f'{ten:25s} -> {make_feature(ten, vr, dv)}')
