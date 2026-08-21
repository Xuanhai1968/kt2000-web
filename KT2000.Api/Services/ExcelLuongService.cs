// KHOI PHUC BANG DECOMPILE (21/08/2026) - xem ghi chu ben duoi
// File goc bi mot lenh sed/python cua Claude lam rong; file chua commit nen khong co
// ban trong git. Khoi phuc tu obj/Debug/net10.0/KT2000.Api.dll build luc 15:50 - DUNG
// code dang chay (chuoi tieng Viet giu nguyen), nhung COMMENT giai thich va dinh dang
// goc DA MAT: decompiler khong luu duoc comment.
// Logic giu nguyen 100%. Nen chep lai phan giai thich tu SPEC-MAN-HOP-DONG.md khi co dip.
// Spec: docs/THUE/HOPDONG/SPEC-MAN-HOP-DONG.md

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data.Common;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading.Tasks;
using ClosedXML.Excel;
using KT2000.Api.Models;
using Microsoft.Data.SqlClient;
using NPOI.HSSF.UserModel;
using NPOI.SS.UserModel;

namespace KT2000.Api.Services;

public class ExcelLuongService
{
	private sealed class NguoiTrongSo
	{
		public int Id;

		public string HoTen = "";

		public string? ChucDanh;

		public string? BoPhan;
	}

	public enum LoaiFile
	{
		KhongRo,
		HopDong,
		DanhSachNhanSu,
		ChamCong,
		BangLuong,
		LuongCaNam
	}

	public class HopDongDocDuoc
	{
		public NhanSuDto NhanSu { get; set; } = new NhanSuDto();

		public HopDongDto HopDong { get; set; } = new HopDongDto();
	}

	public class NhanSuDocDuoc
	{
		public NhanSuDto NhanSu { get; set; } = new NhanSuDto();

		public decimal? LuongChinh { get; set; }

		public decimal? PcAnCa { get; set; }

		public decimal? PcDienThoai { get; set; }

		public decimal? PcXangXe { get; set; }

		public decimal? PcChuyenCan { get; set; }

		public decimal? PcHieuQua { get; set; }
	}

	private readonly TenantDbResolver _resolver;

	private readonly VaCauTrucService _va;

	private static readonly (string Khoa, string[] Tu)[] CotDsNv = new(string, string[])[7]
	{
		("chucvu", new string[4] { "chuc vu", "chuc danh", "bo phan", "phong ban" }),
		("luongchinh", new string[3] { "luong co ban", "luong chinh", "muc luong" }),
		("anca", new string[2] { "tien an ca", "an ca" }),
		("dienthoai", new string[1] { "dien thoai" }),
		("xangxe", new string[1] { "xang xe" }),
		("chuyencan", new string[1] { "chuyen can" }),
		("hieuqua", new string[2] { "hieu qua cong viec", "hieu qua" })
	};

	private static readonly (string Khoa, string[] Tu)[] CotLuong = new(string, string[])[18]
	{
		("bophan", new string[4] { "bo phan", "phong ban", "chuc vu", "chuc danh" }),
		("luongchinh", new string[3] { "luong chinh", "luong co ban", "muc luong" }),
		("nctt", new string[4] { "nctt", "ngay cong thuc te", "ngay cong", "so cong" }),
		("luongtt", new string[2] { "luong thuc te", "thanh tien luong" }),
		("anca", new string[4] { "an ca", "tien an ca", "phu cap an ca", "an trua" }),
		("dienthoai", new string[4] { "dien thoai", "pc dien thoai", "phu capdien thoai", "phu cap dien thoai" }),
		("xangxe", new string[4] { "xang xe", "pc xang xe", "phu cap xang xe", "di lai" }),
		("chuyencan", new string[2] { "chuyen can", "pc chuyen can" }),
		("hieuqua", new string[3] { "hieu qua cv", "hieu qua cong viec", "hieu qua" }),
		("thuong", new string[2] { "thuong", "tien thuong" }),
		("tongpc", new string[4] { "tong pc", "tong phu cap", "cong phu cap", "=tong" }),
		("tongluong", new string[3] { "tong luong", "tong cong luong", "tong thu nhap" }),
		("tamung", new string[3] { "tam ung", "da ung", "ung truoc" }),
		("bh", new string[4] { "bhxh", "bao hiem", "khau tru bh", "cac khoan bao hiem" }),
		("tncn", new string[3] { "thue tncn", "tncn", "thue thu nhap" }),
		("tongkt", new string[3] { "tong tru", "tong khau tru", "cong khau tru" }),
		("thuclinh", new string[4] { "thuc linh", "thuc nhan", "con lai", "thuc lanh" }),
		("ghichu", new string[1] { "ghi chu" })
	};

	public ExcelLuongService(TenantDbResolver resolver, VaCauTrucService va)
	{
		_resolver = resolver;
		_va = va;
	}

	private async Task<SqlConnection> MoAsync(string code, int year)
	{
		_va.BaoDam(code, year);
		SqlConnection conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
		try
		{
			await conn.OpenAsync();
			return conn;
		}
		catch (SqlException ex) when (ex.Number is 4060 or 911)
		{
			conn.Dispose();
			throw new SoChuaMoException($"Đơn vị {code} chưa có sổ của năm {year}. " + "Vào Quản trị -> Đơn vị để mở năm làm việc này trước khi nhập Excel.");
		}
	}

	public static string ChuanTen(string? ten)
	{
		string text = (ten ?? "").Trim().ToLowerInvariant();
		if (text.Length == 0)
		{
			return "";
		}
		text = text.Replace('đ', 'd');
		string text2 = text.Normalize(NormalizationForm.FormD);
		StringBuilder stringBuilder = new StringBuilder(text2.Length);
		string text3 = text2;
		foreach (char c in text3)
		{
			if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
			{
				stringBuilder.Append(c);
			}
		}
		string text4 = stringBuilder.ToString().Normalize(NormalizationForm.FormC);
		return string.Join(" ", text4.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
	}

	private static async Task<List<NguoiTrongSo>> DocNhanSu(SqlConnection c)
	{
		List<NguoiTrongSo> ds = new List<NguoiTrongSo>();
		SqlCommand cmd = new SqlCommand("SELECT id, ho_ten, chuc_danh, bo_phan FROM NHAN_SU WHERE dang_lam = 1", c);
		try
		{
			SqlDataReader r = await cmd.ExecuteReaderAsync();
			try
			{
				while (await ((DbDataReader)(object)r).ReadAsync())
				{
					ds.Add(new NguoiTrongSo
					{
						Id = ((DbDataReader)(object)r).GetInt32(0),
						HoTen = (((DbDataReader)(object)r).IsDBNull(1) ? "" : ((DbDataReader)(object)r).GetString(1)),
						ChucDanh = (((DbDataReader)(object)r).IsDBNull(2) ? null : ((DbDataReader)(object)r).GetString(2)),
						BoPhan = (((DbDataReader)(object)r).IsDBNull(3) ? null : ((DbDataReader)(object)r).GetString(3))
					});
				}
				return ds;
			}
			finally
			{
				((IDisposable)r)?.Dispose();
			}
		}
		finally
		{
			((IDisposable)cmd)?.Dispose();
		}
	}

	private static NguoiTrongSo? Tra(Dictionary<string, List<NguoiTrongSo>> bang, string tenFile, out string? loi)
	{
		loi = null;
		string text = ChuanTen(tenFile);
		if (text.Length == 0)
		{
			loi = "Ô họ tên để trống";
			return null;
		}
		if (!bang.TryGetValue(text, out List<NguoiTrongSo>? value))
		{
			loi = "Không có nhân sự đang làm nào tên \"" + tenFile + "\" trong sổ";
			return null;
		}
		if (value.Count > 1)
		{
			loi = $"Có {value.Count} nhân sự cùng tên \"{tenFile}\" — sửa tên trong file " + "cho khác nhau rồi nhập lại";
			return null;
		}
		return value[0];
	}

	private static string Chuoi(IXLWorksheet ws, int r, int c)
	{
		return ws.Cell(r, c).GetString().Trim();
	}

	private static decimal? So(IXLWorksheet ws, int r, int c)
	{
		IXLCell val = ws.Cell(r, c);
		if (val.IsEmpty())
		{
			return null;
		}
		double num = default(double);
		if (val.TryGetValue<double>(out num))
		{
			return (decimal)num;
		}
		string text = val.GetString().Trim();
		if (text.Length == 0)
		{
			return null;
		}
		text = text.Replace("₫", "").Replace("đ", "").Replace("VND", "", StringComparison.OrdinalIgnoreCase)
			.Replace(" ", "")
			.Trim();
		if (text.Length == 0)
		{
			return null;
		}
		int num2 = text.LastIndexOf(',');
		int num3 = text.LastIndexOf('.');
		if (num2 >= 0 && num3 >= 0)
		{
			text = ((num2 <= num3) ? text.Replace(",", "") : text.Replace(".", "").Replace(',', '.'));
		}
		else if (num2 >= 0)
		{
			text = ((text.Length - num2 - 1 <= 2 && text.Count((char x) => x == ',') == 1) ? text.Replace(',', '.') : text.Replace(",", ""));
		}
		else if (num3 >= 0)
		{
			text = ((text.Length - num3 - 1 <= 2 && text.Count((char x) => x == '.') == 1) ? text : text.Replace(".", ""));
		}
		decimal result;
		return decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out result) ? new decimal?(result) : ((decimal?)null);
	}

	private static (int Dong, int CotTen) TimTieuDe(IXLWorksheet ws)
	{
		IXLRow? obj = ws.LastRowUsed();
		int num = Math.Min((obj != null) ? obj.RowNumber() : 0, 30);
		IXLColumn? obj2 = ws.LastColumnUsed();
		int num2 = Math.Min((obj2 != null) ? obj2.ColumnNumber() : 0, 40);
		for (int i = 1; i <= num; i++)
		{
			for (int j = 1; j <= num2; j++)
			{
				bool flag;
				switch (ChuanTen(ws.Cell(i, j).GetString()))
				{
				case "ho va ten":
				case "ho ten":
				case "hoten":
				case "ten nhan vien":
				case "ho va ten nhan vien":
				case "ten":
					flag = true;
					break;
				default:
					flag = false;
					break;
				}
				if (flag)
				{
					return (Dong: i, CotTen: j);
				}
			}
		}
		return (Dong: 0, CotTen: 0);
	}

	public static bool LaFileHopDong(XLWorkbook wb)
	{
		IXLWorksheet? val = ((IEnumerable<IXLWorksheet>)wb.Worksheets).FirstOrDefault();
		if (val == null)
		{
			return false;
		}
		for (int i = 1; i <= 8; i++)
		{
			for (int j = 1; j <= 6; j++)
			{
				if (ChuanTen(val.Cell(i, j).GetString()).StartsWith("hop dong lao dong", StringComparison.Ordinal))
				{
					return true;
				}
			}
		}
		return false;
	}

	public static LoaiFile DoanLoaiFile(XLWorkbook wb)
	{
		if (LaFileHopDong(wb))
		{
			return LoaiFile.HopDong;
		}
		List<string> source = ((IEnumerable<IXLWorksheet>)wb.Worksheets).Select((IXLWorksheet w) => ChuanTen(w.Name).Replace(" ", "")).ToList();
		bool flag = source.Any((string n) => CoSoThang(n, "thang") || CoSoThang(n, "t"));
		bool flag2 = source.Any((string n) => CoSoThang(n, "cc"));
		bool flag3 = source.Any(delegate(string n)
		{
			switch (n)
			{
			case "dsnv":
			case "danhsachnv":
			case "danhsachnhansu":
			case "nhansu":
				return true;
			default:
				return false;
			}
		});
		if (flag3 && (flag | flag2))
		{
			return LoaiFile.LuongCaNam;
		}
		if (flag & flag2)
		{
			return LoaiFile.LuongCaNam;
		}
		if (flag)
		{
			return LoaiFile.BangLuong;
		}
		if (flag2)
		{
			return LoaiFile.ChamCong;
		}
		if (flag3)
		{
			return LoaiFile.DanhSachNhanSu;
		}
		IXLWorksheet? val = ((IEnumerable<IXLWorksheet>)wb.Worksheets).FirstOrDefault();
		if (val == null)
		{
			return LoaiFile.KhongRo;
		}
		for (int num = 1; num <= 8; num++)
		{
			for (int num2 = 1; num2 <= 6; num2++)
			{
				string text = ChuanTen(val.Cell(num, num2).GetString());
				if (text.Length != 0)
				{
					if (text.StartsWith("bang thanh toan luong", StringComparison.Ordinal) || text.StartsWith("bang luong", StringComparison.Ordinal))
					{
						return LoaiFile.BangLuong;
					}
					if (text.StartsWith("bang cham cong", StringComparison.Ordinal))
					{
						return LoaiFile.ChamCong;
					}
					if (text.StartsWith("danh sach nhan su", StringComparison.Ordinal) || text.StartsWith("danh sach nhan vien", StringComparison.Ordinal))
					{
						return LoaiFile.DanhSachNhanSu;
					}
				}
			}
		}
		return LoaiFile.KhongRo;
	}

	private static bool CoSoThang(string tenDaChuan, string tienTo)
	{
		if (!tenDaChuan.StartsWith(tienTo, StringComparison.Ordinal))
		{
			return false;
		}
		int length = tienTo.Length;
		string text = tenDaChuan.Substring(length, tenDaChuan.Length - length).TrimStart(new char[3] { '_', '-', '.' });
		int result;
		return text.Length > 0 && text.All(char.IsDigit) && int.TryParse(text, out result) && result >= 1 && result <= 12;
	}

	public static List<int> CacThangTrongFile(XLWorkbook wb, string tienTo)
	{
		List<int> list = new List<int>();
		foreach (IXLWorksheet item in (IEnumerable<IXLWorksheet>)wb.Worksheets)
		{
			string text = ChuanTen(item.Name).Replace(" ", "");
			if (text.StartsWith(tienTo, StringComparison.Ordinal))
			{
				string text2 = text;
				int length = tienTo.Length;
				string text3 = text2.Substring(length, text2.Length - length).TrimStart(new char[3] { '_', '-', '.' });
				if (text3.Length > 0 && text3.All(char.IsDigit) && int.TryParse(text3, out var result) && result >= 1 && result <= 12 && !list.Contains(result))
				{
					list.Add(result);
				}
			}
		}
		list.Sort();
		return list;
	}

	private static string? TimTheoNhan(IXLWorksheet ws, string nhan, int tuDong, int denDong, int cotNhanToiDa = 3)
	{
		for (int i = tuDong; i <= denDong; i++)
		{
			for (int j = 1; j <= cotNhanToiDa; j++)
			{
				if (!ChuanTen(ws.Cell(i, j).GetString()).StartsWith(nhan, StringComparison.Ordinal))
				{
					continue;
				}
				for (int k = j + 1; k <= j + 10; k++)
				{
					string text = ws.Cell(i, k).GetString().Trim();
					if (text.Length > 0)
					{
						return text;
					}
				}
			}
		}
		return null;
	}

	private static decimal? TienTrongChuoi(string? s)
	{
		if (string.IsNullOrWhiteSpace(s))
		{
			return null;
		}
		StringBuilder stringBuilder = new StringBuilder();
		foreach (char c in s)
		{
			if (char.IsDigit(c))
			{
				stringBuilder.Append(c);
			}
			else if ((stringBuilder.Length <= 0 || (c != '.' && c != ',')) && stringBuilder.Length > 0)
			{
				break;
			}
		}
		decimal result;
		return (stringBuilder.Length > 0 && decimal.TryParse(stringBuilder.ToString(), out result)) ? new decimal?(result) : ((decimal?)null);
	}

	private static DateTime? NgayCuaO(IXLCell o)
	{
		if (o.IsEmpty())
		{
			return null;
		}
		DateTime value = default(DateTime);
		if (o.TryGetValue<DateTime>(out value))
		{
			return value;
		}
		string s = o.GetString().Trim();
		string[] array = new string[3] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd" };
		foreach (string format in array)
		{
			if (DateTime.TryParseExact(s, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out var result))
			{
				return result;
			}
		}
		DateTime result2;
		return DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out result2) ? new DateTime?(result2) : ((DateTime?)null);
	}

	public KetQuaNhapDto<HopDongDocDuoc> DocFileHopDong(XLWorkbook wb, int year, string code, IReadOnlyList<SuyDonViTuFile.DonVi> dsDonVi)
	{
		KetQuaNhapDto<HopDongDocDuoc> ketQuaNhapDto = new KetQuaNhapDto<HopDongDocDuoc>();
		IXLWorksheet ws = ((IEnumerable<IXLWorksheet>)wb.Worksheets).First();
		string? text = SuyDonViTuFile.TimTenDonVi(ws);
		SuyDonViTuFile.KetQua ketQua = SuyDonViTuFile.DoiChieu(text, code, dsDonVi, out string? maSuyRa, out string? loi);
		ketQuaNhapDto.TenDonViFile = text;
		ketQuaNhapDto.MaDonViFile = maSuyRa;
		ketQuaNhapDto.CanhBaoDonVi = loi;
		KetQuaNhapDto<HopDongDocDuoc> ketQuaNhapDto2 = ketQuaNhapDto;
		bool dungDonVi = (uint)ketQua <= 1u;
		ketQuaNhapDto2.DungDonVi = dungDonVi;
		ketQuaNhapDto.Sheet = $"{wb.Worksheets.Count} sheet";
		if (!ketQuaNhapDto.DungDonVi)
		{
			return ketQuaNhapDto;
		}
		int num = 0;
		foreach (IXLWorksheet item in (IEnumerable<IXLWorksheet>)wb.Worksheets)
		{
			num++;
			string? text2 = TimTheoNhan(item, "va mot ben la", 6, 14) ?? TimTheoNhan(item, "va mot ben", 6, 14);
			if (string.IsNullOrWhiteSpace(text2))
			{
				ketQuaNhapDto.Bo.Add(new DongBoDto
				{
					Dong = num,
					HoTen = item.Name,
					LyDo = "Sheet không có dòng \"Và một bên là Ông/Bà\" — không phải mẫu hợp đồng lao động"
				});
				continue;
			}
			string? text3 = TimTheoNhan(item, "nghe nghiep", 6, 16);
			string? text4 = TimTheoNhan(item, "- chuc danh chuyen mon", 16, 24) ?? TimTheoNhan(item, "chuc danh", 16, 24) ?? text3;
			NhanSuDto nhanSu = new NhanSuDto
			{
				HoTen = text2.Trim(),
				NgaySinh = TimNgayTheoNhan(item, "sinh ngay", 6, 16),
				SoCmnd = (TimTheoNhan(item, "so cmtnd", 6, 16) ?? TimTheoNhan(item, "so cmnd", 6, 16) ?? TimTheoNhan(item, "so cccd", 6, 16)),
				NgheNghiep = text3,
				ChucDanh = text4,
				DangLam = true
			};
			HopDongDto hopDong = new HopDongDto
			{
				SoHd = SoHopDongTuO(item),
				LoaiHd = TimTheoNhan(item, "- loai hop dong", 14, 20),
				DiaDiemLv = TimTheoNhan(item, "- dia diem lam viec", 16, 22),
				ThoiGianLv = TimTheoNhan(item, "- thoi gian lam viec", 22, 28),
				PhuongTien = TimTheoNhan(item, "- phuong tien", 26, 32),
				CongViec = text4,
				LuongChinh = TienTrongChuoi(TimTheoNhan(item, "- muc luong chinh", 26, 34)),
				PcAnCa = TienTrongChuoi(TimTheoNhan(item, "+ phu cap an ca", 30, 38)),
				PcDienThoai = TienTrongChuoi(TimTheoNhan(item, "+ phu capdien thoai", 30, 40) ?? TimTheoNhan(item, "+ phu cap dien thoai", 30, 40)),
				PcXangXe = TienTrongChuoi(TimTheoNhan(item, "+ phu cap xang xe", 30, 40)),
				NsdldHoTen = (TimTheoNhan(item, "chung toi mot ben la", 4, 10) ?? TimTheoNhan(item, "chung toi, mot ben la", 4, 10)),
				NsdldChucVu = TimTheoNhan(item, "chuc vu", 4, 10),
				NsdldDaiDien = TimTheoNhan(item, "dai dien cho", 4, 12),
				NsdldDiaChi = TimTheoNhan(item, "dia chi", 4, 12)
			};
			ketQuaNhapDto.Dong.Add(new HopDongDocDuoc
			{
				NhanSu = nhanSu,
				HopDong = hopDong
			});
		}
		return ketQuaNhapDto;
	}

	private static DateTime? TimNgayTheoNhan(IXLWorksheet ws, string nhan, int tuDong, int denDong)
	{
		for (int i = tuDong; i <= denDong; i++)
		{
			for (int j = 1; j <= 3; j++)
			{
				if (!ChuanTen(ws.Cell(i, j).GetString()).StartsWith(nhan, StringComparison.Ordinal))
				{
					continue;
				}
				for (int k = j + 1; k <= j + 10; k++)
				{
					IXLCell val = ws.Cell(i, k);
					if (!val.IsEmpty())
					{
						return NgayCuaO(val);
					}
				}
			}
		}
		return null;
	}

	private static string? SoHopDongTuO(IXLWorksheet ws)
	{
		for (int i = 1; i <= 6; i++)
		{
			for (int j = 1; j <= 3; j++)
			{
				string text = ws.Cell(i, j).GetString().Trim();
				if (text.Length == 0)
				{
					continue;
				}
				string text2 = ChuanTen(text);
				if (text2.StartsWith("so ", StringComparison.Ordinal) || text2.StartsWith("so:", StringComparison.Ordinal))
				{
					int num = text.IndexOf(':');
					string text4;
					if (num < 0)
					{
						string text3 = text;
						text4 = text3.Substring(2, text3.Length - 2);
					}
					else
					{
						string text3 = text;
						int num2 = num + 1;
						text4 = text3.Substring(num2, text3.Length - num2);
					}
					string text5 = text4.Trim();
					if (text5.Length > 0)
					{
						return text5;
					}
				}
			}
		}
		return null;
	}

	public KetQuaNhapDto<NhanSuDocDuoc> DocDanhSachNhanSu(XLWorkbook wb)
	{
		KetQuaNhapDto<NhanSuDocDuoc> ketQuaNhapDto = new KetQuaNhapDto<NhanSuDocDuoc>();
		IXLWorksheet ws = ((IEnumerable<IXLWorksheet>)wb.Worksheets).FirstOrDefault(delegate(IXLWorksheet w)
		{
			switch (ChuanTen(w.Name).Replace(" ", ""))
			{
			case "dsnv":
			case "danhsachnv":
			case "danhsachnhansu":
			case "nhansu":
				return true;
			default:
				return false;
			}
		}) ?? ((IEnumerable<IXLWorksheet>)wb.Worksheets).First();
		ketQuaNhapDto.Sheet = ws.Name;
		var (num, num2) = TimTieuDe(ws);
		if (num == 0)
		{
			throw new InvalidOperationException("Sheet \"" + ws.Name + "\" không có cột \"Họ và tên\" — kiểm tra lại file");
		}
		Dictionary<string, int> viTri = new Dictionary<string, int>(StringComparer.Ordinal);
		IXLColumn? obj = ws.LastColumnUsed();
		int num3 = ((obj != null) ? obj.ColumnNumber() : 0);
		for (int num4 = num; num4 <= num + 1; num4++)
		{
			for (int num5 = 1; num5 <= num3; num5++)
			{
				if (num5 == num2)
				{
					continue;
				}
				string ten = ChuanTen(ws.Cell(num4, num5).GetString());
				if (ten.Length == 0)
				{
					continue;
				}
				(string, string[])[] cotDsNv = CotDsNv;
				for (int num6 = 0; num6 < cotDsNv.Length; num6++)
				{
					var (key, source) = cotDsNv[num6];
					if (!viTri.ContainsKey(key) && source.Any((string t) => KhopTieuDe(ten, t)))
					{
						viTri[key] = num5;
					}
				}
			}
		}
		HashSet<string> hashSet = new HashSet<string>(StringComparer.Ordinal);
		int num7 = CuoiBang(ws, num, num2);
		for (int num8 = num + 1; num8 <= num7; num8++)
		{
			string text = Chuoi(ws, num8, num2);
			if (text.Length == 0)
			{
				continue;
			}
			string text2 = ChuanTen(text);
			if (LaTenNguoi(text2))
			{
				if (!hashSet.Add(text2))
				{
					ketQuaNhapDto.Bo.Add(new DongBoDto
					{
						Dong = num8,
						HoTen = text,
						LyDo = "Tên này đã xuất hiện ở dòng trên — chỉ nhận dòng đầu tiên"
					});
					continue;
				}
				string? text3 = (viTri.TryGetValue("chucvu", out var value) ? Chuoi(ws, num8, value) : null);
				ketQuaNhapDto.Dong.Add(new NhanSuDocDuoc
				{
					NhanSu = new NhanSuDto
					{
						HoTen = text,
						ChucDanh = (string.IsNullOrWhiteSpace(text3) ? null : text3),
						ChucVu = (string.IsNullOrWhiteSpace(text3) ? null : text3),
						DangLam = true
					},
					LuongChinh = D(num8, "luongchinh"),
					PcAnCa = D(num8, "anca"),
					PcDienThoai = D(num8, "dienthoai"),
					PcXangXe = D(num8, "xangxe"),
					PcChuyenCan = D(num8, "chuyencan"),
					PcHieuQua = D(num8, "hieuqua")
				});
			}
		}
		return ketQuaNhapDto;
		decimal? D(int r, string khoa)
		{
			int value2;
			return viTri.TryGetValue(khoa, out value2) ? So(ws, r, value2) : ((decimal?)null);
		}
	}

	public async Task<KetQuaNhapDto<ChamCongDto>> NhapChamCong(string code, int year, int thang, Stream noiDung, string tenFile, IReadOnlyList<SuyDonViTuFile.DonVi> dsDonVi)
	{
		KetQuaNhapDto<ChamCongDto> kq = new KetQuaNhapDto<ChamCongDto>();
		SqlConnection c = await MoAsync(code, year);
		try
		{
			Dictionary<string, List<NguoiTrongSo>> bang = (from x in await DocNhanSu(c)
				group x by ChuanTen(x.HoTen)).ToDictionary((IGrouping<string, NguoiTrongSo> g) => g.Key, (IGrouping<string, NguoiTrongSo> g) => g.ToList());
			XLWorkbook wb = DocFileExcel.Mo(noiDung, tenFile);
			try
			{
				IXLWorksheet? ws = ChonSheet(wb, thang, "cc");
				if (ws == null)
				{
					throw new InvalidOperationException($"File không có sheet nào ứng với tháng {thang} " + "(đặt tên sheet dạng cc01, T1, Thang 1... hoặc để file chỉ một sheet)");
				}
				kq.Sheet = ws.Name;
				kq.DaChuyenXls = Path.GetExtension(tenFile).ToLowerInvariant() == ".xls";
				string? tenDv = SuyDonViTuFile.TimTenDonVi(ws);
				SuyDonViTuFile.KetQua ketQuaDv = SuyDonViTuFile.DoiChieu(tenDv, code, dsDonVi, out string? maSuy, out string? loiDv);
				kq.TenDonViFile = tenDv;
				kq.MaDonViFile = maSuy;
				kq.CanhBaoDonVi = loiDv;
				KetQuaNhapDto<ChamCongDto> ketQuaNhapDto = kq;
				bool dungDonVi = (uint)ketQuaDv <= 1u;
				ketQuaNhapDto.DungDonVi = dungDonVi;
				var (dongTieuDe, cotTen) = TimTieuDe(ws);
				if (dongTieuDe == 0)
				{
					throw new InvalidOperationException("Sheet \"" + ws.Name + "\" không có cột \"Họ và tên\" — kiểm tra lại file");
				}
				int soNgay = DateTime.DaysInMonth(year, thang);
				int[] cotNgay = new int[soNgay + 1];
				IXLColumn? obj = ws.LastColumnUsed();
				int soCot = ((obj != null) ? obj.ColumnNumber() : 0);
				double d = default(double);
				int v = default(int);
				for (int r = dongTieuDe; r <= dongTieuDe + 2; r++)
				{
					for (int col = cotTen + 1; col <= soCot; col++)
					{
						IXLCell o = ws.Cell(r, col);
						int? ngay = ((o.TryGetValue<double>(out d) && d >= 1.0 && d <= 31.0 && Math.Abs(d - Math.Round(d)) < 0.001) ? new int?((int)Math.Round(d)) : ((int.TryParse(o.GetString().Trim(), out var n) && n >= 1 && n <= 31) ? new int?(n) : ((int?)null)));
						int num;
						if (ngay.HasValue)
						{
							v = ngay.GetValueOrDefault();
							if (v <= soNgay)
							{
								num = ((cotNgay[v] == 0) ? 1 : 0);
								goto IL_0504;
							}
						}
						num = 0;
						goto IL_0504;
						IL_0504:
						if (num != 0)
						{
							cotNgay[v] = col;
						}
					}
				}
				List<int> thieu = (from num2 in Enumerable.Range(1, soNgay)
					where cotNgay[num2] == 0
					select num2).ToList();
				if (thieu.Count > 0)
				{
					throw new InvalidOperationException("Sheet \"" + ws.Name + "\" thiếu cột cho ngày " + string.Join(", ", thieu.Take(5)) + ((thieu.Count > 5) ? "..." : "") + $" — tháng {thang} có {soNgay} ngày");
				}
				HashSet<int> daNhan = new HashSet<int>();
				int cuoiBang = CuoiBang(ws, dongTieuDe, cotTen);
				for (int r2 = dongTieuDe + 1; r2 <= cuoiBang; r2++)
				{
					string ten = Chuoi(ws, r2, cotTen);
					if (ten.Length == 0)
					{
						continue;
					}
					string chuan = ChuanTen(ten);
					if (!LaTenNguoi(chuan))
					{
						continue;
					}
					NguoiTrongSo? nguoi = Tra(bang, ten, out string? loi);
					if (nguoi == null)
					{
						kq.Bo.Add(new DongBoDto
						{
							Dong = r2,
							HoTen = ten,
							LyDo = loi ?? ""
						});
						continue;
					}
					if (!daNhan.Add(nguoi.Id))
					{
						kq.Bo.Add(new DongBoDto
						{
							Dong = r2,
							HoTen = ten,
							LyDo = "Tên này đã xuất hiện ở dòng trên — chỉ nhận dòng đầu tiên"
						});
						continue;
					}
					string?[] ngay2 = new string[31];
					for (int d2 = 1; d2 <= soNgay; d2++)
					{
						string v2 = Chuoi(ws, r2, cotNgay[d2]);
						ngay2[d2 - 1] = ((v2.Length == 0) ? null : v2);
					}
					kq.Dong.Add(new ChamCongDto
					{
						NhanSuId = nguoi.Id,
						Thang = thang,
						Ngay = ngay2,
						TongCong = ChamCongService.TinhTongCong(ngay2),
						HoTen = nguoi.HoTen,
						ChucDanh = nguoi.ChucDanh,
						BoPhan = nguoi.BoPhan
					});
					loi = null;
				}
				return kq;
			}
			finally
			{
				((IDisposable)wb)?.Dispose();
			}
		}
		finally
		{
			((IDisposable)c)?.Dispose();
		}
	}

	private static int CuoiBang(IXLWorksheet ws, int dongTieuDe, int cotTen)
	{
		IXLRow? obj = ws.LastRowUsed();
		int num = ((obj != null) ? obj.RowNumber() : dongTieuDe);
		int i;
		for (i = dongTieuDe + 1; i <= num && ws.Cell(i, cotTen).GetString().Trim()
			.Length == 0; i++)
		{
		}
		if (i > num)
		{
			return dongTieuDe;
		}
		int num2 = 0;
		for (int j = i; j <= num; j++)
		{
			if (ws.Cell(j, cotTen).GetString().Trim()
				.Length == 0)
			{
				if (++num2 >= 2)
				{
					return j - num2;
				}
			}
			else
			{
				num2 = 0;
			}
		}
		return num;
	}

	private static bool LaTenNguoi(string tenDaChuan)
	{
		if (tenDaChuan.Length == 0)
		{
			return false;
		}
		bool flag;
		switch (tenDaChuan)
		{
		case "cong":
		case "tong cong":
		case "tong":
		case "ho va ten":
		case "ho ten":
			flag = true;
			break;
		default:
			flag = false;
			break;
		}
		if (flag)
		{
			return false;
		}
		return tenDaChuan.Any(char.IsLetter);
	}

	private static bool KhopTieuDe(string tieuDe, string mau)
	{
		bool result;
		if (!mau.StartsWith('='))
		{
			result = tieuDe.StartsWith(mau, StringComparison.Ordinal);
		}
		else
		{
			result = tieuDe == mau.Substring(1, mau.Length - 1);
		}
		return result;
	}

	public async Task<KetQuaNhapDto<BangLuongDto>> NhapBangLuong(string code, int year, int thang, decimal ngayCongChuan, Stream noiDung, string tenFile, IReadOnlyList<SuyDonViTuFile.DonVi> dsDonVi)
	{
		KetQuaNhapDto<BangLuongDto> kq = new KetQuaNhapDto<BangLuongDto>();
		SqlConnection c = await MoAsync(code, year);
		try
		{
			Dictionary<string, List<NguoiTrongSo>> bang = (from x in await DocNhanSu(c)
				group x by ChuanTen(x.HoTen)).ToDictionary((IGrouping<string, NguoiTrongSo> g) => g.Key, (IGrouping<string, NguoiTrongSo> g) => g.ToList());
			XLWorkbook wb = DocFileExcel.Mo(noiDung, tenFile);
			try
			{
				IXLWorksheet? ws = ChonSheet(wb, thang, "thang");
				if (ws == null)
				{
					throw new InvalidOperationException($"File không có sheet nào ứng với tháng {thang} " + "(đặt tên sheet dạng \"THANG 1\", \"T1\"... hoặc để file chỉ một sheet)");
				}
				kq.Sheet = ws.Name;
				kq.DaChuyenXls = Path.GetExtension(tenFile).ToLowerInvariant() == ".xls";
				string? tenDv = SuyDonViTuFile.TimTenDonVi(ws);
				SuyDonViTuFile.KetQua ketQuaDv = SuyDonViTuFile.DoiChieu(tenDv, code, dsDonVi, out string? maSuy, out string? loiDv);
				kq.TenDonViFile = tenDv;
				kq.MaDonViFile = maSuy;
				kq.CanhBaoDonVi = loiDv;
				KetQuaNhapDto<BangLuongDto> ketQuaNhapDto = kq;
				bool dungDonVi = (uint)ketQuaDv <= 1u;
				ketQuaNhapDto.DungDonVi = dungDonVi;
				var (dongTieuDe, cotTen) = TimTieuDe(ws);
				if (dongTieuDe == 0)
				{
					throw new InvalidOperationException("Sheet \"" + ws.Name + "\" không có cột \"Họ và tên\" — kiểm tra lại file");
				}
				Dictionary<string, int> viTri = new Dictionary<string, int>(StringComparer.Ordinal);
				IXLColumn? obj = ws.LastColumnUsed();
				int soCot = ((obj != null) ? obj.ColumnNumber() : 0);
				for (int r = dongTieuDe; r <= dongTieuDe + 1; r++)
				{
					for (int col = 1; col <= soCot; col++)
					{
						if (col == cotTen)
						{
							continue;
						}
						string ten = ChuanTen(ws.Cell(r, col).GetString());
						if (ten.Length == 0)
						{
							continue;
						}
						(string Khoa, string[] Tu)[] cotLuong = CotLuong;
						for (int num = 0; num < cotLuong.Length; num++)
						{
							string khoa;
							string[] tu;
							(khoa, tu) = cotLuong[num];
							if (!viTri.ContainsKey(khoa) && tu.Any((string t) => KhopTieuDe(ten, t)))
							{
								viTri[khoa] = col;
							}
						}
					}
				}
				HashSet<int> daNhan = new HashSet<int>();
				int cuoiBang = CuoiBang(ws, dongTieuDe, cotTen);
				for (int r2 = dongTieuDe + 1; r2 <= cuoiBang; r2++)
				{
					string ten2 = Chuoi(ws, r2, cotTen);
					if (ten2.Length == 0)
					{
						continue;
					}
					string chuan = ChuanTen(ten2);
					if (LaTenNguoi(chuan))
					{
						NguoiTrongSo? nguoi = Tra(bang, ten2, out string? loi);
						if (nguoi == null)
						{
							kq.Bo.Add(new DongBoDto
							{
								Dong = r2,
								HoTen = ten2,
								LyDo = loi ?? ""
							});
							continue;
						}
						if (!daNhan.Add(nguoi.Id))
						{
							kq.Bo.Add(new DongBoDto
							{
								Dong = r2,
								HoTen = ten2,
								LyDo = "Tên này đã xuất hiện ở dòng trên — chỉ nhận dòng đầu tiên"
							});
							continue;
						}
						kq.Dong.Add(new BangLuongDto
						{
							NhanSuId = nguoi.Id,
							Thang = thang,
							NgayCongChuan = ngayCongChuan,
							BoPhan = (S(r2, "bophan") ?? nguoi.BoPhan ?? nguoi.ChucDanh),
							NgayCongTt = D(r2, "nctt"),
							LuongChinh = D(r2, "luongchinh"),
							LuongThucTe = D(r2, "luongtt"),
							PcAnCa = D(r2, "anca"),
							PcDienThoai = D(r2, "dienthoai"),
							PcXangXe = D(r2, "xangxe"),
							PcChuyenCan = D(r2, "chuyencan"),
							PcHieuQua = D(r2, "hieuqua"),
							TienThuong = D(r2, "thuong"),
							TongPhuCap = D(r2, "tongpc"),
							TongLuong = D(r2, "tongluong"),
							TamUng = D(r2, "tamung"),
							KhauTruBh = D(r2, "bh"),
							ThueTncn = D(r2, "tncn"),
							TongKhauTru = D(r2, "tongkt"),
							ThucLinh = D(r2, "thuclinh"),
							GhiChu = S(r2, "ghichu"),
							HoTen = nguoi.HoTen,
							ChucDanh = nguoi.ChucDanh
						});
						loi = null;
					}
				}
				return kq;
				decimal? D(int r3, string key)
				{
					int value;
					return viTri.TryGetValue(key, out value) ? So(ws, r3, value) : ((decimal?)null);
				}
				string? S(int r3, string key)
				{
					if (!viTri.TryGetValue(key, out var value))
					{
						return null;
					}
					string text = Chuoi(ws, r3, value);
					return (text.Length == 0) ? null : text;
				}
			}
			finally
			{
				((IDisposable)wb)?.Dispose();
			}
		}
		finally
		{
			((IDisposable)c)?.Dispose();
		}
	}

	public KetQuaNhapDto<ChamCongDto> DocChamCongTuWorkbook(XLWorkbook wb, int year, int thang, IReadOnlyDictionary<string, int> nsTheoTen)
	{
		KetQuaNhapDto<ChamCongDto> ketQuaNhapDto = new KetQuaNhapDto<ChamCongDto>
		{
			DungDonVi = true
		};
		IXLWorksheet? val = ChonSheet(wb, thang, "cc");
		if (val == null)
		{
			return ketQuaNhapDto;
		}
		ketQuaNhapDto.Sheet = val.Name;
		var (num, num2) = TimTieuDe(val);
		if (num == 0)
		{
			return ketQuaNhapDto;
		}
		int num3 = DateTime.DaysInMonth(year, thang);
		int[] cotNgay = new int[num3 + 1];
		IXLColumn? obj = val.LastColumnUsed();
		int num4 = ((obj != null) ? obj.ColumnNumber() : 0);
		double num6 = default(double);
		for (int i = num; i <= num + 2; i++)
		{
			for (int j = num2 + 1; j <= num4; j++)
			{
				IXLCell val2 = val.Cell(i, j);
				int? num5 = ((val2.TryGetValue<double>(out num6) && num6 >= 1.0 && num6 <= 31.0 && Math.Abs(num6 - Math.Round(num6)) < 0.001) ? new int?((int)Math.Round(num6)) : ((int.TryParse(val2.GetString().Trim(), out var result) && result >= 1 && result <= 31) ? new int?(result) : ((int?)null)));
				if (num5.HasValue)
				{
					int valueOrDefault = num5.GetValueOrDefault();
					if (valueOrDefault <= num3 && cotNgay[valueOrDefault] == 0)
					{
						cotNgay[valueOrDefault] = j;
					}
				}
			}
		}
		if (Enumerable.Range(1, num3).Any((int d) => cotNgay[d] == 0))
		{
			return ketQuaNhapDto;
		}
		HashSet<int> hashSet = new HashSet<int>();
		int num7 = CuoiBang(val, num, num2);
		for (int num8 = num + 1; num8 <= num7; num8++)
		{
			string text = Chuoi(val, num8, num2);
			if (text.Length == 0)
			{
				continue;
			}
			string text2 = ChuanTen(text);
			if (!LaTenNguoi(text2))
			{
				continue;
			}
			if (!nsTheoTen.TryGetValue(text2, out var value))
			{
				ketQuaNhapDto.Bo.Add(new DongBoDto
				{
					Dong = num8,
					HoTen = text,
					LyDo = "Không có nhân sự đang làm nào tên \"" + text + "\" trong sổ"
				});
			}
			else if (hashSet.Add(value))
			{
				string?[] array = new string?[31];
				for (int num9 = 1; num9 <= num3; num9++)
				{
					string text3 = Chuoi(val, num8, cotNgay[num9]);
					array[num9 - 1] = ((text3.Length == 0) ? null : text3);
				}
				ketQuaNhapDto.Dong.Add(new ChamCongDto
				{
					NhanSuId = value,
					Thang = thang,
					Ngay = array,
					TongCong = ChamCongService.TinhTongCong(array),
					HoTen = text
				});
			}
		}
		return ketQuaNhapDto;
	}

	public KetQuaNhapDto<BangLuongDto> DocBangLuongTuWorkbook(XLWorkbook wb, int thang, decimal ngayCongChuan, IReadOnlyDictionary<string, int> nsTheoTen)
	{
		KetQuaNhapDto<BangLuongDto> ketQuaNhapDto = new KetQuaNhapDto<BangLuongDto>
		{
			DungDonVi = true
		};
		IXLWorksheet? ws = ChonSheet(wb, thang, "thang");
		if (ws == null)
		{
			return ketQuaNhapDto;
		}
		ketQuaNhapDto.Sheet = ws.Name;
		var (num, num2) = TimTieuDe(ws);
		if (num == 0)
		{
			return ketQuaNhapDto;
		}
		Dictionary<string, int> viTri = new Dictionary<string, int>(StringComparer.Ordinal);
		IXLColumn? obj = ws.LastColumnUsed();
		int num3 = ((obj != null) ? obj.ColumnNumber() : 0);
		for (int i = num; i <= num + 1; i++)
		{
			for (int j = 1; j <= num3; j++)
			{
				if (j == num2)
				{
					continue;
				}
				string ten = ChuanTen(ws.Cell(i, j).GetString());
				if (ten.Length == 0)
				{
					continue;
				}
				(string, string[])[] cotLuong = CotLuong;
				for (int k = 0; k < cotLuong.Length; k++)
				{
					var (key, source) = cotLuong[k];
					if (!viTri.ContainsKey(key) && source.Any((string t) => KhopTieuDe(ten, t)))
					{
						viTri[key] = j;
					}
				}
			}
		}
		HashSet<int> hashSet = new HashSet<int>();
		int num4 = CuoiBang(ws, num, num2);
		for (int num5 = num + 1; num5 <= num4; num5++)
		{
			string text = Chuoi(ws, num5, num2);
			if (text.Length == 0)
			{
				continue;
			}
			string text2 = ChuanTen(text);
			if (LaTenNguoi(text2))
			{
				if (!nsTheoTen.TryGetValue(text2, out var value))
				{
					ketQuaNhapDto.Bo.Add(new DongBoDto
					{
						Dong = num5,
						HoTen = text,
						LyDo = "Không có nhân sự đang làm nào tên \"" + text + "\" trong sổ"
					});
				}
				else if (hashSet.Add(value))
				{
					ketQuaNhapDto.Dong.Add(new BangLuongDto
					{
						NhanSuId = value,
						Thang = thang,
						NgayCongChuan = ngayCongChuan,
						BoPhan = S(num5, "bophan"),
						NgayCongTt = D(num5, "nctt"),
						LuongChinh = D(num5, "luongchinh"),
						LuongThucTe = D(num5, "luongtt"),
						PcAnCa = D(num5, "anca"),
						PcDienThoai = D(num5, "dienthoai"),
						PcXangXe = D(num5, "xangxe"),
						PcChuyenCan = D(num5, "chuyencan"),
						PcHieuQua = D(num5, "hieuqua"),
						TienThuong = D(num5, "thuong"),
						TongPhuCap = D(num5, "tongpc"),
						TongLuong = D(num5, "tongluong"),
						TamUng = D(num5, "tamung"),
						KhauTruBh = D(num5, "bh"),
						ThueTncn = D(num5, "tncn"),
						TongKhauTru = D(num5, "tongkt"),
						ThucLinh = D(num5, "thuclinh"),
						GhiChu = S(num5, "ghichu"),
						HoTen = text
					});
				}
			}
		}
		return ketQuaNhapDto;
		decimal? D(int r, string khoa)
		{
			int value2;
			return viTri.TryGetValue(khoa, out value2) ? So(ws, r, value2) : ((decimal?)null);
		}
		string? S(int r, string khoa)
		{
			if (!viTri.TryGetValue(khoa, out var value2))
			{
				return null;
			}
			string text3 = Chuoi(ws, r, value2);
			return (text3.Length == 0) ? null : text3;
		}
	}

	private static IXLWorksheet? ChonSheet(XLWorkbook wb, int thang, string tienTo)
	{
		List<IXLWorksheet> list = ((IEnumerable<IXLWorksheet>)wb.Worksheets).ToList();
		if (list.Count == 0)
		{
			return null;
		}
		if (list.Count == 1)
		{
			return list[0];
		}
		IXLWorksheet? val = list.FirstOrDefault((IXLWorksheet s) => KhopThang(s.Name, thang, tienTo));
		if (val != null)
		{
			return val;
		}
		return list.FirstOrDefault((IXLWorksheet s) => KhopThang(s.Name, thang, null));
	}

	private static bool KhopThang(string ten, int thang, string? tienTo)
	{
		string text = ChuanTen(ten).Replace(" ", "");
		if (text.Length == 0)
		{
			return false;
		}
		if (tienTo != null)
		{
			if (!text.StartsWith(tienTo, StringComparison.Ordinal))
			{
				return false;
			}
			string text2 = text;
			int length = tienTo.Length;
			text = text2.Substring(length, text2.Length - length);
		}
		else
		{
			string[] array = new string[3] { "thang", "cc", "t" };
			foreach (string text3 in array)
			{
				if (text.StartsWith(text3, StringComparison.Ordinal))
				{
					string text2 = text;
					int length = text3.Length;
					text = text2.Substring(length, text2.Length - length);
					break;
				}
			}
		}
		text = text.TrimStart(new char[3] { '_', '-', '.' });
		int result;
		return text.Length > 0 && text.All(char.IsDigit) && int.TryParse(text, out result) && result == thang;
	}
}

public static class SuyDonViTuFile
{
	public readonly record struct DonVi(string Ma, string Ten);

	public enum KetQua
	{
		Khop,
		KhongThayTen,
		KhongRaDonVi,
		NhieuDonVi,
		LechDonVi
	}

	private static readonly string[] TienTo = new string[41]
	{
		"cong ty tnhh mot thanh vien", "cong ty co phan thuong mai va dich vu", "cong ty co phan thuong mai", "cong ty tnhh thuong mai va dich vu", "cong ty tnhh thuong mai va", "cong ty tnhh thuong mai", "cong ty tnhh phan phoi thuong mai", "cong ty tnhh phan phoi", "cong ty tnhh san xuat", "cong ty tnhh kinh doanh thuong mai va van tai",
		"cong ty tnhh kinh doanh", "cong ty tnhh dich vu", "cong ty tnhh mtv", "cong ty co phan", "cong ty cptm va dich vu", "cong ty cptm", "cong ty cp san xuat", "cong ty cp", "cong ty tnhh", "cong ty",
		"chi nhanh", "cty tnhh", "cty cp", "cty", "tnhh mot thanh vien", "tnhh mtv", "tnhh", "mtv", "cp", "thuong mai va dich vu",
		"thuong mai va", "thuong mai", "dich vu", "san xuat", "phan phoi", "kinh doanh", "van tai", "quang cao", "co kim khi", "son",
		"va"
	};

	public static string Chuan(string? s)
	{
		string text = (s ?? "").Trim().ToLowerInvariant();
		if (text.Length == 0)
		{
			return "";
		}
		text = text.Replace('đ', 'd');
		string text2 = text.Normalize(NormalizationForm.FormD);
		StringBuilder stringBuilder = new StringBuilder(text2.Length);
		string text3 = text2;
		foreach (char c in text3)
		{
			UnicodeCategory unicodeCategory = CharUnicodeInfo.GetUnicodeCategory(c);
			if (unicodeCategory != UnicodeCategory.NonSpacingMark)
			{
				stringBuilder.Append(char.IsLetterOrDigit(c) ? c : ' ');
			}
		}
		string text4 = stringBuilder.ToString().Normalize(NormalizationForm.FormC);
		return string.Join(" ", text4.Split(' ', StringSplitOptions.RemoveEmptyEntries));
	}

	public static string RutGon(string? ten)
	{
		string text = Chuan(ten);
		bool flag = true;
		while (flag && text.Length > 0)
		{
			flag = false;
			string[] tienTo = TienTo;
			foreach (string text2 in tienTo)
			{
				if (text.StartsWith(text2 + " ", StringComparison.Ordinal))
				{
					string text3 = text;
					int num = text2.Length + 1;
					text = text3.Substring(num, text3.Length - num);
					flag = true;
					break;
				}
			}
		}
		return text.Trim();
	}

	public static string? TimTenDonVi(IXLWorksheet ws)
	{
		for (int i = 1; i <= 6; i++)
		{
			for (int j = 1; j <= 3; j++)
			{
				string text = ws.Cell(i, j).GetString().Trim();
				if (text.Length >= 5)
				{
					string text2 = Chuan(text);
					if (!text2.StartsWith("bang ", StringComparison.Ordinal) && !text2.StartsWith("thang ", StringComparison.Ordinal) && !text2.StartsWith("so nha", StringComparison.Ordinal) && !text2.StartsWith("dia chi", StringComparison.Ordinal) && !text2.StartsWith("mst", StringComparison.Ordinal) && (text2.StartsWith("cong ty", StringComparison.Ordinal) || text2.StartsWith("cty", StringComparison.Ordinal) || text2.StartsWith("chi nhanh", StringComparison.Ordinal) || text2.StartsWith("doanh nghiep", StringComparison.Ordinal) || text2.StartsWith("hop tac xa", StringComparison.Ordinal)))
					{
						return text;
					}
				}
			}
		}
		return null;
	}

	public static KetQua DoiChieu(string? tenFile, string maDangChon, IReadOnlyList<DonVi> dsDonVi, out string? maSuyRa, out string? loi)
	{
		maSuyRa = null;
		loi = null;
		if (string.IsNullOrWhiteSpace(tenFile))
		{
			loi = "Không đọc được tên đơn vị ở đầu file — hãy tự kiểm tra file có đúng của đơn vị đang chọn không trước khi lưu";
			return KetQua.KhongThayTen;
		}
		string rutFile = RutGon(tenFile);
		string chuanFile = Chuan(tenFile);
		List<DonVi> list = dsDonVi.Where((DonVi d) => Chuan(d.Ten) == chuanFile).ToList();
		List<DonVi> list2 = ((list.Count > 0) ? list : dsDonVi.Where((DonVi d) => RutGon(d.Ten).Length > 0 && RutGon(d.Ten) == rutFile).ToList());
		if (list2.Count == 0)
		{
			loi = "File ghi đơn vị \"" + tenFile + "\" — không có đơn vị nào trong sổ mang tên này";
			return KetQua.KhongRaDonVi;
		}
		if (list2.Count > 1)
		{
			maSuyRa = null;
			loi = $"Tên \"{tenFile}\" khớp {list2.Count} đơn vị trong sổ (" + string.Join(", ", list2.Select((DonVi u) => u.Ma)) + ") — không xác định được đơn vị nào";
			return KetQua.NhieuDonVi;
		}
		maSuyRa = list2[0].Ma;
		if (!string.Equals(maSuyRa, maDangChon, StringComparison.OrdinalIgnoreCase))
		{
			loi = $"File này là của đơn vị {maSuyRa} (\"{tenFile}\") nhưng bạn đang mở đơn vị {maDangChon}. Chọn đúng đơn vị trên lưới rồi nhập lại, " + "hoặc kiểm tra lại file.";
			return KetQua.LechDonVi;
		}
		return KetQua.Khop;
	}
}

public static class DocFileExcel
{
	public static bool DuoiHopLe(string tenFile)
	{
		string text = Path.GetExtension(tenFile).ToLowerInvariant();
		if (text == ".xls" || text == ".xlsx")
		{
			return true;
		}
		return false;
	}

	public static XLWorkbook Mo(Stream noiDung, string tenFile)
	{
		//IL_001f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0025: Expected O, but got Unknown
		string text = Path.GetExtension(tenFile).ToLowerInvariant();
		if (text == ".xlsx")
		{
			try
			{
				return new XLWorkbook(noiDung);
			}
			catch (Exception ex)
			{
				noiDung.Position = 0L;
				try
				{
					return ChuyenSangXlsx(noiDung);
				}
				catch
				{
					throw new InvalidOperationException(NoiLoi(ex));
				}
			}
		}
		if (text == ".xls")
		{
			try
			{
				return ChuyenSangXlsx(noiDung);
			}
			catch (Exception ex2)
			{
				throw new InvalidOperationException(NoiLoi(ex2));
			}
		}
		throw new InvalidOperationException("Chỉ nhận file Excel (.xls hoặc .xlsx)");
	}

	private static string NoiLoi(Exception ex)
	{
		return "Không mở được file Excel — file có thể hỏng, đang mở trong Excel, hoặc được đặt mật khẩu. (" + ex.Message + ")";
	}

	private static XLWorkbook ChuyenSangXlsx(Stream noiDung)
	{
		//IL_0015: Unknown result type (might be due to invalid IL or missing references)
		//IL_001b: Expected O, but got Unknown
		//IL_001b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0021: Expected O, but got Unknown
		//IL_0131: Unknown result type (might be due to invalid IL or missing references)
		//IL_0138: Expected O, but got Unknown
		if (noiDung.CanSeek)
		{
			noiDung.Position = 0L;
		}
		IWorkbook val = (IWorkbook)new HSSFWorkbook(noiDung);
		XLWorkbook val2 = new XLWorkbook();
		for (int i = 0; i < val.NumberOfSheets; i++)
		{
			ISheet sheetAt = val.GetSheetAt(i);
			IXLWorksheet val3 = val2.Worksheets.Add(TenSheetHopLe(sheetAt.SheetName, i));
			for (int j = sheetAt.FirstRowNum; j <= sheetAt.LastRowNum; j++)
			{
				IRow row = sheetAt.GetRow(j);
				if (row == null)
				{
					continue;
				}
				for (int k = row.FirstCellNum; k < row.LastCellNum; k++)
				{
					if (k >= 0)
					{
						ICell cell = row.GetCell(k);
						if (cell != null)
						{
							IXLCell dich = val3.Cell(j + 1, k + 1);
							ChepGiaTri(cell, dich);
						}
					}
				}
			}
		}
		MemoryStream memoryStream = new MemoryStream();
		val2.SaveAs((Stream)memoryStream);
		val2.Dispose();
		memoryStream.Position = 0L;
		return new XLWorkbook((Stream)memoryStream);
	}

	private static string TenSheetHopLe(string ten, int thuTu)
	{
		string text = (ten ?? "").Trim();
		if (text.Length == 0)
		{
			return $"Sheet{thuTu + 1}";
		}
		char[] array = new char[7] { '[', ']', '*', '?', '/', '\\', ':' };
		foreach (char oldChar in array)
		{
			text = text.Replace(oldChar, '_');
		}
		return (text.Length > 31) ? text.Substring(0, 31) : text;
	}

	private static void ChepGiaTri(ICell o, IXLCell dich)
	{
		// O cong thuc: lay KET QUA da tinh san trong file (.xls cua ke toan luon
		// duoc Excel luu kem gia tri), khong tinh lai cong thuc.
		CellType loai = o.CellType == CellType.Formula
			? o.CachedFormulaResultType
			: o.CellType;

		switch (loai)
		{
			case CellType.Numeric:
				if (DateUtil.IsCellDateFormatted(o))
					dich.Value = o.DateCellValue.GetValueOrDefault();
				else
					dich.Value = o.NumericCellValue;
				break;

			case CellType.String:
				dich.Value = o.StringCellValue ?? "";
				break;

			case CellType.Boolean:
				dich.Value = o.BooleanCellValue;
				break;

			// Blank / Error / Unknown: de trong.
			default:
				break;
		}
	}
}
