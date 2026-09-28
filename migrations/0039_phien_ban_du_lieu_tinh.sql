-- Phien ban du lieu "tinh" cho cache tren may nguoi dung (2026-09-28, yeu cau "han che load 1 du lieu co dinh
-- nhieu lan, tan dung cache tren may nguoi dung, chi khi he thong co thay doi phien ban thi moi load ve").
-- Moi domain md_* = 1 so nguyen trong data_versions, tang TU DONG bang TRIGGER o chinh bang nguon -> MOI duong
-- ghi (route, import hang loat, dong bo gia88/ETX ban dem...) deu tang phien ban, khong phu thuoc code nho goi
-- bumpVersions(). Frontend (lib/tinhCache.ts) hoi GET /api/auth/data-versions (1 truy van ~5 dong) roi chi tai
-- lai du lieu co domain doi phien ban. Domain md_* KHONG dung chung voi 'dat_mua_lk'/'users' (reportCache.ts).
INSERT OR IGNORE INTO data_versions (domain, version) VALUES
  ('md_linh_kien', 1), ('md_loai_de_xuat', 1), ('md_danh_ba', 1), ('md_ly_do_cham', 1), ('md_loai_chiet_khau', 1);

CREATE TRIGGER IF NOT EXISTS trg_md_linh_kien_i AFTER INSERT ON linh_kien BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_linh_kien'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_linh_kien_u AFTER UPDATE ON linh_kien BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_linh_kien'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_linh_kien_d AFTER DELETE ON linh_kien BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_linh_kien'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_i AFTER INSERT ON settings_loai_de_xuat BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_u AFTER UPDATE ON settings_loai_de_xuat BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_d AFTER DELETE ON settings_loai_de_xuat BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_nhom_i AFTER INSERT ON settings_loai_de_xuat_nhom BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_nhom_u AFTER UPDATE ON settings_loai_de_xuat_nhom BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_de_xuat_nhom_d AFTER DELETE ON settings_loai_de_xuat_nhom BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_de_xuat'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_ktv_lien_he_i AFTER INSERT ON ktv_lien_he BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_ktv_lien_he_u AFTER UPDATE ON ktv_lien_he BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_ktv_lien_he_d AFTER DELETE ON ktv_lien_he BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_khu_vuc_i AFTER INSERT ON khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_khu_vuc_u AFTER UPDATE ON khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_khu_vuc_d AFTER DELETE ON khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_user_khu_vuc_i AFTER INSERT ON user_khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_user_khu_vuc_u AFTER UPDATE ON user_khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_user_khu_vuc_d AFTER DELETE ON user_khu_vuc BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_ly_do_cham_i AFTER INSERT ON settings_ly_do_cham BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_ly_do_cham'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_ly_do_cham_u AFTER UPDATE ON settings_ly_do_cham BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_ly_do_cham'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_ly_do_cham_d AFTER DELETE ON settings_ly_do_cham BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_ly_do_cham'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_chiet_khau_i AFTER INSERT ON settings_loai_chiet_khau BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_chiet_khau'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_chiet_khau_u AFTER UPDATE ON settings_loai_chiet_khau BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_chiet_khau'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_settings_loai_chiet_khau_d AFTER DELETE ON settings_loai_chiet_khau BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_loai_chiet_khau'; END;

-- users: CHI cot anh huong danh ba/pham vi (ten, trang thai, vai tro/co) - bo qua cot thong bao/updated_at de
-- viec doi cai dat thong bao hay dong bo lai GS/Tram khong doi gia tri khong lam moi may tai lai danh ba.
CREATE TRIGGER IF NOT EXISTS trg_md_users_i AFTER INSERT ON users BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_users_d AFTER DELETE ON users BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
CREATE TRIGGER IF NOT EXISTS trg_md_users_u AFTER UPDATE ON users WHEN OLD.ten IS NOT NEW.ten OR OLD.vai_tro IS NOT NEW.vai_tro OR OLD.trang_thai_duyet IS NOT NEW.trang_thai_duyet OR OLD.bi_khoa IS NOT NEW.bi_khoa OR OLD.la_ktv_dvbh IS NOT NEW.la_ktv_dvbh OR OLD.la_ve_tinh IS NOT NEW.la_ve_tinh OR OLD.la_kho IS NOT NEW.la_kho OR OLD.la_ke_toan IS NOT NEW.la_ke_toan OR OLD.la_tac_nghiep IS NOT NEW.la_tac_nghiep OR OLD.la_tp_dvbh IS NOT NEW.la_tp_dvbh OR OLD.la_view IS NOT NEW.la_view OR OLD.quan_ly_danh_muc_lk IS NOT NEW.quan_ly_danh_muc_lk OR OLD.xem_danh_muc_lk IS NOT NEW.xem_danh_muc_lk OR OLD.tram_cha IS NOT NEW.tram_cha OR OLD.giam_sat_quan_ly IS NOT NEW.giam_sat_quan_ly BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
