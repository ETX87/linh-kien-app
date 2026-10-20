-- Migration 0094 (2026-10-20): CHO PHEP THANH TOAN SAU - "cho phép kế toán hoặc tác nghiệp xác nhận cho phép thanh toán sau với các đơn chờ
-- chuyển tiền. 1. Đơn sẽ không thể chuyển đến bước duyệt kế toán xác nhận phiếu nếu chưa chuyển đủ tiền 2. sau này vẫn có thể sửa tiền, bổ sung
-- tiền như 1 đơn bình thường (trước khi kế toán xác nhận phiếu)". TN/Ke toan bam tren don "Cho thanh toan" -> don di tiep KHONG cho tien (du ton =
-- tu duyet, thieu = "Cho hang" + ticket); tien van thu o phieu xuat nhu don thuong ("Gửi kế toán" van chan MISSING_CHUYEN_TIEN_APPROVED).
-- Ghi nguoi/luc cho phep (hien o chi tiet don + bo qua chan "Chờ hàng" chua thanh toan cua don dac thu - chuaChuyenTienChoHang).
ALTER TABLE dat_don_hang ADD COLUMN thanh_toan_sau_luc TEXT;
ALTER TABLE dat_don_hang ADD COLUMN thanh_toan_sau_boi TEXT;
