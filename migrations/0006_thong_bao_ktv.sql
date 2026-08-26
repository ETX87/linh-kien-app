-- Migration 0006: bang thong bao thay doi trang thai don cho nguoi tao don (KTV/Ve tinh) (phan hoi
-- 2026-08-26: "thêm 1 trang danh sách thông báo cho KTV với log các trạng thái của đơn thay đổi").
-- Nguon ghi: applyDonHangLog() (backend/src/routes/datMuaLinhKien.ts, khi don chuyen sang "Da huy"/
-- "TN tu choi"/"Cho hang"/"TN da duyet") + POST /:id/log cua phieuXuatKho.ts (khi PXK chuyen "Da chot
-- xong don xuat"/"Dang gui KTV"). CHI ap dung cho thay doi trang thai MOI tu thoi diem trien khai tro
-- di (theo xac nhan nguoi dung 2026-08-26) - khong backfill lich su cu tu dat_don_hang_log/
-- phieu_xuat_kho_log da co san.
CREATE TABLE thong_bao_ktv (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_nhan  TEXT NOT NULL REFERENCES users(email),
    -- "tu_choi" | "cho_hang" | "huy" | "da_duyet" | "pxk_da_duyet" | "kho_da_gui" - dung de to mau
    -- rieng tung loai o frontend (xem THONG_BAO_LOAI_TONE trong DatMuaLinhKienModule.tsx hoac file
    -- component rieng).
    loai        TEXT NOT NULL,
    noi_dung    TEXT NOT NULL,
    -- "don_hang" (bam vao mo chi tiet dat_don_hang.id tuong ung) hoac NULL (thong bao chung, vd PXK,
    -- khong co man chi tiet rieng de nhay toi).
    link_type   TEXT,
    link_id     TEXT,
    da_doc      INTEGER NOT NULL DEFAULT 0,
    ngay_tao    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Truy van chinh: danh sach theo nguoi_nhan, moi nhat truoc; dem chua doc theo nguoi_nhan.
CREATE INDEX idx_thong_bao_ktv_nguoi_nhan ON thong_bao_ktv(nguoi_nhan, ngay_tao DESC);
CREATE INDEX idx_thong_bao_ktv_chua_doc ON thong_bao_ktv(nguoi_nhan, da_doc);
