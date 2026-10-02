-- TN bat/tat "Linh kiện đặc thù" TREN TUNG DON (2026-10-02, phan hoi "Cho phép tác nghiệp tắt bật phân loại linh kiện đặc
-- thù trực tiếp trên đơn ... nếu tắt nó sẽ thoát khỏi các luồng quy trình liên quan"). NULL = theo linh_kien.dac_thu (nhu cu);
-- 0/1 = TN chon tay, thang danh muc. Gia tri hieu luc: COALESCE(ddh.dac_thu_thu_cong, lk.dac_thu, 0) - DAC_THU_DON_SQL o
-- routes/datMuaLinhKien.ts.
ALTER TABLE dat_don_hang ADD COLUMN dac_thu_thu_cong INTEGER;
ALTER TABLE dat_don_hang ADD COLUMN dac_thu_nguoi_sua TEXT;
ALTER TABLE dat_don_hang ADD COLUMN dac_thu_sua_luc TEXT;
