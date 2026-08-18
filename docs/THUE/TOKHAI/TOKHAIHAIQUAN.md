PARAMETERS tcPathTKHQ,tnThangKT,tlLastFile
LOCAL oExcep as Exception
*- §äc tê khai H¶i quan gèc - LÊy ra c¸c th«ng tin cÇn thiÕt ®­a vµo H§
TRY 
	lcErrMC2021 = ""
	SET EXACT ON
	SET DATE FRENCH 
	LOCAL lnThangKT_P,llLastFile,lcFullPathFileExcel
	lnThangKT_P = tnThangKT
	llLastFile = tlLastFile
	lcFullPathFileExcel = tcPathTKHQ
	LOCAL oVFPCOM as VFPCOM.Comutil
	oVFPCOM = CREATEOBJECT("VFPCOM.Comutil")
	LOCAL oRSKQ as  "ADODB.Recordset"
	LOCAL TMPSheet AS 'Excel.Sheet'
	oRSKQ = CREATEOBJECT("ADODB.Recordset")
	LOCAL oRSKQLine as  "ADODB.Recordset"
	oRSKQLine = CREATEOBJECT("ADODB.Recordset")
	
	oldSelect = SELECT()
	lcGhiNoTK = "156"
	
	lcPathTKHQ = LEFT(lcFullPathFileExcel,AT("\",lcFullPathFileExcel,OCCURS("\",lcFullPathFileExcel)))
	lcPathHDVAT_P = lcPathTKHQ
	*lcFullPathFileExcelNew = "\\Severnew\scan_doc\"+lcMaDonVi+"\NAM"+lcNamLamViec+"\TK_HAI_QUAN\"+lcFileExcelNameNew+".XLS"
	
	lcFileExcelName = SUBSTR(lcFullPathFileExcel,AT("\",lcFullPathFileExcel,OCCURS("\",lcFullPathFileExcel))+1)
	lcFileExcelName = ALLTRIM(lcFileExcelName)
	lcDuoi = SUBSTR(lcFileExcelName,AT(".",lcFileExcelName,OCCURS(".",lcFileExcelName)))	&&PhÇn ®u«i ®· cã dÊu chÊm (.XLS hoÆc .XLSX
	lcTenFileGoc_P = lcFileExcelName	&&Ch­a bÞ bá phÇn ®u«i
	lcTenFileIndex = lcTenFileGoc_P
	lcFileExcelName = LEFT(lcFileExcelName,AT(".",lcFileExcelName)-1)
	lcFileName95XLS = lcFileExcelName+"_95"
	lcFileExcelNameNew = lcFileExcelName+"_CT"
	lcSoTKHQGoc = lcFileExcelName
	lcSoTKHQ = lcFileExcelName	&&SUBSTR(lcFileExcelName,AT("_",lcFileExcelName,OCCURS("_",lcFileExcelName))+1)
	lcFileName95XLSNoExtenTion = lcFileExcelName+"_95"
	lcPathFileName95XLS = lcPathTKHQ+lcFileExcelName+"_95.XLS"
	lcFullPathFileExcelNew = lcPathTKHQ+lcFileExcelNameNew+lcDuoi	&&".XLS"
	*--------------------------
	*- T¹o ra Sheet míi
*!*		lcKHHD = ALLTRIM(thisform.TxtKHHD.Value)
*!*		lcSoTKHQ = ALLTRIM(SUBSTR(lcKHHD,5))
*!*		*lcSoTKHQ = "243900"
*!*		lcSoHD = ALLTRIM(thisform.TxtSoHD.Value)
*!*		lcGhiNoTK = ALLTRIM(thisform.CboGhiNo.Value)
*!*		lcFileExcelNameNew = "TK_"+lcSoTKHQ+"_CT"
*!*		lcSoTKHQGoc = "TK_"+lcSoTKHQ
*!*		*lcFileExcelNameNew = "TK_243900_CT"
*!*		*XLSheet = this.CreateExcelApp(lcSheetName)
*!*		*MESSAGEBOX(lcSoTKHQ)
*!*		lcFileExcelName = "TKHQ_"+lcSoTKHQ
*!*		lcFileName95XLS = "TKHQ_"+lcSoTKHQ+"_95"
*!*		*lcFileExcelName = "TKHQ_243900"
*!*		*lcFullPathFileExcel = "\\Severnew\scan_doc\"+lcMaDonVi+"\NAM"+lcNamLamViec+"\TK_HAI_QUAN\"+lcFileExcelName+".XLS"
*!*		lcFullPathFileExcel = "\\Severnew\scan_doc\"+lcMaDonVi+"\NAM"+lcNamLamViec+"\TK_HAI_QUAN\TKHQ_GOC\"+lcFileExcelName+".XLS"
*!*		lcPathFileName95XLS = "\\Severnew\scan_doc\"+lcMaDonVi+"\NAM"+lcNamLamViec+"\TK_HAI_QUAN\TKHQ_GOC\"+lcFileExcelName+"_95.XLS"
*!*		lcFileName95XLSNoExtenTion = lcFileExcelName+"_95"
*!*		*MESSAGEBOX(lcFullPathFileExcel)
	

	IF !FILE(lcFullPathFileExcel)
		lcErrMC2021 = "B¹n ch­a cã File Excel "+lcFullPathFileExcel
		EXIT 
	ENDIF 
	*lcErrMC2021 = lcFullPathFileExcel
*-----------------
	*- LÊy d÷ liÖu ®­a vµo Line tõ File Excel 
	loOleUNI2TCVN = thisform.OLE_UNI2TCVN
	*TMPSheet1 = CREATEOBJECT('Microsoft.Office.Interop.Excel')
	*TMPSheet1 = GETOBJECT('','Microsoft.Office.Interop.Excel.Application')
	TMPSheet = GETOBJECT('','Excel.Sheet')
	loExcelApp = TMPSheet.Application
	
	WITH loExcelApp
		.Visible = .F.
		.DisplayAlerts = .F.
		.AskToUpdateLinks = .F.
		.AlertBeforeOverwriting = .F.
	ENDWITH 
	
	WITH loExcelApp
		*.WorkBooks.Add()
		*l=lllllllllllllllllll
		*.WorkBooks.OpenXML("D:\scan_doc\v_song_chau_t12_2023_0000077.XML",,3)
		.WorkBooks.Open(lcFullPathFileExcel)
		*.WorkBooks.Open("E:\SCAN_DOC\RO_BOT\NAM2022\TK_HAI_QUAN\Q1\104471506050.XLS")
		
		XLSheet = .ActiveSheet
*		XLSheet = .Sheets("TKN")
		
*		XLSheet.SaveAs(lcFullPathFileExcel95,39)
*		.WorkBooks(lcFileExcelName95).Close()
	ENDWITH 
	CREATE CURSOR TempTKHQ (STT n(10))
	
	*- §i tõng cét vµ tõng dßng ®Ó lÊy d÷ liÖu 
	lnLastRow =	XLSheet.UsedRange.Rows.COUNT
	lnNumOfColumn = XLSheet.UsedRange.COLUMNS.COUNT
	
	llUnMerge = .T.
	IF llUnMerge	&&Lo¹i bá UnMerge
		*- UnMerge
		loLastCell = XLSheet.Cells.SpecialCells(11).select
		lnLastRow =  XLSheet.Cells.SpecialCells(11).Address
		lnLastCell = lnLastRow
		lnFirstCell = XLSheet.Cells(1,1).Address(.F.,.F.,1,.F.)
		loRange5 = XLSheet.Range("&lnFirstCell:&lnLastCell")
		loRange5.UnMerge	
	ENDIF 
	*- ODBC ®Ó x¸c ®Þnh xme cã bao nhiªu dßng - Kh«ng thÓ lÊy ®­îc sè dßng theo kiÓu cò v× m¸y tr¶ vÒ sè dßng cùc lín kh«ng ph¶i sè dßng cã d÷ liÖu sö dông
	LOCAL oRSODBC as  "ADODB.Recordset"
	LOCAL TMPSheet AS 'Excel.Sheet'
	oRSODBC = CREATEOBJECT("ADODB.Recordset")
	LOCAL oAdo as "ADODB.Connection"
	oADo = CREATEOBJECT("ADODB.Connection")
	oAdo.CursorLocation = 3
	cString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source="+lcFullPathFileExcel+";Extended Properties='Excel 12.0 Xml;HDR=YES;IMEX=1'"
	oAdo.Open(cString)
	lcSName = XLSheet.Name
	lcSName = ALLTRIM(lcSName)
	lcSQL = "SELECT * FROM ["+lcSName+"$]"
	oRSODBC.Open(lcSQL,oAdo,3,1)
	lnLastRow = oRSODBC.RecordCount
	oAdo.Close()
	
	IF oRSODBC.State = 1
		oRSODBC.Close()
	ENDIF 
	IF lnLastRow =0	&&Kh«ng cã dßng nµo
		lcErrMC2021 = "Kh«ng cã d÷ liÖu trong TKHQ nµy"
		EXIT 
	ENDIF 
	lnNumOfColumn = 40	&&Kh«ng x¸c ®Þnh ®­îc sè cét cho tõng tê khai nªn ®Ó 1 sè cè ®Þnh (26/7/25)	XLSheet.UsedRange.COLUMNS.COUNT
	*lcErrMC2021 = "Sè c«t : "+ALLTRIM(STR(lnNumOfColumn))
	*- Tõ 97 ®Õn 122 A ®Õn Z
	FOR lnRow = 1 TO lnLastRow	&&Sè dßng
		INSERT INTO TempTKHQ (STT) VALUES (lnRow)
		FOR lnCol = 1 TO lnNumOfColumn
			lcCellValue = XLSheet.Cells(lnRow,lnCol).Value
			IF TYPE("lcCellValue") == "C"	
				lcCellValue = loOleUNI2TCVN.Uni2ABC(XLSheet,lnRow,lnCol)
			ELSE 
				IF (TYPE("lcCellValue")=="N")
					lcCellValue = ALLTRIM(STR(lcCellValue,20,4))
				ENDIF 
				IF (TYPE("lcCellValue")=="D")
					lcCellValue = DTOC(lcCellValue)
				ENDIF 
				IF (TYPE("lcCellValue")=="T")
					lcCellValue = TTOC(lcCellValue)
				ENDIF
IF ISNULL(lcCellValue)
					lcCellValue = ""
				ENDIF
			ENDIF 
			SELECT TempTKHQ
			lcFieldName = "COL_"+ALLTRIM(STR(lnCol))
			IF TYPE("&lcFieldName")=="U"	&& CH­a cã cét theo thø tù A,B,C
				lcCommand = "ALTER table TempTKHQ ADD "+lcFieldName+" c(254) NULL"
				&lcCommand
			ENDIF 
			lcSQL = "UPDATE TempTKHQ SET "+lcFieldName+"= lcCellValue WHERE STT = lnRow"
			&lcSQL
		ENDFOR 
	ENDFOR 
	SELECT TempTKHQ
	
	*MA_HD_NEW WITH lcMaHDNewC4,MA_KH_NEW WITH lcMaKHMay, MST_NEW WITH lcMSTKHMay, THANG_KT WITH lnMonthC4,TEN_KH_NEW WITH lcTenKHMay
	IF !USED("DbfHDVat") 	&&OR lnCursor_P == 0
		CREATE CURSOR DbfHDVat (FILE_NAME c(50),FILE_PATH c(250),MA_HD c(15),SO_HD C(20),NGAY D(8),NGAY_NH D(8),NGAY_NHAP D(8),KHHD C(30),MST c(20),;
			MA_KH c(15),TEN_KH c(254),DIA_CHI c(254),TIEN_HANG n(20,4),TIEN_VAT n(20,4),VAT n(20,4),EDIT_VAT l(1),;
			TIEN_CK n(20,4),TONG_TIEN n(20,4),NOT_USE l(1),PREFIX c(5),TONG_CT n(20,4),GHI_CHU c(120),THANG_KT n(5),;
				TIEN_HD_M n(20,4),TIEN_VAT_M n(20,4),MA_HD_M c(15),SO_HD_M c(20),KHHD_M c(10),NGAY_HD_M d(8),GHI_NO c(15),GHI_CO c(15),MA_CT_NO c(15),MA_CT_CO c(15),GHI_NO_VAT c(15),GHI_CO_VAT C(15),;
				PC_ID c(30),MA_NV_ADD c(15),TEN_NV_ADD c(30),TIME_ADD T(8),GHI_CHU_M M(4),NG_GD c(150),MA_HD_NEW c(15),MA_KH_NEW c(15),TEN_KH_NEW c(250),MST_NEW c(20),SO_TRANG n(5),KDDK l(1);
				,MST_G c(20),TEN_G c(200),DIA_CHI_G c(254),TEN_KH_G c(254))	

		CREATE CURSOR HDVatLine (MA_HD C(15),STT_LINE N(5),MA_HANG c(15),FILE_NAME c(50),MA_NGAN c(20),TEN_HANG c(254),DVT c(20),MA_DVT c(15),SO_LUONG n(20,4),DON_GIA n(20,4),THANH_TIEN n(20,4),QUY_CACH n(10),;
			GHI_CHU c(254),TEN_H_FIND c(254),MA_H_FIND c(15),TCHAT n(5))	&&Dïng thªm GHI_CHU_M ®Ó ghi l¹i c¸c d÷ liÖu dïng ®Ó kiÓm tra ph¸t hiÖn lçi
	ENDIF 

	SELECT TempTKHQ
	llChuyenMa = .F.
	*- Më Excel ®Ó lÊy d÷ liÖu gèc cña tõng Cell ®Ó chuyÓn sang d¹ng ABC tõ UNICODE

	lnSTT = 3
	SELECT TempTKHQ
	SELECT TempTKHQ
	ALTER table TempTKHQ ADD CODE_COLUM c(30) ADD LAN_XHIEN n(5)
	replace ALL CODE_COLUM WITH "TIEN_HANG" FOR (ALLTRIM(COL_3)=="Tæng trÞ gi¸ tÝnh thuÕ")
	replace ALL CODE_COLUM WITH "NGAY" FOR ALLTRIM(COL_3)=="Ngµy ®¨ng ký"
	replace ALL CODE_COLUM WITH "SO_TO_KHAI" FOR ALLTRIM(COL_3)=="Sè tê khai"
	replace ALL CODE_COLUM WITH "NGUOI_XUAT_KHAU" FOR ALLTRIM(COL_3)=="Ng­êi xuÊt khÈu"
	replace ALL CODE_COLUM WITH "NGUOI_NHAP_KHAU" FOR ALLTRIM(COL_3)=="Ng­êi nhËp khÈu"
	replace ALL CODE_COLUM WITH "LOAI_THUE" FOR ALLTRIM(COL_4)=="Tªn s¾c thuÕ"
	replace ALL CODE_COLUM WITH "MA_NGAN" FOR ALLTRIM(COL_3)=="M· sè hµng hãa"
	replace ALL CODE_COLUM WITH "TEN_HANG" FOR ALLTRIM(COL_3)=="M« t¶ hµng hãa"
	replace ALL CODE_COLUM WITH "SO_LUONG" FOR ALLTRIM(COL_19)=="Sè l­îng (1)"
	replace ALL CODE_COLUM WITH "GIA_TRI" FOR (RIGHT(ALLTRIM(COL_4),3)=="(S)" AND RIGHT(ALLTRIM(COL_19),3)=="(M)")
	replace ALL CODE_COLUM WITH "THUE_NK" FOR (ALLTRIM(COL_4)=="Sè tiÒn thuÕ" AND ALLTRIM(COL_19)=="N­íc xuÊt xø")
	GO TOP 
	SELECT TempTKHQ
lcCommand = "EXPORT TO D:\Temp\TKHQ_"+lcSoTKHQGoc+".XLS TYPE XL5"
	&lcCommand
	LOCATE ALL FOR ALLTRIM(CODE_COLUM)=="NGUOI_XUAT_KHAU"
	DO WHILE .T.
		SKIP 1
		IF EMPTY(COL_3)
			IF ALLTRIM(COL_4)=="Tªn"
				Replace CODE_COLUM WITH "NGUOI_XUAT_KHAU_TEN"
			ENDIF 
			IF ALLTRIM(COL_4)=="§Þa chØ"			&&OR ALLTRIM(COL_4)=="§?a chØ"
				Replace CODE_COLUM WITH "NGUOI_XUAT_KHAU_DIA_CHI1"
			ENDIF 
			IF EMPTY(COL_4)
				IF !EMPTY(COL_8)
					Replace CODE_COLUM WITH "NGUOI_XUAT_KHAU_DIA_CHI2"
				ENDIF 
			ENDIF 
		ELSE
			EXIT 
		ENDIF 
	ENDDO 
	
	LOCATE ALL FOR ALLTRIM(CODE_COLUM)=="NGUOI_NHAP_KHAU"
	DO WHILE .T.
		SKIP 1
		IF EMPTY(COL_3)
			IF ALLTRIM(COL_4)=="Tªn"
				Replace CODE_COLUM WITH "NGUOI_NHAP_KHAU_MST"
			ENDIF 
			IF ALLTRIM(COL_4)=="Tªn"
				Replace CODE_COLUM WITH "NGUOI_NHAP_KHAU_TEN"
			ENDIF 
			IF ALLTRIM(COL_4)=="§Þa chØ"			&&OR ALLTRIM(COL_4)=="§?a chØ"
				Replace CODE_COLUM WITH "NGUOI_NHAP_KHAU_DIA_CHI"
			ENDIF 
		ELSE
			EXIT 
		ENDIF 
	ENDDO 
	
	LOCATE ALL FOR ALLTRIM(CODE_COLUM)=="LOAI_THUE"
	SELECT TempTKHQ
	*BROWSE 
	*EXPORT TO D:\Temp\TempTKHQ.XLS TYPE XL5
	IF RECCOUNT()>0
		DO WHILE .T.
			SKIP 1
			IF !EMPTY(COL_4)
				IF ALLTRIM(COL_4)=="V  ThuÕ GTGT"	&& OR ALLTRIM(COL_4)=="V  Thu? GTGT"
					Replace CODE_COLUM WITH "LOAI_THUE_33312"
				ENDIF 
				IF ALLTRIM(COL_4)=="N  ThuÕ NK"		&& OR ALLTRIM(COL_4)=="N  Thu? NK"
					Replace CODE_COLUM WITH "LOAI_THUE_3333"
				ENDIF 
			ELSE
				EXIT 
			ENDIF 
		ENDDO 
	ENDIF 
	*BROWSE 
	EXPORT TO D:\Temp\TempTKHQ.XLS TYPE XL5
	lcSoTKHQGoc = ""
	SELECT TempTKHQ
	SCAN FOR !EMPTY(CODE_COLUM)
		lcCode = ALLTRIM(CODE_COLUM)
		lnRecno = RECNO()
		*lcDiaChiGoc_P = ""
		lcPrefix = "V"
		lcGhiNoVAT = ""
		lcGHiCoVAT = ""
		lcGhiNo = ""
		lcGhiCo = ""
		lcMaCTCo = ""
		lcMaCTNo = ""
		lcMSTGoc_P = ""
		*lnTienHang_P = 0
		lnTienVAT_P = 0
		lnVAT_P = 0
		llNotUse_P = .F.
		lcTenKH_G = ""
		*lnTienHang_P = ""
		
		lnSTTLine = STT
		DO CASE 
			CASE lcCode == "SO_TO_KHAI"
				lcSoToKhai = ALLTRIM(COL_5)
				lcSoToKhai = LEFT(lcSoToKhai,LEN(lcSoToKhai)-5)
*!*					IF "," $ lcSoToKhai
*!*						lcSoToKhai
*!*					ENDIF 
				*lcSoTKHQGoc =  XLSheet.Cells(lnSTTLine+1,1).Text
				lcSoToKhai = RIGHT(lcSoToKhai,6)	&&ChØ lÊy 6 sè cuèi cña sè tê khai
				lcKHHDGoc_P = "TKHQ"+lcSoToKhai
			CASE lcCode == "NGAY"
				lcNgay = ALLTRIM(COL_7)
				ldNgayGoc_P = CTOD(LEFT(lcNgay,10))
				IF TYPE("lnThangKT_P")=="N"
					lnMonthKT = lnThangKT_P	&&TruyÒn vµo
				ELSE 
					lnMonthKT = MONTH(ldNgayGoc_P)
					IF plKhaiQuy	&&Khai quý
						DO CASE 
							CASE lnMonthKT = 1 OR lnMonthKT = 2
								lnMonthKT = 3
							CASE lnMonthKT = 4 OR lnMonthKT = 5
								lnMonthKT = 6
							CASE lnMonthKT = 7 OR lnMonthKT = 8
								lnMonthKT = 9
							CASE lnMonthKT = 10 OR lnMonthKT = 11
								lnMonthKT = 12
						ENDCASE 
					ENDIF 
				ENDIF 
			CASE lcCode == "NGUOI_XUAT_KHAU_TEN"
				lcTenNguoiXK = ALLTRIM(COL_8)
				lcTenKHGoc_P = lcTenNguoiXK
CASE lcCode == "NGUOI_XUAT_KHAU_DIA_CHI1"
				lcDiaChiNguoiXK1 = ALLTRIM(COL_8)+" "+ALLTRIM(COL_21)
				lcDiaChiGoc_P = lcDiaChiNguoiXK1
			CASE lcCode == "NGUOI_XUAT_KHAU_DIA_CHI2"
				lcDiaChiNguoiXK2 = ALLTRIM(COL_8)
				lcDiaChiGoc_P = lcDiaChiGoc_P + " "+lcDiaChiNguoiXK2
			CASE lcCode == "NGUOI_NHAP_KHAU_MST"
				lcMSTNguoiNK = ALLTRIM(COL_8)
				IF !(lcMSTNguoiNK == pcMSTDonVi)
					lcErrMC2021 = "Tê khai HQ kh«ng ph¶i cña ®¬n vÞ "+lcMaDonVi
					l = LOI
				ENDIF 
			CASE lcCode == "NGUOI_NHAP_KHAU_TEN"
				lcTenNguoiNK = ALLTRIM(COL_8)
				*lcTenKHGoc_P = lcTenNguoiNK
				lcTenKH_G = lcTenNguoiNK	
			CASE lcCode == "TIEN_HANG"	&&LÊy sè liÖu tõ cét J dßng 'Gi¸ trÞ tÝnh thuÕ'
				lnTienHang_P = ALLTRIM(COL_10)
				lcGhiChuM = "Tæng gi¸ trÞ Hµng nhËp khÈu : "+lnTienHang_P
				lnTienHang_P = STRTRAN(lnTienHang_P,".")
				lnTienHang_P = VAL(lnTienHang_P)
			
			CASE lcCode == "LOAI_THUE"	&&§Þnh vÞ H§ 156
				lcMaHDNew = thisform.Get_ID_NEW("HOA_DON")
				lcMaHDNew = "V"+lcMaHDNew+"_156"
				lcSoHDGoc_P = lcSoToKhai+"-156"
			
				*- T×m xem cã TKHQ nµy trong m¸y ch­a ?
				oldSelect = SELECT()
				SELECT Hoa_don.ma_hd, Hoa_don.ngay, Hoa_don.thang, Hoa_don.khhd,Hoa_don.so_hd, Hoa_don.tien_vat, Hoa_don.tien_ck,;
						SUM(Hoa_don_line.so_luong*Hoa_don_line.don_gia) AS TIEN_HD FROM kt2000!hoa_don INNER JOIN kt2000!hoa_don_line ;
						 ON  Hoa_don.ma_hd = Hoa_don_line.ma_hd GROUP BY Hoa_don.ma_hd WHERE ALLTRIM(KHHD)==lcKHHDGoc_P AND ALLTRIM(SO_HD)==lcSoHDGoc_P AND NGAY = ldNgayGoc_P ;
						 INTO CURSOR TempTKOld READWRITE 
				SELECT TempTKOld
				lcMaHD_M = ALLTRIM(MA_HD)
				lcSoHD_M = ALLTRIM(SO_HD)
				lcKHHD_M = ALLTRIM(KHHD)
				ldNgayHD_M = NGAY
				lnTienHD_M = TIEN_HD
				lnTienVAT_P_M = TIEN_VAT
				*n(20,4),n(20,4), c(15),c(20),c(10),d(8)
				*MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M 
				*lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M
				USE IN TempTKOld
				USE IN HOA_DON
				USE IN HOA_DON_LINE
				SELECT (oldSelect)
				
				*------------------------------
				lcGhiNo = "156"
				lcGhiCo = "331"
				lcMaKH = thisform.C_3_GET_MA_KH("",lcTenKHGoc_P,lcDiaChiGoc_P) &&---------------------------------------
				lcMaCTCo = lcMaKH
				lcMaCTNo = ""
				lcMSTGoc_P = ALLTRIM(thisform.cMST_KH)	&&Cã ®­îc sau khi ch¹y thisform.C_3_GET_MA_KH
				*lcSoTKHQGoc
*!*					lcErrMC2021 =TYPE("lcTenFileGoc_P")+"1-"+TYPE("lcPathHDVAT_P")+"2-"+TYPE("lcMaHDNew")+"3-"+TYPE("lcSoHDGoc_P")+"4-"+TYPE("ldNgayGoc_P")+"5-"+TYPE("ldNgayGoc_P")+"6-"+TYPE("lcKHHDGoc_P");
*!*						+"7-"+TYPE("lcMSTGoc_P")+"8-"+TYPE("lcTenKHGoc_P")+"9-"+TYPE("lcDiaChiGoc_P")+"10-"+TYPE("lcPrefix")+"11-"+TYPE("llNotUse_P")+"12-"+TYPE("lnTienHang_P")+"13-"+TYPE("lnTienVAT_P")+"14-"+TYPE("lnVAT_P");
*!*						+"15-"+ TYPE("lcGhiNo")+"16-"+TYPE("lcGhiCo")+"17-"+TYPE("lcMaCTNo")+"18-"+TYPE("lcMaCTCo")+"19-"+TYPE("lcGhiNoVAT")+"20-"+TYPE("lcGhiCoVAT");
*!*						+"21-"+TYPE("lnMonthKT")+"22-"+TYPE("DATE()")+"23-"+TYPE(".T.")+"24-"+TYPE("ID()")+"25-"+TYPE("pcUserID")+"26-"+TYPE("pcUserRealName")+"27-"+TYPE("DATETIME()")+"28-"+TYPE("lcGhiChuM"+"29")
					
*!*					1-FILE_NAME,2-FILE_PATH,3-MA_HD,4-SO_HD,5-NGAY,6-NGAY_NH,7-KHHD,8-MST,9-TEN_KH,10-DIA_CHI,11-PREFIX,12-NOT_USE,13-TIEN_HANG,14-TIEN_VAT,15-VAT,;
*!*						16-GHI_NO,17-GHI_CO,18-MA_CT_NO,19-MA_CT_CO, 20-GHI_NO_VAT,21-GHI_CO_VAT,22-THANG,23-NGAY_NHAP,24-EDIT_VAT,25-PC_ID,26-MA_NV_ADD,27-TEN_NV_ADD,28-TIME_ADD,29-GHI_CHU_M
					
				INSERT INTO DbfHDVat (FILE_NAME,FILE_PATH,MA_HD,SO_HD,NGAY,NGAY_NH,KHHD,MST,MA_KH,TEN_KH,DIA_CHI,PREFIX,NOT_USE,TIEN_HANG,TIEN_VAT,VAT,;
					GHI_NO,GHI_CO,MA_CT_NO,MA_CT_CO, GHI_NO_VAT,GHI_CO_VAT,THANG_KT,NGAY_NHAP,EDIT_VAT,PC_ID,MA_NV_ADD,TEN_NV_ADD,TIME_ADD,GHI_CHU_M,MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M,;
					TEN_KH_G);
					VALUES(lcTenFileGoc_P,lcPathHDVAT_P,lcMaHDNew,lcSoHDGoc_P,ldNgayGoc_P,ldNgayGoc_P,lcKHHDGoc_P,lcMSTGoc_P,lcMaKH,lcTenKHGoc_P,lcDiaChiGoc_P,lcPrefix,llNotUse_P,lnTienHang_P,lnTienVAT_P,lnVAT_P,;
						lcGhiNo,lcGhiCo,lcMaCTNo,lcMaCTCo,lcGhiNoVAT,lcGhiCoVAT,lnMonthKT,DATE(),.T.,ID(),pcUserID,pcUserRealName,DATETIME(),lcGhiChuM,lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M,;
						lcTenKH_G)

					*VALUES(lcTenFileGoc_P,lcPathHDVAT_P,lcMaHDNew,lcSoHDGoc_P,ldNgayGoc_P,ldNgayGoc_P,lcKHHDGoc_P,lcMSTGoc_P,lcTenKHGoc_P,lcDiaChiGoc_P,lcPrefix,llNotUse_P,lnTienHang_P,lnTienVAT_P,lnVAT_P,;
*!*						
*!*						+"-"+TYPE("lcGhiNo")+"-"+TYPE("lcGhiCo")+"-"+TYPE("lcMaCTNo")+"-"+TYPE("lcMaCTCo")+"-"+TYPE("lcGhiNoVAT")+"-"+TYPE("lcGhiCoVAT")+"-"+TYPE("lnMonthKT")+"-"+TYPE("DATE()");
*!*						+"-"+TYPE(".T.")+"-"+TYPE("ID(),pcUserID,pcUserRealName,DATETIME(),lcGhiChuM

			CASE lcCode == "LOAI_THUE_3333"	&&§Þnh vÞ H§ thuÕ NK 3333
				SELECT TempTKHQ
				lnTienThue3333 = ALLTRIM(COL_8)	&&Tæng tiÒn thuÕ NK
				lcGhiChuM = "ThuÕ NhËp khÈu 3333 : "+lnTienThue3333
				lnTienThue3333 = STRTRAN(lnTienThue3333,".")
				lnTienThue3333 = VAL(lnTienThue3333)
				lnTienVAT_P = 0
				lnVAT_P = 0
				lcMaHDNew = thisform.Get_ID_NEW("HOA_DON")
				lcMaHDNew = "V"+lcMaHDNew+"_3333"
				lcSoHDGoc_P = lcSoToKhai+"-3333"
				*- T×m xem cã TKHQ nµy trong m¸y ch­a ?
				oldSelect = SELECT()
				SELECT Hoa_don.ma_hd, Hoa_don.ngay, Hoa_don.thang, Hoa_don.khhd,Hoa_don.so_hd, Hoa_don.tien_vat, Hoa_don.tien_ck,;
						SUM(Hoa_don_line.so_luong*Hoa_don_line.don_gia) AS TIEN_HD FROM kt2000!hoa_don INNER JOIN kt2000!hoa_don_line ;
						 ON  Hoa_don.ma_hd = Hoa_don_line.ma_hd GROUP BY Hoa_don.ma_hd WHERE ALLTRIM(KHHD)==lcKHHDGoc_P AND ALLTRIM(SO_HD)==lcSoHDGoc_P AND NGAY = ldNgayGoc_P ;
						 INTO CURSOR TempTKOld READWRITE 
				SELECT TempTKOld
				lcMaHD_M = ALLTRIM(MA_HD)
				lcSoHD_M = ALLTRIM(SO_HD)
				lcKHHD_M = ALLTRIM(KHHD)
				ldNgayHD_M = NGAY
				lnTienHD_M = TIEN_HD
				lnTienVAT_P_M = TIEN_VAT
				*n(20,4),n(20,4), c(15),c(20),c(10),d(8)
*MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M 
				*lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M
				USE IN TempTKOld
				USE IN HOA_DON
				USE IN HOA_DON_LINE
				SELECT (oldSelect)
				
				*--------------------------------------
				lcGhiNo = "156"
				lcGhiCo = "3333"
				lcMaKH = thisform.C_3_GET_MA_KH("TK"+lcSoToKhai,"Tê khai "+lcSoToKhai,"") &&---------------------------------------
				lcMaCTCo = lcMaKH
				lcMaCTNo = ""
				lcMSTGoc_P = ALLTRIM(thisform.cMST_KH)	&&Cã ®­îc sau khi ch¹y thisform.C_3_GET_MA_KH
				INSERT INTO DbfHDVat (FILE_NAME,FILE_PATH,MA_HD,SO_HD,NGAY,NGAY_NH,KHHD,MST,MA_KH,TEN_KH,DIA_CHI,PREFIX,NOT_USE,TIEN_HANG,TIEN_VAT,VAT,;
					GHI_NO,GHI_CO,MA_CT_NO,MA_CT_CO, GHI_NO_VAT,GHI_CO_VAT,THANG_KT,NGAY_NHAP,EDIT_VAT,PC_ID,MA_NV_ADD,TEN_NV_ADD,TIME_ADD,GHI_CHU_M,MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M);
					VALUES(lcTenFileGoc_P,lcPathHDVAT_P,lcMaHDNew,lcSoHDGoc_P,ldNgayGoc_P,ldNgayGoc_P,lcKHHDGoc_P,lcMSTGoc_P,lcMaKH,lcTenKHGoc_P,lcDiaChiGoc_P,lcPrefix,llNotUse_P,lnTienThue3333,lnTienVAT_P,lnVAT_P,;
						lcGhiNo,lcGhiCo,lcMaCTNo,lcMaCTCo,lcGhiNoVAT,lcGhiCoVAT,lnMonthKT,DATE(),.T.,ID(),pcUserID,pcUserRealName,DATETIME(),lcGhiChuM,lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M)
				
			CASE lcCode == "LOAI_THUE_33312"	&&§Þnh vÞ H§ thuÕ GTGT Hµng nhËp khÈu
				SELECT TempTKHQ
				lnTienVAT_P = ALLTRIM(COL_8)
				lcGhiChuM = "ThuÕ GTGT Hµng nhËp khÈu 33312 : "+lnTienVAT_P
				lnTienVAT_P = STRTRAN(lnTienVAT_P,".")
				lnTienVAT_P = VAL(lnTienVAT_P)
				IF TYPE("lnTienThue3333")=="U"	&&Kh«ng cã thuÕ nhËp khÈu
					lnTienThue3333 = 0
				ENDIF 
				lnVAT_P = INT(lnTienVAT_P/(lnTienThue3333+lnTienHang_P))*100
				lnTienHang_P = 0 	&&Ph¶i ®Ó sau khi ®· tÝnh % VAT 33312 ®Ó d÷ nguyªn Tæng gi¸ trÞ tÝnh thuÕ
				lcMaHDNew = thisform.Get_ID_NEW("HOA_DON")
				lcMaHDNew = "V"+lcMaHDNew+"_33312"
				lcSoHDGoc_P = lcSoToKhai+"-33312"
				*- T×m xem cã TKHQ nµy trong m¸y ch­a ?
				oldSelect = SELECT()
				SELECT Hoa_don.ma_hd, Hoa_don.ngay, Hoa_don.thang, Hoa_don.khhd,Hoa_don.so_hd, Hoa_don.tien_vat, Hoa_don.tien_ck,;
						SUM(Hoa_don_line.so_luong*Hoa_don_line.don_gia) AS TIEN_HD FROM kt2000!hoa_don INNER JOIN kt2000!hoa_don_line ;
						 ON  Hoa_don.ma_hd = Hoa_don_line.ma_hd GROUP BY Hoa_don.ma_hd WHERE ALLTRIM(KHHD)==lcKHHDGoc_P AND ALLTRIM(SO_HD)==lcSoHDGoc_P AND NGAY = ldNgayGoc_P ;
						 INTO CURSOR TempTKOld READWRITE 
				SELECT TempTKOld
				lcMaHD_M = ALLTRIM(MA_HD)
				lcSoHD_M = ALLTRIM(SO_HD)
				lcKHHD_M = ALLTRIM(KHHD)
				ldNgayHD_M = NGAY
				lnTienHD_M = TIEN_HD
				lnTienVAT_P_M = TIEN_VAT
				*n(20,4),n(20,4), c(15),c(20),c(10),d(8)
				*MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M 
				*lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M
				USE IN TempTKOld
				USE IN HOA_DON
				USE IN HOA_DON_LINE
				SELECT (oldSelect)
				*----------------------
				lcGhiNo = ""
				lcGhiCo = "33312"
lcGhiNoVAT = "1331"
				lcGhiCoVAT = "33312"
				lcMaKH = thisform.C_3_GET_MA_KH("TK"+lcSoToKhai,"Tê khai "+lcSoToKhai,"") &&---------------------------------------
				lcMaCTCo = lcMaKH
				lcMaCTNo = ""
				lcMSTGoc_P = ALLTRIM(thisform.cMST_KH)	&&Cã ®­îc sau khi ch¹y thisform.C_3_GET_MA_KH
				INSERT INTO DbfHDVat (FILE_NAME,FILE_PATH,MA_HD,SO_HD,NGAY,NGAY_NH,KHHD,MST,MA_KH,TEN_KH,DIA_CHI,PREFIX,NOT_USE,TIEN_HANG,TIEN_VAT,VAT,;
					GHI_NO,GHI_CO,MA_CT_NO,MA_CT_CO, GHI_NO_VAT,GHI_CO_VAT,THANG_KT,NGAY_NHAP,EDIT_VAT,PC_ID,MA_NV_ADD,TEN_NV_ADD,TIME_ADD,GHI_CHU_M,MA_HD_M,SO_HD_M,KHHD_M,NGAY_HD_M,TIEN_HD_M,TIEN_VAT_M);
					VALUES(lcTenFileGoc_P,lcPathHDVAT_P,lcMaHDNew,lcSoHDGoc_P,ldNgayGoc_P,ldNgayGoc_P,lcKHHDGoc_P,lcMSTGoc_P,lcMaKH,lcTenKHGoc_P,lcDiaChiGoc_P,lcPrefix,llNotUse_P,lnTienHang_P,lnTienVAT_P,lnVAT_P,;
						lcGhiNo,lcGhiCo,lcMaCTNo,lcMaCTCo,lcGhiNoVAT,lcGhiCoVAT,lnMonthKT,DATE(),.T.,ID(),pcUserID,pcUserRealName,DATETIME(),lcGhiChuM,lcMaHD_M,lcSoHD_M,lcKHHD_M,ldNgayHD_M,lnTienHD_M,lnTienVAT_P_M)
				*- Thªm 1 dßng trèng vµo HOA_DON_LINE cho H§ thuÕ GTGT hµng nhËp khÈu
				lcTenHangGoc = "ThuÕ GTGT hµng nhËp khÈu"
				lcDVTGoc = "LÇn"
				lcMaNganGoc = "THUEGTGT"
				lcMaHangGoc = thisform.C_5_CHECK_TEN_HANG(lcTenHangGoc,lcDVTGoc,1,lcMaNganGoc)
				WITH thisform
					lcTenHangFinded = ALLTRIM(.cReturnTenHang)
					lcMaNganFinded = ALLTRIM(.cReturnMaNganHang)
					lcMaDVTFinded = ALLTRIM(.cReturnMaDVT)
					lcDVTFinded = ALLTRIM(.cReturnDVT)
				ENDWITH 
				lnSTT = 1
				lnSlChoGiaTriThue = 0
				lnDonGia156 = 0
				lnDonGia33312 = 0
				lnQuyCachC0 = 1
				lcGhiChuL = "ThuÕ GTGT hµng nhËp khÈu"
				INSERT INTO HDVatLine (MA_HD,STT_LINE,FILE_NAME,MA_HANG,MA_NGAN,TEN_HANG,DVT,MA_DVT,SO_LUONG,DON_GIA,THANH_TIEN,QUY_CACH,GHI_CHU,;
						TEN_H_FIND,MA_H_FIND) VALUE ;
						(lcMaHDNew,lnSTT,lcTenFileIndex,lcMaHangGoc,lcMaNganGoc,lcTenHangGoc,lcDVTGoc,lcMaDVTFinded,lnSlChoGiaTriThue,lnDonGia33312,lnSlChoGiaTriThue *lnDonGia156,lnQuyCachC0,lcGhiChuL,;
						lcTenHangFinded,lcMaHangGoc)
			CASE lcCode == "MA_NGAN"
				*lcErrMC2021 = ALLTRIM(STR(lnRecno))
				lcMaNganGoc = ALLTRIM(COL_7)
			CASE lcCode == "TEN_HANG"
				lnSTT = lnSTT + 1			
				lcTenHangGoc = ALLTRIM(COL_7)	&&loOleUNI2TCVN.Uni2ABC(XLSheet,lnRecno,7)
			CASE lcCode == "SO_LUONG"
				lcSoLuong = ALLTRIM(COL_22)
				lcSoLuong = STRTRAN(lcSoLuong,".")
				lnSoLuong = VAL(lcSoLuong)
				lcDVTGoc = ALLTRIM(COL_31)
				*tcTenHangGocC5,tcDVTGocC5,tnQuyCach,tcMaNganGocC5
				lcMaHangGoc = thisform.C_5_CHECK_TEN_HANG(lcTenHangGoc,lcDVTGoc,1,lcMaNganGoc)
				WITH thisform
					lcTenHangFinded = ALLTRIM(.cReturnTenHang)
					lcMaNganFinded = ALLTRIM(.cReturnMaNganHang)
					lcMaDVTFinded = ALLTRIM(.cReturnMaDVT)
					lcDVTFinded = ALLTRIM(.cReturnDVT)
				ENDWITH 
				*lcErrMC2021 = ALLTRIM(STR(lnRecno))+"-"+lcTenHangFinded
*!*					XLSheetNew.Cells(lnSTT,3).Value = lcDVT
*!*					XLSheetNew.Cells(lnSTT,4).Value = lnSL
			CASE lcCode == "GIA_TRI"
lcGiaTriChuaThue = ALLTRIM(COL_9)
				lcGiaTriChuaThue = STRTRAN(lcGiaTriChuaThue,".")
				lnGiaTriChuaThue = VAL(lcGiaTriChuaThue)
				
*!*					XLSheetNew.Cells(lnSTT,7).Value = lnGiaTriChuaThue
			CASE lcCode == "THUE_NK"
				lcThueNK = ALLTRIM(COL_9)
				lcThueNK = STRTRAN(lcThueNK,".")
				lnThueNK = VAL(lcThueNK)
				lnTongGiaTrivaThue = lnGiaTriChuaThue+lnThueNK
				lnDonGiaTrungBinh = (lnGiaTriChuaThue+lnThueNK)/lnSoLuong
				lnSlChoGiaTriHang = ROUND(lnGiaTriChuaThue/lnDonGiaTrungBinh,2)
				lnDonGia156 = lnGiaTriChuaThue/lnSlChoGiaTriHang	&&§¬n gi¸ cho gi¸ trÞ hµng
				lnSlChoGiaTriThue = ROUND(lnThueNK/lnDonGiaTrungBinh,2)
				lnDonGia3333 = lnThueNK/lnSlChoGiaTriThue
				lnTongSL = lnSlChoGiaTriHang+lnSlChoGiaTriThue
				lnQuyCachC0 = 1
				lcGhiChuL = lcTenHangGoc
				SELECT DbfHDVat
				LOCATE ALL FOR "_156"$MA_HD AND ALLTRIM(KHHD)=="TKHQ"+lcSoToKhai
				lcMaHD156 = ALLTRIM(MA_HD)
				LOCATE ALL FOR "_3333"$MA_HD AND ALLTRIM(KHHD)=="TKHQ"+lcSoToKhai
				lcMaHD3333 = ALLTRIM(MA_HD)
				IF lnSlChoGiaTriHang >0
					INSERT INTO HDVatLine (MA_HD,STT_LINE,FILE_NAME,MA_HANG,MA_NGAN,TEN_HANG,DVT,MA_DVT,SO_LUONG,DON_GIA,THANH_TIEN,QUY_CACH,GHI_CHU,;
						TEN_H_FIND,MA_H_FIND) VALUE ;
						(lcMaHD156,lnSTT,lcTenFileIndex,lcMaHangGoc,lcMaNganGoc,lcTenHangGoc,lcDVTGoc,lcMaDVTFinded,lnSlChoGiaTriHang,lnDonGia156,lnSlChoGiaTriHang*lnDonGia156,lnQuyCachC0,lcGhiChuL,;
						lcTenHangFinded,lcMaHangGoc)
				ENDIF 
				IF lnSlChoGiaTriThue >0
					INSERT INTO HDVatLine (MA_HD,STT_LINE,FILE_NAME,MA_HANG,MA_NGAN,TEN_HANG,DVT,MA_DVT,SO_LUONG,DON_GIA,THANH_TIEN,QUY_CACH,GHI_CHU,;
						TEN_H_FIND,MA_H_FIND) VALUE ;
						(lcMaHD3333,lnSTT,lcTenFileIndex,lcMaHangGoc,lcMaNganGoc,lcTenHangGoc,lcDVTGoc,lcMaDVTFinded,lnSlChoGiaTriThue,lnDonGia3333,lnSlChoGiaTriThue *lnDonGia156,lnQuyCachC0,lcGhiChuL,;
						lcTenHangFinded,lcMaHangGoc)
				ENDIF 
		ENDCASE 
		
		SELECT TempTKHQ
	ENDSCAN 
	USE IN TempTKHQ
	SELECT DbfHDVat
	*- TÝnh tæng CT ®Ó so s¸nh víi tiÒn hµng
	SELECT DISTINCT MA_HD FROM DbfHDVat INTO CURSOR Temp1 
	SELECT Temp1
	SCAN 
		lcMaHDTest = ALLTRIM(MA_HD)
		SELECT SUM(SO_LUONG*DON_GIA) AS TONG_CT FROM HDVatLine INTO CURSOR Temp2 WHERE ALLTRIM(MA_HD)==lcMaHDTest GROUP BY MA_HD
		SELECT Temp2
		lnTongCT = TONG_CT
		USE IN Temp2
		UPDATE DbfHDVat SET TONG_CT = lnTongCT WHERE ALLTRIM(MA_HD)==lcMaHDTest
		UPDATE DbfHDVat SET SO_TRANG = 1 WHERE ALLTRIM(MA_HD)==lcMaHDTest
		UPDATE DbfHDVat SET NOT_USE = .T., GHI_CHU = "TiÒn hµng kh¸c Tæng chi tiÕt" WHERE ALLTRIM(MA_HD)==lcMaHDTest AND ABS(TIEN_HANG-TONG_CT)>500
		SELECT Temp1
	ENDSCAN 
	USE IN Temp1
	SELECT DbfHDVat
	oVFPCOM.CursorToRS(oRSKQ,"DbfHDVat")
	SELECT HDVatLine
	oVFPCOM.CursorToRS(oRSKQLine,"HDVatLine")
	thisform.oRSTKHQ_CT = oRSKQLine
	IF llLastFile
		lcAlias = "DbfHDVat" 
		IF USED(lcAlias)
			USE IN (lcAlias)
		ENDIF 
		lcAlias = "HDVatLine" 
		IF USED(lcAlias)
			USE IN (lcAlias)
		ENDIF 
		lcAlias = "DM_HANG" 
		IF USED(lcAlias)
			USE IN (lcAlias)
		ENDIF
lcAlias = "DM_KH" 
		IF USED(lcAlias)
			USE IN (lcAlias)
		ENDIF 
	ENDIF 
	lcAlias = "SETUP" 
	IF USED(lcAlias)
		USE IN (lcAlias)
	ENDIF 
*!*		EXPORT TO D:\DbfHDVat.XLS TYPE XL5
*!*		
*!*		EXPORT TO D:\HDVatLine.XLS TYPE XL5
	
	*loExcelApp.Workbooks(lcFileExcelName+".XLS").Close(.F.)
*!*		thisform.RemoveObject("OleUNI2TCVN1")
	*MESSAGEBOX(lcFullPathFileExcelNew)
*!*		XLSheetNew.SaveAs(lcFullPathFileExcelNew)
*!*		loExcelAppNew.Workbooks(lcFileExcelNameNew+".XLS").Close
	SELECT (oldSelect)
	*-----------------------------
CATCH TO oExcep
	lnLine = oExcep.LineNo
	lcErrMess = oExcep.Message
	lcProcedure = oExcep.Procedure
	lcLineContent = "" &&oExcep.LineContents
	lcErrMC2021 = lcErrMC2021+"- "+ UPPER(lcProcedure)+"- Lçi dßng : "+ALLTRIM(STR(lnLine))+" - "+lcErrMess +"--"+lcLineContent
	*THROW
ENDTRY 
IF !EMPTY(lcErrMC2021)
	RETURN lcErrMC2021
ELSE
	RETURN oRSKQ
ENDIF