-- Index tra lich su dat hang theo ma linh kien (2026-10-08) - API doi tac GET /api/partner/v1/linh-kien/lich-su (he DVBH
-- mo "Ho so linh kien"). Truoc day dat_don_hang khong co index nao theo ma_lk -> moi lan tra phai quet toan bang.
CREATE INDEX IF NOT EXISTS idx_ddh_ma_lk ON dat_don_hang(ma_lk, ngay_tao);
