-- Them index con thieu tren phieu_xuat_kho_dong(dat_don_hang_id) - bang nay chi co PK ghep
-- (phieu_xuat_kho_id, dat_don_hang_id) nen tra cuu theo dat_don_hang_id (huong nguoc lai PK) truoc
-- day khong dung duoc index nao, buoc SQLite phai tu build "automatic covering index" (quet toan
-- bang) MOI LAN chay - xay ra o ca GET /bao-cao-tong-the va GET /ton-dong-theo-ktv (datMuaLinhKien.ts),
-- 2 bao cao chay tren gan moi lan mo "Trang chu". Xac nhan qua EXPLAIN QUERY PLAN truoc khi them.
CREATE INDEX idx_pxkd_dat_don_hang_id ON phieu_xuat_kho_dong(dat_don_hang_id);
