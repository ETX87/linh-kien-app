-- DON "SỬA CHỮA TẠI KHO" dong bo tu app Sua chua bao hanh (suachua) - 2026-11-12, v1.478.
-- Yeu cau: "luồng Cấp lk ... khi đơn cấp Lk đến bước kế toán xác nhận xong / kho in, kho xuất... => sẽ bắn API sang linh-kien-app
-- để tạo 1 lịch sử đơn đặt (mỗi thay đổi sẽ lưu log theo api (kiểm soát tránh trùng log) ... loại đề xuất "SỬA CHỮA TẠI KHO" (đơn này
-- không hiện trong danh sách lựa chọn trên hệ thống - chỉ đồng bộ API về) ... khóa không cho chỉnh sửa hoặc thay đổi vì chỉ là đơn view log".
--
-- 1 de xuat linh kien ben suachua (DX-xxxxxx) = 1 phieu_dat + 1 dat_don_hang ben nay. Trang thai rieng (khong dung trang thai don mua
-- de KHONG bi tu gom PXK / tinh tien / dem viec cua TN): 'SC cho kho in' -> 'SC kho da in' -> 'SC kho da xuat' (+ 'Da huy').
-- Khu vuc de NULL -> khong tru ton kho cong ty (ton kho MISA import da phan anh phieu xuat that).
ALTER TABLE dat_don_hang ADD COLUMN nguon_ngoai TEXT;          -- 'suachua' = don dong bo, CHI XEM
ALTER TABLE dat_don_hang ADD COLUMN nguon_ngoai_id TEXT;       -- ma de xuat ben suachua (DX-xxxxxx)
ALTER TABLE dat_don_hang ADD COLUMN ngoai_rev INTEGER NOT NULL DEFAULT 0;  -- chi API dong bo tang -> mo khoa trigger
ALTER TABLE dat_don_hang ADD COLUMN ngoai_cap_nhat TEXT;       -- updated_at ben suachua da ap dung (bo ban tin cu / trung)
ALTER TABLE dat_don_hang ADD COLUMN ngoai_info TEXT;           -- JSON tham chieu (don vi BH, KTV gui, NV, mien, ma DH...)
CREATE UNIQUE INDEX idx_ddh_nguon_ngoai ON dat_don_hang(nguon_ngoai, nguon_ngoai_id) WHERE nguon_ngoai IS NOT NULL;
ALTER TABLE phieu_dat ADD COLUMN nguon_ngoai TEXT;

-- Nhat ky tung thay doi nhan qua API. UNIQUE(dat_don_hang_id, su_kien) = chong ghi trung khi suachua gui lai cung ban tin.
CREATE TABLE dat_don_ngoai_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id  TEXT NOT NULL REFERENCES dat_don_hang(id),
    su_kien          TEXT NOT NULL,
    trang_thai       TEXT NOT NULL,
    nguoi_xu_ly      TEXT,
    nguoi_xu_ly_ten  TEXT,
    ngay_xu_ly       TEXT NOT NULL,
    ghi_chu          TEXT,
    nhan_luc         TEXT NOT NULL,
    UNIQUE (dat_don_hang_id, su_kien)
);
CREATE INDEX idx_ddnl_don ON dat_don_ngoai_log(dat_don_hang_id, ngay_xu_ly);

-- KHOA CUNG o tang DB: moi lenh UPDATE/DELETE cua code khac len don nguon_ngoai bi BO QUA tung dong (RAISE(IGNORE) - lenh cap nhat
-- hang loat van chay tiep cho cac don khac). API dong bo luon tang ngoai_rev nen di qua duoc.
CREATE TRIGGER trg_ddh_ngoai_khoa_u BEFORE UPDATE ON dat_don_hang
WHEN OLD.nguon_ngoai IS NOT NULL AND NEW.ngoai_rev IS OLD.ngoai_rev
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER trg_ddh_ngoai_khoa_d BEFORE DELETE ON dat_don_hang
WHEN OLD.nguon_ngoai IS NOT NULL
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER trg_pd_ngoai_khoa_u BEFORE UPDATE ON phieu_dat
WHEN OLD.nguon_ngoai IS NOT NULL
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER trg_pd_ngoai_khoa_d BEFORE DELETE ON phieu_dat
WHEN OLD.nguon_ngoai IS NOT NULL
BEGIN SELECT RAISE(IGNORE); END;
-- Khong cho dua don khoa vao PXK / ticket thieu LK / yeu cau huy (bao loi ro), khong ghi log/giai trinh cua luong mua hang.
CREATE TRIGGER trg_pxkd_ngoai_khoa BEFORE INSERT ON phieu_xuat_kho_dong
WHEN EXISTS (SELECT 1 FROM dat_don_hang WHERE id = NEW.dat_don_hang_id AND nguon_ngoai IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'DON_SUA_CHUA_KHOA'); END;
CREATE TRIGGER trg_tlk_ngoai_khoa BEFORE INSERT ON thieu_lk
WHEN EXISTS (SELECT 1 FROM dat_don_hang WHERE id = NEW.dat_don_hang_id AND nguon_ngoai IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'DON_SUA_CHUA_KHOA'); END;
CREATE TRIGGER trg_ych_ngoai_khoa BEFORE INSERT ON yeu_cau_huy_don
WHEN EXISTS (SELECT 1 FROM dat_don_hang WHERE id = NEW.dat_don_hang_id AND nguon_ngoai IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'DON_SUA_CHUA_KHOA'); END;
CREATE TRIGGER trg_ddhl_ngoai_khoa BEFORE INSERT ON dat_don_hang_log
WHEN EXISTS (SELECT 1 FROM dat_don_hang WHERE id = NEW.dat_don_hang_id AND nguon_ngoai IS NOT NULL)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER trg_ddhgt_ngoai_khoa BEFORE INSERT ON dat_don_hang_giai_trinh
WHEN EXISTS (SELECT 1 FROM dat_don_hang WHERE id = NEW.dat_don_hang_id AND nguon_ngoai IS NOT NULL)
BEGIN SELECT RAISE(IGNORE); END;
