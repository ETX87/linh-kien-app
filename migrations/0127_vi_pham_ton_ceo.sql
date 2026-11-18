-- Migration 0127: vi pham - trang thai "Gan the" doi thanh "Ton CEO" (2026-11-18, v1.524).
-- Yeu cau: "Đơn sau mốc hạn giải trình mà không giải trình sẽ chuyển sang trạng thái tồn CEO sau khi hết Hạn giải trình (giờ)"
-- + "Danh sách các đơn bị lỗi tồn CEO sẽ bắn API sang cho đối tác" (GET /api/partner/v1/danh-sach-ton?loai=ton-ceo).
-- Doi gia tri trong CHECK -> phai dung lai bang (giu nguyen du lieu, cot gan_the_luc giu ten = luc chuyen Ton CEO).

CREATE TABLE vi_pham_moi (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  buoc               TEXT NOT NULL,
  loai               TEXT NOT NULL CHECK (loai IN ('dat_hang', 'tra_hang')),
  bo_phan            TEXT NOT NULL,
  doi_tuong          TEXT NOT NULL CHECK (doi_tuong IN ('don', 'ticket', 'phieu')),
  doi_tuong_id       TEXT NOT NULL,
  dat_don_hang_id    TEXT,
  phieu_xuat_kho_id  TEXT,
  khu_vuc_ma         TEXT,
  nguoi_nhan_hang    TEXT,
  moc_vao            TEXT NOT NULL,
  so_gio_sla         INTEGER NOT NULL,
  han                TEXT NOT NULL,
  ket_thuc_luc       TEXT,
  trang_thai_sau     TEXT,
  nguoi_xu_ly        TEXT,
  -- JSON array email nguoi PHAI giai trinh (tinh lai moi lan quet khi con 'Cho giai trinh' - xem lib/viPham.ts nguoiPhuTrach)
  nguoi_phu_trach    TEXT,
  trang_thai         TEXT NOT NULL DEFAULT 'Cho giai trinh'
                     CHECK (trang_thai IN ('Cho giai trinh', 'Da giai trinh', 'Ton CEO', 'Cho xem xet', 'Da go the')),
  han_giai_trinh     TEXT NOT NULL,
  ly_do              TEXT,                    -- ly do chon tu danh muc (settings_ly_do_cham "Mua hàng") hoac "Khác"
  giai_trinh         TEXT,
  nguoi_giai_trinh   TEXT,
  giai_trinh_luc     TEXT,
  giai_trinh_tu_dong INTEGER NOT NULL DEFAULT 0,
  bao_luc            TEXT,                    -- da bao nguoi phu trach (thong bao "ca moi")
  nhac_luc           TEXT,                    -- da nhac "sap het han giai trinh"
  gan_the_luc        TEXT,
  khieu_nai          TEXT,                    -- "Báo không đúng": noi dung
  khieu_nai_boi      TEXT,
  khieu_nai_luc      TEXT,
  khieu_nai_truoc    TEXT,                    -- trang thai truoc khi bao (de Admin tu choi thi tra ve)
  khieu_nai_ket_qua  TEXT,                    -- 'Chap nhan' | 'Tu choi'
  khieu_nai_xu_ly_boi TEXT,
  khieu_nai_xu_ly_luc TEXT,
  khieu_nai_phan_hoi TEXT,
  go_the_ly_do       TEXT,
  go_the_boi         TEXT,
  go_the_luc         TEXT,
  tao_luc            TEXT NOT NULL,
  cap_nhat_luc       TEXT NOT NULL,
  UNIQUE (buoc, doi_tuong_id, moc_vao)
);

INSERT INTO vi_pham_moi (id, buoc, loai, bo_phan, doi_tuong, doi_tuong_id, dat_don_hang_id, phieu_xuat_kho_id, khu_vuc_ma, nguoi_nhan_hang, moc_vao, so_gio_sla, han, ket_thuc_luc, trang_thai_sau, nguoi_xu_ly, nguoi_phu_trach, trang_thai, han_giai_trinh, ly_do, giai_trinh, nguoi_giai_trinh, giai_trinh_luc, giai_trinh_tu_dong, bao_luc, nhac_luc, gan_the_luc, khieu_nai, khieu_nai_boi, khieu_nai_luc, khieu_nai_truoc, khieu_nai_ket_qua, khieu_nai_xu_ly_boi, khieu_nai_xu_ly_luc, khieu_nai_phan_hoi, go_the_ly_do, go_the_boi, go_the_luc, tao_luc, cap_nhat_luc)
SELECT id, buoc, loai, bo_phan, doi_tuong, doi_tuong_id, dat_don_hang_id, phieu_xuat_kho_id, khu_vuc_ma, nguoi_nhan_hang, moc_vao, so_gio_sla, han, ket_thuc_luc, trang_thai_sau, nguoi_xu_ly, nguoi_phu_trach, CASE WHEN trang_thai = 'Gan the' THEN 'Ton CEO' ELSE trang_thai END, han_giai_trinh, ly_do, giai_trinh, nguoi_giai_trinh, giai_trinh_luc, giai_trinh_tu_dong, bao_luc, nhac_luc, gan_the_luc, khieu_nai, khieu_nai_boi, khieu_nai_luc, khieu_nai_truoc, khieu_nai_ket_qua, khieu_nai_xu_ly_boi, khieu_nai_xu_ly_luc, khieu_nai_phan_hoi, go_the_ly_do, go_the_boi, go_the_luc, tao_luc, cap_nhat_luc
FROM vi_pham;

DROP TABLE vi_pham;
ALTER TABLE vi_pham_moi RENAME TO vi_pham;
CREATE INDEX idx_vi_pham_cap_nhat ON vi_pham(cap_nhat_luc, id);
CREATE INDEX idx_vi_pham_trang_thai ON vi_pham(trang_thai, bo_phan);
CREATE INDEX idx_vi_pham_don ON vi_pham(dat_don_hang_id);
CREATE INDEX idx_vi_pham_phieu ON vi_pham(phieu_xuat_kho_id);
CREATE INDEX idx_vi_pham_doi_tuong ON vi_pham(doi_tuong_id);
CREATE INDEX idx_vi_pham_ton_ceo ON vi_pham(trang_thai, gan_the_luc);
