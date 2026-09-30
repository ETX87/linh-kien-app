-- DON BAT BUOC CHUYEN TIEN TRUOC (chot 2026-09-30, phan hoi "các đơn cần chuyển tiền (tiền cần chuyển >0) mặc định đẩy hết
-- vào phiếu, bất kể được duyệt tự động hay không, để yêu cầu KTV chuyển khoản"): don Mua / TRỪ CÔNG NỢ co tien > 0 TAO MOI
-- tu vao phieu ngay luc tao (ke ca don con cho TN duyet) va danh dau cot nay = 1. Don co co nay CHI chuyen "Cho hang" duoc
-- khi DA chuyen tien (Ke toan da xac nhan tien phieu chua don, hoac don dang mang tien da tra - migration 0056). Don cu
-- (truoc khi trien khai) = 0 -> giu quy tac cu (chot nguoi dung "chỉ áp cho đơn tạo mới").
ALTER TABLE dat_don_hang ADD COLUMN bat_buoc_chuyen_tien INTEGER NOT NULL DEFAULT 0;
