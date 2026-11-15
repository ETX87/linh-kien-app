-- CÔNG NỢ SỬA CHỮA (v1.496, chot 2026-11-16 - "chọn ô bảo hành lấy thẳng từ app đổi trả nhưng vẫn cho nhập tay nếu không có (vì có thể đặt
-- cho đơn không thuộc app đổi trả)"): bh_don_vi_id gio nhan CA ma go tay (don ngoai app Bao hanh doi tra). Co nay = 1 khi luc tao don ma
-- tim thay tren app Bao hanh doi tra (GET /api/partner/sync/don-vi-sua-chua?ma=) - giai doan tu tru cong no chi tu dong voi don co lien ket.
ALTER TABLE dat_don_hang ADD COLUMN bh_lien_ket INTEGER NOT NULL DEFAULT 0;
