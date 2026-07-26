using Microsoft.EntityFrameworkCore;
using KT2000.Api.Models;

namespace KT2000.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Tenant> Tenants => Set<Tenant>();
        public DbSet<UserTenantAccess> UserTenantAccess => Set<UserTenantAccess>();
        public DbSet<FiscalYear> FiscalYears => Set<FiscalYear>();
        public DbSet<UserPreference> UserPreferences => Set<UserPreference>();

        protected override void OnModelCreating(ModelBuilder mb)
        {
            mb.Entity<User>().HasIndex(u => u.LoginName).IsUnique();
            mb.Entity<Tenant>().HasIndex(t => t.Code).IsUnique();
            mb.Entity<Tenant>()
              .HasMany(t => t.FiscalYears).WithOne().HasForeignKey(f => f.TenantId);
            mb.Entity<UserTenantAccess>().HasKey(x => new { x.UserId, x.TenantId });
            mb.Entity<UserTenantAccess>()
              .HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            mb.Entity<UserTenantAccess>()
              .HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            mb.Entity<FiscalYear>().HasKey(x => new { x.TenantId, x.Year });
            mb.Entity<UserPreference>().HasKey(x => new { x.UserId, x.Key });
        }
    }
}