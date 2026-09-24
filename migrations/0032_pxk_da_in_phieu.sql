-- Migration 0032: them co phu "Da in phieu" cho phieu_xuat_kho (phan hoi 2026-09-24: "ở giai đoạn chờ
-- kho gửi hàng cho ktv, thêm 1 trạng thái phụ là đã in phiếu/ chưa in phiếu để kho xác định được phiếu
-- nào đã in, phiếu nào chưa in - chỉ là trạng thái phụ để theo dõi, không thay đổi luồng công việc") -
-- CO PHU rieng cua Kho, KHONG phai 1 buoc trong chuoi trang_thai_hien_tai chinh (Dang tao phieu -> ...
-- -> KTV da nhan/...), khong gate/khong anh huong luong xu ly. Mac dinh 0 (chua in) cho MOI PXK cu.
ALTER TABLE phieu_xuat_kho ADD COLUMN da_in_phieu INTEGER NOT NULL DEFAULT 0;
