-- v1.547 (2026-11-21) - "sẽ cho ktv chọn lại, nhưng trên app đổi trả và app linh kiện, sẽ hiện cảnh báo rất rõ ràng cho các đơn vị, bộ phận
-- liên quan biết linh kiện này đang được chọn loại đề xuất khác với đề xuất thực tế phải chọn. (vì trong thực tế, sp hết bảo hành nhưng lk bên
-- trong sp có thể vẫn còn bảo hành)": he thong KHONG con tu ghi de loai de xuat cap linh kien sua chua theo don bao hanh. Don chon KHAC loai
-- he thong goi y luu lai loai goi y + ly do (Hang / Doi tac / con-het BH luc tao don) -> canh bao o chi tiet / danh sach / phieu xuat.
-- NULL = khop goi y hoac khong co goi y.
ALTER TABLE dat_don_hang ADD COLUMN loai_goi_y TEXT;
ALTER TABLE dat_don_hang ADD COLUMN loai_goi_y_ly_do TEXT;
