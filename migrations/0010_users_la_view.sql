-- Migration 0010: them vai tro nghiep vu moi "View" (phan hoi 2026-08-26, muc 1: danh sach vai tro
-- Nhan vien van phong gom "Giám sát, Tác nghiệp, Kho, Kế toán, QC, View, Admin, TBP DVBH" - 7/8 gia
-- tri da co san qua vai_tro/6 co hien co, chi "View" la hoan toan moi). Dat cung kieu voi
-- la_kho/la_ke_toan/la_tac_nghiep/la_tp_dvbh (co boolean doc lap, KHONG phai gia tri vai_tro moi vi
-- vai_tro la truong loai tru lan nhau con nhom co nay duoc phep cong don). Y nghia quyen han cu the
-- (chi doc bao cao/danh sach, khong tao/duyet/sua) se wire vao middleware o dot rieng - migration nay
-- chi tao cho du lieu.
ALTER TABLE users ADD COLUMN la_view INTEGER NOT NULL DEFAULT 0;
