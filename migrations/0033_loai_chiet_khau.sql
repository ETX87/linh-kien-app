-- Loai chiet khau duoc huong cho tung dong don hang (yeu cau 2026-09-26: "bổ sung thêm 1 cột loại chiết
-- khấu được hưởng cho các loại đơn... tự động thêm theo đúng dạng chiết khấu hệ thống sinh ra, cho phép
-- TN chọn lại nếu sai, danh sách bổ sung/tắt trong settings, TN tự thêm loại chưa tồn tại").
--
-- CHOT voi nguoi dung: (1) loai chiet khau CHI LA NHAN phan loai - doi loai KHONG tinh lai "Tiền cần
-- chuyển" (TN van sua tien rieng nhu cu); (2) he thong gan tu dong LUC TAO PXK (nguong 200k/500k tinh
-- tren tong cac dong trong PXK) + tinh lai khi them/bo dong khoi PXK - don chua vao PXK de trong.
--
-- `ma` != NULL = loai HE THONG sinh ra (khop dung 1 nhanh cua computeGoiYSoTienChuyen trong
-- routes/phieuXuatKho.ts) - khong xoa duoc, chi doi ten/tat. `ma` NULL = loai do Admin/TN tu them.
CREATE TABLE settings_loai_chiet_khau (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ma              TEXT UNIQUE,
    ten             TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    stt             INTEGER NOT NULL DEFAULT 0,
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT
);

INSERT INTO settings_loai_chiet_khau (ma, ten, stt) VALUES
  ('KHONG_CK',     'Không chiết khấu (giá bán)',               1),
  ('DINH_TU',      'Chiết khấu linh kiện dạng Đình tủ (15%)',  2),
  ('TONG_200_500', 'Chiết khấu tổng 200k–500k (30%)',          3),
  ('GIA_KTV',      'Chiết khấu KTV (tổng ≥ 500k)',             4),
  ('GIA_DU_PHONG', 'Giá dự phòng (trong hạn mức)',             5),
  ('CONG_NO',      'Công nợ (giá KTV)',                        6);

-- Gan tren tung dong don hang. thu_cong = 1: TN da tu chon lai -> he thong KHONG ghi de khi tinh lai.
ALTER TABLE dat_don_hang ADD COLUMN loai_chiet_khau_id INTEGER REFERENCES settings_loai_chiet_khau(id);
ALTER TABLE dat_don_hang ADD COLUMN loai_chiet_khau_thu_cong INTEGER NOT NULL DEFAULT 0;
