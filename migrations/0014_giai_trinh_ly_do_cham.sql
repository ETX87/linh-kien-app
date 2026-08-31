-- Migration 0014: lich su "giai trinh ly do cham" (phan hoi QA 2026-08-31, muc #5). Truoc day
-- dat_don_hang.ly_do_cham la 1 COT DUY NHAT - TN giai trinh 1 LAN roi khoa vinh vien "khong con qua
-- han" mai mai, du don ton them bao lau nua. Nguoi dung xac nhan (AskUserQuestion 2026-08-31) muon co
-- che LAP LAI: qua 24h (cong T7/CN, xem lib/hanLyDoCham.ts) tinh tu LAN GIAI TRINH GAN NHAT (khong
-- phai co dinh tu luc vao "Cho TN duyet") ma don van chua duoc duyet thi lai yeu cau giai trinh THEM 1
-- lan nua - can 1 bang LICH SU rieng (khong tai dung dat_don_hang_log: cot trang_thai o do la CHECK
-- constraint co dinh danh cho buoc CHUYEN TRANG THAI, con giai trinh la nhieu su kien lap lai tren
-- CUNG 1 trang thai "Cho TN duyet", ban chat khac nhau).
--
-- dat_don_hang.ly_do_cham (cot cu) GIU NGUYEN, doi sang vai tro "mirror" noi dung LAN GIAI TRINH GAN
-- NHAT (cap nhat dong thoi voi INSERT vao bang nay) - tranh phai sua lai MOI noi dang doc cot nay chi
-- de hien thi nhanh, chi doi logic "qua han" (khong con dua vao "cot co gia tri hay khong" nua, ma dua
-- vao "lan giai trinh GAN NHAT con moi hay da qua 24h", xem dat_don_hang_giai_trinh MAX(ngay_tao) tai
-- backend/src/routes/datMuaLinhKien.ts).
CREATE TABLE dat_don_hang_giai_trinh (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    noi_dung        TEXT NOT NULL,
    nguoi_tao       TEXT NOT NULL REFERENCES users(email),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ddhgt_don_hang ON dat_don_hang_giai_trinh(dat_don_hang_id);
