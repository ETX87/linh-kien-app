-- Migration 0053: luong "Linh kien moi cho xet duyet ma chuan" (2026-09-30).
-- Nguoi co "Quan ly danh muc LK" tao LK moi trong app (ma do nguoi tao tu dat, co the dung/sai ma that) -> LK vao
-- "Cho xet duyet"; nhan vien "Mua hang" (co moi users.la_mua_hang) sua ma/ten chuan roi xac nhan, gop vao ma co san,
-- tu choi hoac nhap gia tam. gia88 keo ve dung ma dang cho -> tu lay ten/gia gia88 + "Tu dong duyet".
--
-- trang_thai_ma: 'Cho xet duyet' | 'Da xac nhan' | 'Tu dong duyet' | 'Tu choi' | 'Da doi ma'. KHONG dat CHECK (them
-- trang thai sau nay khoi phai rebuild bang - bai hoc 0041). DEFAULT 'Cho xet duyet' de MOI duong tao LK trong app
-- (form, import Excel, /lk-settings/danh-muc) tu vao hang cho; gia88 INSERT ghi ro 'Da xac nhan'. LK hien co = da xac nhan.
--
-- 'Da doi ma' + ma_chuan: doi ma A -> B / gop A vao B KHONG xoa dong A ma giu lam "dong chuyen huong" (an, bat_tat=0,
-- ngay_cap_nhat moi) - cache danh muc tren may nguoi dung (lk-settings/danh-muc?since=) chi tai dong MOI SUA, khong
-- biet dong bi XOA -> xoa A thi may cu van cho chon A mai. ma_chuan con de backend tu quy ma A ve B (form dang mo,
-- file import cu). Xem backend/src/lib/linhKienXetDuyet.ts.
--
-- co_tren_gia88: 1 = ma nay co trong danh sach gia88 (gia88Sync.ts cap nhat moi dem theo danh sach day du) -> gia do
-- gia88 quan ly; 0 = LK tao trong app chua co tren gia88 -> Mua hang nhap duoc "gia tam". LK hien co tam coi = 1 (giu
-- nguyen hanh vi cu), lan dong bo gia88 dau tien tu sua dung.
ALTER TABLE linh_kien ADD COLUMN trang_thai_ma TEXT NOT NULL DEFAULT 'Cho xet duyet';
ALTER TABLE linh_kien ADD COLUMN ma_chuan TEXT;
ALTER TABLE linh_kien ADD COLUMN co_tren_gia88 INTEGER NOT NULL DEFAULT 0;
UPDATE linh_kien SET trang_thai_ma = 'Da xac nhan', co_tren_gia88 = 1;
CREATE INDEX idx_linh_kien_trang_thai_ma ON linh_kien(trang_thai_ma);
CREATE INDEX idx_linh_kien_ma_chuan ON linh_kien(ma_chuan);

-- Nhat ky xet duyet ma LK. ma_linh_kien = ma LUC ghi log (doi A -> B: log cu van o A, xem lich su cua B = log cua B +
-- log cac dong co ma_chuan = B).
-- hanh_dong: 'Tao moi' | 'Xac nhan' | 'Doi ma' | 'Gop ma' | 'Tu choi' | 'Gia tam' | 'Tu dong duyet'
CREATE TABLE linh_kien_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_linh_kien  TEXT NOT NULL,
    hanh_dong     TEXT NOT NULL,
    ma_cu         TEXT,
    ma_moi        TEXT,
    ten_cu        TEXT,
    ten_moi       TEXT,
    ghi_chu       TEXT,
    so_don        INTEGER,
    nguoi_thuc_hien TEXT,
    thoi_gian     TEXT NOT NULL
);
CREATE INDEX idx_linh_kien_log_ma ON linh_kien_log(ma_linh_kien, id);

-- Vai tro "Mua hang": xem + sua/xac nhan ma linh kien (dot 1 chi vao duoc "Bang gia").
ALTER TABLE users ADD COLUMN la_mua_hang INTEGER NOT NULL DEFAULT 0;

-- Trigger danh ba (0050) theo doi them la_mua_hang - co moi anh huong quyen/menu.
DROP TRIGGER IF EXISTS trg_md_users_u;
CREATE TRIGGER IF NOT EXISTS trg_md_users_u AFTER UPDATE ON users WHEN OLD.ten IS NOT NEW.ten OR OLD.ten_misa IS NOT NEW.ten_misa OR OLD.vai_tro IS NOT NEW.vai_tro OR OLD.trang_thai_duyet IS NOT NEW.trang_thai_duyet OR OLD.bi_khoa IS NOT NEW.bi_khoa OR OLD.la_ktv_dvbh IS NOT NEW.la_ktv_dvbh OR OLD.la_ve_tinh IS NOT NEW.la_ve_tinh OR OLD.la_kho IS NOT NEW.la_kho OR OLD.la_ke_toan IS NOT NEW.la_ke_toan OR OLD.la_tac_nghiep IS NOT NEW.la_tac_nghiep OR OLD.la_tp_dvbh IS NOT NEW.la_tp_dvbh OR OLD.la_view IS NOT NEW.la_view OR OLD.la_mua_hang IS NOT NEW.la_mua_hang OR OLD.quan_ly_danh_muc_lk IS NOT NEW.quan_ly_danh_muc_lk OR OLD.xem_danh_muc_lk IS NOT NEW.xem_danh_muc_lk OR OLD.tram_cha IS NOT NEW.tram_cha OR OLD.giam_sat_quan_ly IS NOT NEW.giam_sat_quan_ly BEGIN UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'md_danh_ba'; END;
