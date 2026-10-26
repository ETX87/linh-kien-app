-- MUA HÀNG CÔNG NỢ ĐỐI TÁC (chot 2026-10-26, v1.403 - "thêm 1 lựa chọn khi đặt hàng 'MUA HÀNG CÔNG NỢ ĐỐI TÁC' ... chọn đối tác từ danh sách
-- (danh sách do tn hoặc kế toán bổ sung) => hiện cảnh báo số tiền mua hàng công nợ còn khả dụng ... luồng quy trình như đơn mua bình thường, chỉ là
-- cho phép thanh toán sau và thêm 1 mốc cảnh báo nếu vượt").
-- Chot nguoi dung: nguoi nhan hang nhu don thuong, GIA NIEM YET; don doi tac vao PHIEU RIENG khong can chuyen tien; so cong no doi tac RIENG
-- (ban dau + phat sinh - da thanh toan), khong dung quy KTV; TN + Ke toan + Admin sua danh sach, nhap thanh toan chi Ke toan/Admin.

-- Danh sach doi tac (tab "Công nợ đối tác" o Danh sach KTV). Ma MISA doi tac = khoa (khong doi duoc sau khi tao).
CREATE TABLE IF NOT EXISTS doi_tac_cong_no (
  ma_misa          TEXT PRIMARY KEY COLLATE NOCASE,
  ten_misa         TEXT NOT NULL,
  cong_no_ban_dau  INTEGER NOT NULL DEFAULT 0,
  cong_no_toi_da   INTEGER NOT NULL DEFAULT 0,
  bat_tat          INTEGER NOT NULL DEFAULT 1,
  ghi_chu          TEXT,
  nguoi_cap_nhat   TEXT,
  ngay_cap_nhat    TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

-- So thanh toan cua doi tac (Ke toan ghi khoan doi tac da tra -> giam cong no). Chi ghi them; huy = trang_thai 'Da huy'.
CREATE TABLE IF NOT EXISTS doi_tac_thanh_toan (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_doi_tac     TEXT NOT NULL COLLATE NOCASE,
  so_tien        INTEGER NOT NULL CHECK (so_tien > 0),
  ngay_chung_tu  TEXT,
  noi_dung       TEXT NOT NULL,
  trang_thai     TEXT NOT NULL DEFAULT 'Da ghi' CHECK (trang_thai IN ('Da ghi', 'Da huy')),
  nguoi_tao      TEXT NOT NULL,
  tao_luc        TEXT NOT NULL,
  huy_boi        TEXT,
  huy_luc        TEXT,
  ly_do_huy      TEXT
);
CREATE INDEX IF NOT EXISTS idx_doi_tac_thanh_toan_ma ON doi_tac_thanh_toan(ma_doi_tac, trang_thai);

-- Don doi tac (NULL = don thuong) + phieu doi tac (phieu RIENG theo doi tac, khong can chuyen tien).
ALTER TABLE dat_don_hang ADD COLUMN doi_tac_ma TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN doi_tac_ma TEXT;
CREATE INDEX IF NOT EXISTS idx_ddh_doi_tac ON dat_don_hang(doi_tac_ma) WHERE doi_tac_ma IS NOT NULL;

-- Chot chan MOI duong dua don vao phieu (tu gom, tao tay, them dong, chuyen don...): don doi tac chi vao phieu CUNG doi tac, don thuong
-- khong vao phieu doi tac - tranh lan tien KTV phai chuyen voi tien ghi no doi tac.
CREATE TRIGGER IF NOT EXISTS trg_pxk_dong_doi_tac
BEFORE INSERT ON phieu_xuat_kho_dong
WHEN COALESCE((SELECT UPPER(doi_tac_ma) FROM dat_don_hang WHERE id = NEW.dat_don_hang_id), '')
  <> COALESCE((SELECT UPPER(doi_tac_ma) FROM phieu_xuat_kho WHERE id = NEW.phieu_xuat_kho_id), '')
BEGIN
  SELECT RAISE(ABORT, 'DON_DOI_TAC_KHAC_PHIEU');
END;

-- Loai de xuat moi cho ca 2 nhom (KTV/CTV/TRẠM + Tác nghiệp + Giám sát) - file MISA mau Ban hang (mac dinh cua don mua).
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, bat_tat, stt)
SELECT n.id, 'MUA HÀNG CÔNG NỢ ĐỐI TÁC', 1, 0 FROM settings_loai_de_xuat_nhom n
WHERE n.id IN (3, 4)
  AND NOT EXISTS (SELECT 1 FROM settings_loai_de_xuat o WHERE o.nhom_id = n.id AND o.ten_option = 'MUA HÀNG CÔNG NỢ ĐỐI TÁC');
