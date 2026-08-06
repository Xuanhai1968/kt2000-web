-- 014_users_mat_khau_ban_dau.sql — Cho admin xem lại mật khẩu BAN ĐẦU (chốt 06/08)
--
-- Bối cảnh: admin là người cấp mật khẩu nên cần xem lại để đọc cho nhân viên.
-- Nhưng PasswordHash là băm BCrypt một chiều, không mở ra được. Vì vậy lưu thêm
-- riêng bản mật khẩu ban đầu, MÃ HÓA hai chiều bằng Data Protection.
--
-- BA RÀNG BUỘC làm cửa sổ rủi ro hẹp nhất có thể:
--   1. Chỉ giữ mật khẩu do ADMIN đặt (lúc tạo user hoặc lúc reset) — không bao giờ
--      giữ mật khẩu người dùng tự chọn.
--   2. XÓA VỀ NULL ngay khi người dùng tự đổi (AuthService.DoiMatKhau). Đổi rồi là
--      admin hết xem được — đúng yêu cầu.
--   3. API đọc chỉ trả khi MustChangePassword = 1, và chỉ cho is_admin.
--
-- Rủi ro còn lại, nói thẳng: ai lấy được database VÀ khóa dp-keys thì đọc được mật
-- khẩu của những user CHƯA kịp đăng nhập lần đầu. Đó là cái giá của tiện lợi; mật
-- khẩu của user đang dùng thật vẫn an toàn tuyệt đối vì chỉ tồn tại dạng băm.

USE KT2000_Master;
GO

IF COL_LENGTH('Users', 'MatKhauBanDauMaHoa') IS NULL
    ALTER TABLE Users ADD MatKhauBanDauMaHoa NVARCHAR(MAX) NULL;
GO

-- User đã đổi mật khẩu từ trước thì không có gì để giữ
UPDATE Users SET MatKhauBanDauMaHoa = NULL WHERE MustChangePassword = 0;
GO

SELECT LoginName, IsActive, MustChangePassword,
       CASE WHEN MatKhauBanDauMaHoa IS NULL THEN N'--' ELSE N'con xem duoc' END AS MatKhauBanDau
FROM Users ORDER BY LoginName;
GO
