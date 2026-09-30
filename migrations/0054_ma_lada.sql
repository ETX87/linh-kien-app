-- "Mã Lada liên quan" (2026-09-30): ID don Ecolada (vd D1154680) gan vao dong don hang, song song "Mã YCSC
-- liên quan" (ma_yeu_cau_su_co). Noi nao bat buoc Ma YCSC thi chi can 1 trong 2 ma (coMaIdLienQuan()).
-- Tra cuu thong tin qua center.dichvu3t.com (lib/ladaLookupClient.ts), khong luu snapshot.
ALTER TABLE dat_don_hang ADD COLUMN ma_lada TEXT;
CREATE INDEX IF NOT EXISTS idx_ddh_ma_lada ON dat_don_hang(ma_lada) WHERE ma_lada IS NOT NULL;
