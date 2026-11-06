-- 2026-11-06: partnerTimeline.ts buildCaseTimeline() tim don theo ma_yeu_cau_su_co (moi lan DVBH mo chi tiet ca,
-- ~12k lan/ngay) - thieu index nen quet ca bang dat_don_hang (~5.4k dong/lan, ~65M rows read/ngay).
-- Index partial (bo dong NULL) de khong ton them rows_written cho cac don khong gan ma yeu cau.
CREATE INDEX IF NOT EXISTS idx_dat_don_hang_ma_yeu_cau_su_co
  ON dat_don_hang(ma_yeu_cau_su_co) WHERE ma_yeu_cau_su_co IS NOT NULL;
