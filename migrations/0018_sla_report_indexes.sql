-- Migration 0018: index cho bao cao "Toc do xu ly" (SLA theo tai khoan x giai doan quy trinh) -
-- xem lib/slaMetrics.ts. Ca 4 bang log truoc day CHI co index tren FK id (idx_ddhl_dat_don_hang,
-- idx_tlkl_tlk, idx_pxkl_id, idx_thl_don_hang), khong index nao phu ca (fk_id, id) - bao cao nay doc
-- TOAN BO 1 bang log 1 lan, ORDER BY fk_id, id de gop cac dong lien tiep cung 1 don/phieu (thuat
-- toan "gop dong audit-only" trong slaMetrics.ts) - index composite giup ORDER BY nay chay bang
-- index-only scan thay vi phai sort rieng.
CREATE INDEX idx_ddhl_entity_order ON dat_don_hang_log(dat_don_hang_id, id);
CREATE INDEX idx_tlkl_entity_order ON thieu_lk_log(thieu_lk_id, id);
CREATE INDEX idx_pxkl_entity_order ON phieu_xuat_kho_log(phieu_xuat_kho_id, id);
CREATE INDEX idx_thl_entity_order ON tra_hang_log(dat_don_hang_id, id);
