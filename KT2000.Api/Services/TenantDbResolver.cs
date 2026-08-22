using Microsoft.Data.SqlClient;
using System.Text.RegularExpressions;

namespace KT2000.Api.Services
{
    // CỬA DUY NHẤT ghép tên database đơn vị-năm (quyết định 24-07 trong Nhật ký).
    // CẤM mọi nơi khác tự ghép chuỗi tên DB — review PR thấy là trả về sửa.
    public class TenantDbResolver
    {
        private readonly IConfiguration _config;
        public TenantDbResolver(IConfiguration config) => _config = config;

        // BR-DB-01: A-Z đầu, chỉ A-Z 0-9 _, dài 3-30, không kết thúc bằng _
        public static bool IsValidCode(string? code) =>
            code != null && Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{1,28}[A-Z0-9]$");

        public string BuildDbName(string code, int year)
        {
            if (!IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ (chỉ A-Z, 0-9, dấu _)");
            if (year < 2000 || year > 2100)
                throw new ArgumentException("Năm không hợp lệ");
            return $"{code}_{year}";
        }

        public string GetMasterConnection() =>
            _config.GetConnectionString("DefaultConnection")!;

        // Database DANH MỤC dùng chung của khối khai thuế: DM_KH, DM_HANG, DM_TK…
        // Dùng chung là CỐ Ý (chốt Trường 13/08) — danh mục này để mọi đơn vị khai thuế
        // tham khảo. Đơn vị nào cần danh mục riêng thì đã tách hẳn sang bản NB (mã kết
        // thúc bằng _NB), có bộ DM_KH_NB / DM_HANG_NB riêng trong database đơn vị.
        //
        // Tên database nằm ở ĐÂY, không rải trong service (luật #1: mọi tên database chỉ
        // được sinh qua resolver).
        public string GetBaseConnection()
        {
            var b = new SqlConnectionStringBuilder(GetMasterConnection())
            { InitialCatalog = "KT2000_Base" };
            return b.ConnectionString;
        }

        // Database CHUNG của máy học định khoản: DK_DATA_TRAIN, DK_BLACKLIST,
        // DK_AUDIT_LOG (schema của Leader, commit 127f9408).
        //
        // Vì sao KHÔNG nằm trong database đơn vị: model định khoản là model CHUNG toàn
        // hệ thống — mã đơn vị chỉ là MỘT ĐẶC TRƯNG của nó. Chia dữ liệu huấn luyện về
        // từng đơn vị là chặt đứt cái đang làm nó đoán được: đơn vị mới tinh vẫn đoán
        // đúng nhờ học từ tên hàng của mọi đơn vị khác.
        //
        // TỪ 22/08 CÒN GIỮ BẢNG TOKHAI (dời từ KT2000_Base, xem script 028).
        // Base ở lại đúng vai DANH MỤC tra cứu (DM_TK, DM_HANG, DM_KH…) — thứ mọi đơn
        // vị cùng đọc và hiếm khi đổi. TOKHAI là dữ liệu nghiệp vụ tích lũy theo kỳ,
        // vòng đời và nhịp sao lưu khác hẳn, nên về PUB cùng nhóm dữ liệu tích lũy.
        // ĐỌC/GHI TOKHAI phải qua hàm này, KHÔNG phải GetBaseConnection.
        public string GetPubConnection()
        {
            var b = new SqlConnectionStringBuilder(GetMasterConnection())
            { InitialCatalog = "KT2000_PUB" };
            return b.ConnectionString;
        }

        // Connection đến database của (đơn vị, năm) — dựng từ connection Master,
        // chỉ thay tên database
        public string GetTenantConnection(string code, int year)
        {
            var b = new SqlConnectionStringBuilder(GetMasterConnection())
            { InitialCatalog = BuildDbName(code, year) };
            return b.ConnectionString;
        }
    }
}