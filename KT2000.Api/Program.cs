using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using KT2000.Api.Data;
using KT2000.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService();   // chạy được như Windows Service (dev không ảnh hưởng)

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure()));

builder.Services.AddScoped<AuthService>();
// SoChuaMoFilter: đơn vị chưa mở sổ của năm đang chọn thì trả 409 kèm lời nhắn, thay
// vì để SqlException 4060 lộ nguyên stack trace 500 ra trình duyệt.
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
    o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
});
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProviderOptions>(
    o => o.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProviderOptions>(
    o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

builder.Services.AddControllers(o => o.Filters.Add<SoChuaMoFilter>());
builder.Services.AddSingleton<TenantDbResolver>();
// Singleton vì nó NHỚ database nào đã đủ phiên bản — để scoped thì mỗi request quên
// sạch rồi hỏi lại database, mất đúng cái đường nhanh khiến nó gọi được ở nhiều lối vào.
builder.Services.AddSingleton<VaCauTrucService>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<DanhMucService>();  // DM_KH / DM_HANG trong KT2000_Base
builder.Services.AddScoped<DoiChieuService>();
// Đối chiếu bảng kê gốc (IN_VALUE) với sổ khi lập tờ khai — CHỈ ĐỌC.
builder.Services.AddScoped<DoiChieuInValue>();  // bản gốc TCT: IN_VALUE / IN_VALUE_LINE
builder.Services.AddScoped<ImportService>();
builder.Services.AddScoped<NoiBoService>();   // phần nội bộ: danh mục + phiếu xuất/nhập
builder.Services.AddScoped<ThueService>();    // sổ thuế: đọc HOA_DON của đơn vị đang đăng nhập
builder.Services.AddScoped<HopDongService>();  // nhân sự + HĐLĐ trong DB đơn vị-năm
builder.Services.AddScoped<ChamCongService>();  // chấm công + bảng lương, cùng DB đơn vị-năm
builder.Services.AddScoped<ExcelLuongService>();  // nhập chấm công/lương từ file Excel
builder.Services.AddScoped<RaSoatService>();  // đối chiếu file vs sổ trước khi khai thuế — CHỈ ĐỌC
builder.Services.AddScoped<ToKhaiService>();  // lập tờ khai 01/GTGT — CHỈ ĐỌC
builder.Services.AddScoped<ToKhaiHaiQuanService>();
// Ghi tổng tờ khai hải quan vào sổ — CÓ CỜ, mặc định TẮT (HaiQuan:GhiVaoSo).
builder.Services.AddScoped<HaiQuanVaoSo>();  // đọc thuế GTGT hàng nhập khẩu ([23a]/[24a]) — CHỈ ĐỌC
// Viên gạch tồn kho dùng chung (SPEC-BAO-CAO-TON-KHO mục 3) — CHỈ ĐỌC, BR-BC-01.
// Mọi module cần số tồn kho gọi qua đây, không module nào tự viết lại công thức.
builder.Services.AddScoped<TonKhoService>();
builder.Services.AddScoped<DinhKhoanService>();
// Data Training dùng chung của định khoản (KT2000_PUB) — TÁCH khỏi DinhKhoanService vì nó
// nói chuyện với database khác hẳn: Data Training chung toàn hệ thống, không phải sổ đơn vị.
builder.Services.AddScoped<DkPubService>();
// Máy đoán định khoản: gọi predict.py rồi ghi nhãn xuống sổ đơn vị.
builder.Services.AddScoped<DkPredictService>();
// Viên gạch CHỐT (BR-CDK-08). Điều phối hai service trên theo thứ tự bắt buộc: sửa sổ
// TRƯỚC, đọc lại sổ, rồi mới đẩy vào kho học. Mọi đường chốt phải đi qua đây — controller
// không được tự xâu chuỗi ba bước đó (luật 14).
builder.Services.AddScoped<ChotDinhKhoanService>();
// Huấn luyện lại model. Tách khỏi DkPredictService vì là việc hằng TUẦN, nặng, và ghi
// đè model dùng chung cho MỌI đơn vị — không phải việc gọi nhầm được.
builder.Services.AddScoped<DkTrainService>();
builder.Services.AddScoped<BangToKhaiService>();  // bảng tờ khai nhiều đơn vị (MDN_NB) — CHỈ ĐỌC
// CÓ GHI (khác ba service trên): đánh dấu ghi_chu cho HĐ thay thế/điều chỉnh khác kỳ.
builder.Services.AddScoped<GhiChuHdLienQuan>();
builder.Services.AddMemoryCache(o => o.SizeLimit = 500);

// Mật khẩu cổng TCT mã hóa hai chiều bằng Data Protection. Khóa PHẢI lưu ra đĩa:
// mặc định nó nằm trong profile người dùng và đổi theo tài khoản chạy tiến trình —
// chuyển sang chạy Windows Service sẽ ra khóa khác, mọi mật khẩu đã lưu thành rác.
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(
        Path.Combine(AppContext.BaseDirectory, "dp-keys")))
    .SetApplicationName("KT2000");

// Singleton: giữ tiến độ phiên lấy HĐ trong bộ nhớ và bảo đảm mỗi lúc chỉ một Chrome
builder.Services.AddSingleton<TctFetchService>();

// ---- MỚI: dạy backend cách KIỂM TRA JWT (trước giờ mới chỉ biết PHÁT) ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;   // giữ nguyên tên claim như lúc phát
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ValidateLifetime = true
        };
    });
builder.Services.AddAuthorization();

// Cổng 5173 = Vite dev server (vite.config.ts). Chỉ có tác dụng lúc chạy DEV: bản
// publish để frontend tĩnh trong wwwroot nên cùng gốc, không đi qua CORS.
// Đổi cổng dev thì phải đổi cả ba chỗ: đây, vite.config.ts, và "Urls" trong appsettings.
builder.Services.AddCors(o => o.AddPolicy("AllowReact", p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()
     .WithExposedHeaders("X-Da-Luu", "X-Duong-Dan", "X-Loi-Luu")));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseResponseCompression();

app.UseCors("AllowReact");

app.UseAuthentication();   // MỚI: soát "con dấu" trên JWT của mỗi request

// AD-NB-04/05: cắt gọt instance NB (cờ "Mode": "NB" trong appsettings của instance đó).
// PHẢI đứng SAU UseAuthentication — nó đọc claim tenant_type, mà claim chỉ có sau khi
// JWT đã được soát. Đứng trước UseAuthorization để chặn từ sớm, khỏi chạy vào endpoint.
app.UseMiddleware<KT2000.Api.Services.NbModeGuard>();

app.UseAuthorization();    // MỚI: đối chiếu yêu cầu [Authorize] của endpoint
app.UseDefaultFiles();   // vào / thì trả index.html
app.UseStaticFiles();    // phục vụ file trong wwwroot (bản build React)
app.MapControllers();
app.MapFallbackToFile("index.html");  // URL kiểu /app/don-vi (route React) → trả index.html
// Cổng KHÔNG ghim ở đây: lấy từ khóa "Urls" trong appsettings.json (hiện là 5000),
// nhờ vậy bản publish chạy Windows Service đổi cổng được mà không phải build lại.
app.Run();