-- API doi tac DAT LINH KIEN - dat THAY dung nguoi bam (2026-11-11, v1.471): he DVBH (menu QL NSKX) dat loi loc TG12 "dua vao tai khoan nguoi
-- an xac nhan dat hang" (chot chu he thong). Key bat co nay duoc gui email_nguoi_dat trong body POST /v1/dat-hang(+/kiem-tra): don ghi la do
-- CHINH tai khoan do dat, chay voi quyen cua tai khoan do (KTV chi cho minh, TN/GS/Admin dat ho). 0 = chi dung email_dat_hang co dinh (v1.470).
-- Admin bat tung key o Cai dat > API doi tac. Key bat co nay mac nhien tin he thong doi tac da xac thuc nguoi dung (DVBH: dang nhap Google).
ALTER TABLE partner_api_keys ADD COLUMN dat_thay_nguoi_dung INTEGER NOT NULL DEFAULT 0;
