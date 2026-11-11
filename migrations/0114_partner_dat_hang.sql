-- API doi tac DAT LINH KIEN (2026-11-11, v1.470 - "tạo 1 api cho phép hệ thống đối tác đặt linh kiện thông qua api").
-- Moi API key gan 1 TAI KHOAN DAT HANG (users.email) do Admin chon: don tao qua POST /api/partner/v1/dat-hang chay CUNG logic
-- POST /api/dat-mua-lk/phieu-dat voi quyen cua tai khoan do (KTV = chi dat cho minh; TN/GS = dat ho moi KTV). NULL = key chi tra cuu.
ALTER TABLE partner_api_keys ADD COLUMN email_dat_hang TEXT;
-- Phieu dat tao qua API key nao (doi tac chi tra cuu duoc phieu cua chinh key minh - GET /v1/dat-hang).
ALTER TABLE phieu_dat ADD COLUMN partner_key_id INTEGER;
CREATE INDEX idx_phieu_dat_partner_key ON phieu_dat(partner_key_id, ngay_tao) WHERE partner_key_id IS NOT NULL;
