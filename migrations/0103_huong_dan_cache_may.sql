-- Huong dan Hoi dap luu CACHE TREN MAY nguoi dung (2026-10-28 - "database vẫn lưu để KTV hỏi, nhưng sẽ lưu về cache của máy họ, khi họ hỏi
-- hoặc xem hướng dẫn thì sẽ không tốn lượt đọc D1 nữa"). Domain md_huong_dan trong data_versions (GET /auth/data-versions tu quet md_*)
-- tang tu dong khi NOI DUNG huong dan doi -> frontend (lib/tinhCache.ts TINH_QUERY "huong-dan") chi tai lai khi phien ban doi.
-- UPDATE chi theo doi cot noi dung (KHONG luot_xem / luot_huu_ich / nguoi_cap_nhat...) - neu khong moi lan KTV xem 1 huong dan lai lam
-- moi may tai lai ca kho.
INSERT OR IGNORE INTO data_versions (domain, version) VALUES ('md_huong_dan', 1);
CREATE TRIGGER IF NOT EXISTS trg_md_huong_dan_i AFTER INSERT ON huong_dan
BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_huong_dan'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_huong_dan_u AFTER UPDATE OF tieu_de, noi_dung, anh, tu_khoa, nhom, stt, bat_tat ON huong_dan
BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_huong_dan'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_huong_dan_d AFTER DELETE ON huong_dan
BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_huong_dan'; END;
