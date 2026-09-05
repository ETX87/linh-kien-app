-- Bat/tat rieng 3 loai thong bao "viec moi theo vai tro + khu vuc" (phan hoi 2026-09-05) - moi tai
-- khoan tu quyet dinh, mac dinh: "nhiem vu cua toi" BAT (nguoi dung can biet ngay), 2 loai con lai
-- TAT (theo doi mo rong, khong phai ai cung can). Tat KHONG xoa du lieu - thong_bao_ktv van ghi du,
-- chi khong day Web Push (xem lib/taskNotify.ts).
ALTER TABLE users ADD COLUMN nhan_tb_nhiem_vu INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN nhan_tb_lien_quan INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN nhan_tb_theo_doi INTEGER NOT NULL DEFAULT 0;
