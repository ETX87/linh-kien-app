-- Migration 0078: index tra ton kho KTV theo ma hang (API doi tac GET /api/partner/v1/linh-kien/chi-tiet, 2026-10-13 - gom ton
-- kho + cong no chi tiet theo tung LK). Import ton kho ghi DELETE + INSERT nen index giu nguyen.
CREATE INDEX IF NOT EXISTS idx_ktv_ton_kho_ma_hang ON ktv_ton_kho(ma_hang);
