-- Migration 0024: sua lai settings_loai_de_xuat.loai_file_xuat_misa theo dung bo cot THAT trong file
-- mau "File day hang len amis - CHOT CUOI.xls" (nguoi dung gui 2026-09-09, xac nhan qua AskUserQuestion
-- "File Excel moi la dung, DB can sua lai"). File mau nay co 2 ho gia dinh cot khac han nhau (khong
-- phai co 3 nhu ten 3 gia tri loai_file_xuat_misa goi y):
--   - "xuat_kho"/"ban_hang": CUNG 1 bo cot AMIS "Don dat hang" (~36-38 cot: Tinh gia thanh, %thue GTGT,
--     Ty le CK...) - phan biet nhau boi cot "Tinh gia thanh" trong file mau (Khong=xuat_kho/xuat kho
--     bao hanh theo MYC, Co=ban_hang/KTV mua that tra tien) - xem lib/misaExport.ts sau khi sua.
--   - "chuyen_kho": bo cot AMIS "Chuyen kho" rieng (31 cot: TK No/TK Co, Don gia von...).
-- Doi chieu tung sheet mau voi dung hang settings_loai_de_xuat that (query truc tiep D1 remote
-- dat-mua-linh-kien-db 2026-09-09) phat hien phan lon gia tri loai_file_xuat_misa dang gan SAI (vd
-- "TRU CONG NO" dang gan chuyen_kho nhung sheet mau "DON TRU CONG NO" cua no lai dung bo cot "Don dat
-- hang" khong phai "Chuyen kho"). 7/20 dong DUOI DAY khong co sheet mau rieng trong file - suy luan
-- theo pattern ten tuong tu (ghi ro trong tung UPDATE), CAN XAC NHAN LAI VOI KE TOAN KHI CO SHEET MAU
-- that cho cac dong nay.
UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'TRỪ CÔNG NỢ'; -- sheet mau "DON TRU CONG NO": Tinh gia thanh=Co

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option = 'CÔNG NỢ'; -- sheet mau "DON CONG NO": Tinh gia thanh=Khong, co MYC

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option = 'CÔNG NỢ - ĐƠN ĐANG XỬ LÝ'; -- KHONG co sheet mau rieng - suy luan giong "CONG NO"

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option = 'HỖ TRỢ 0 ĐỒNG'; -- sheet mau cung ten: Tinh gia thanh=Khong

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option = 'HỖ TRỢ 0 ĐỒNG (KÊNH MT)'; -- sheet mau cung ten: Tinh gia thanh=Khong

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'HỖ TRỢ CÔNG NỢ'; -- sheet mau "ho tro cong no": Tinh gia thanh=Co

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'HỖ TRỢ CÔNG NỢ (KÊNH MT)'; -- KHONG co sheet mau rieng - suy luan giong "HO TRO CONG NO"

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'TRỪ CÔNG NỢ TG12-NSKX'; -- KHONG co sheet mau rieng - suy luan giong "TRU CONG NO"

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'TRỪ CÔNG NỢ TG12-NPP'; -- KHONG co sheet mau rieng - suy luan giong "TRU CONG NO"

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'chuyen_kho'
WHERE ten_option = 'TRẢ HÀNG LK TỈNH'; -- sheet mau cung ten: dung bo cot "Chuyen kho", truoc la null(->ban_hang)

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'chuyen_kho'
WHERE ten_option = 'TRẢ HÀNG LK ĐẶC THÙ'; -- KHONG co sheet mau rieng - suy luan theo ten "TRA HANG..."

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'chuyen_kho'
WHERE ten_option = 'TRẢ HÀNG DỮ TRỮ'; -- KHONG co sheet mau rieng - suy luan theo ten "TRA HANG..."

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'chuyen_kho'
WHERE ten_option = 'TRẢ HÀNG LK KHÁC'; -- KHONG co sheet mau rieng - suy luan theo ten "TRA HANG..."

UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'ban_hang'
WHERE ten_option = 'MUA HÀNG CÓ ID'; -- KHONG co sheet mau rieng - suy luan giong "MUA HANG"

-- KHONG doi (da dung/khong co sheet mau de doi chieu, giu nguyen theo dung y nghia cu):
-- 'MUA HANG'/'MUA DU TRU' (null -> mac dinh ban_hang, khop sheet mau san co)
-- 'CONG NO (XUAT HANG TU KHO TRUNG GIAN)' (chuyen_kho, ten goi y dung la luong chuyen kho that)
-- 'TRA HANG CONG NO' (chuyen_kho, khop sheet mau san co)
-- 'HO TRO NGOAI BAO HANH TG12-NSKX'/'TG12-NPP' (xuat_kho, khop sheet mau san co)

-- Sheet mau "don xuat mau" trong file khong khop ten loai de xuat nao dang co that (khong co option
-- "XUAT MAY") - xac nhan nguoi dung 2026-09-09: dung TAM format cua "CONG NO" (xuat_kho) cho loai nay,
-- CHUA tao option rieng. Neu ve sau cot thuc te khac han (vd "Ma kho" dang "157{hang}-{mien}" rieng cho
-- kho may, khac han kho linh kien) thi can them 1 template MOI "xuat_hang" rieng (nut "Them" luc tai
-- file o FE) - xem lib/misaExport.ts.
