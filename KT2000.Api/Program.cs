using Microsoft.AspNetCore.Authentication.JwtBearer;
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
builder.Services.AddControllers();
builder.Services.AddSingleton<TenantDbResolver>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<ImportService>();

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

builder.Services.AddCors(o => o.AddPolicy("AllowReact", p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowReact");

app.UseAuthentication();   // MỚI: soát "con dấu" trên JWT của mỗi request
app.UseAuthorization();    // MỚI: đối chiếu yêu cầu [Authorize] của endpoint
app.UseDefaultFiles();   // vào / thì trả index.html
app.UseStaticFiles();    // phục vụ file trong wwwroot (bản build React)
app.MapControllers();
app.MapFallbackToFile("index.html");  // URL kiểu /app/don-vi (route React) → trả index.html
// Cổng KHÔNG ghim ở đây: lấy từ khóa "Urls" trong appsettings.json (hiện là 5000),
// nhờ vậy bản publish chạy Windows Service đổi cổng được mà không phải build lại.
app.Run();