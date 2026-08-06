namespace KT2000.Api.Services
{
    // AD-NB-04 / AD-NB-05 — CẮT GỌT INSTANCE NB.
    //
    // Một bản publish chạy hai Windows Service khác cấu hình:
    //   KT2000Api    cổng 5000, Mode để trống  -> bản thuế, chạy trong LAN + WireGuard
    //   KT2000NbApi  cổng 5001, Mode=NB        -> bản nội bộ, bản DUY NHẤT phơi ra internet
    //
    // Vì instance NB nằm ngoài internet, nó phải là bản bị cắt gọt:
    //   1. Chỉ chấp nhận phiên đăng nhập của tenant_type='noibo'
    //   2. Toàn bộ endpoint quản trị / console thuế trả 404
    //
    // VÌ SAO 404 CHỨ KHÔNG 403: 403 xác nhận "endpoint này CÓ tồn tại, chỉ là bạn không
    // được vào" — trên internet đó là thông tin thừa cho người dò. 404 thì cửa coi như
    // không có. Riêng phần chặn theo tenant_type vẫn trả 403 vì đó là người dùng hợp lệ
    // đăng nhập nhầm chỗ, cần biết lý do để còn quay về bản LAN.
    public class NbModeGuard
    {
        private readonly RequestDelegate _next;
        private readonly bool _laNb;

        // Tiền tố các nhóm endpoint KHÔNG được tồn tại trên instance NB.
        // /api/admin  = console quản trị đơn vị + nạp hóa đơn TCT (chỉ chạy trong LAN
        //               theo mục 5: tạo/sửa tenant, cấp user, mở năm CHỈ qua MDN_NB)
        // /swagger    = không phơi bản đồ API ra internet
        private static readonly string[] CamTrenNb =
        {
            "/api/admin",
            "/swagger",
        };

        public NbModeGuard(RequestDelegate next, IConfiguration config)
        {
            _next = next;
            // Cờ đọc từ appsettings của riêng instance — cùng EXE, khác cấu hình
            _laNb = string.Equals(config["Mode"], "NB", StringComparison.OrdinalIgnoreCase);
        }

        public async Task InvokeAsync(HttpContext ctx)
        {
            if (!_laNb) { await _next(ctx); return; }   // instance thuế: không đụng gì

            var path = ctx.Request.Path.Value ?? "";

            // (2) Endpoint quản trị coi như không tồn tại trên bản internet
            if (CamTrenNb.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
            {
                ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            // (1) Phiên đăng nhập phải là tenant nội bộ. Chỉ soát khi ĐÃ có danh tính:
            // request chưa đăng nhập cứ để [Authorize] của endpoint xử theo lệ thường,
            // nếu không thì chính màn hình login (/api/auth/...) cũng bị chặn.
            if (ctx.User?.Identity?.IsAuthenticated == true)
            {
                var loai = ctx.User.FindFirst("tenant_type")?.Value;
                if (loai != "noibo")
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new
                    {
                        message = "Máy chủ này chỉ phục vụ đơn vị nội bộ. " +
                                  "Dữ liệu kế toán thuế truy cập qua bản trong mạng nội bộ."
                    });
                    return;
                }
            }

            await _next(ctx);
        }
    }
}
