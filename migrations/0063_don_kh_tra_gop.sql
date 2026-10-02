-- DON KH TRA GOP (chot nguoi dung 2026-10-02): loai de xuat "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX" / "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NPP"
-- (nhom cong_no vi chua "HỖ TRỢ") KHONG tinh cong no: gia tri CN = 0 (so_tien_cong_no 0, danh_gia_cong_no NULL - khong cong vao
-- cong no phat sinh/tam tinh, khong danh gia Du/Khong du), loai chiet khau "Chiết khấu đơn KH trả góp" (ma he thong KH_TRA_GOP).
-- Code: laKhTraGop() o lib/pxkRecalculate.ts (+ ban sao FE helpers.ts). Trigger ben duoi giu dung cho MOI duong ghi (tao tay,
-- import Excel, doi loai de xuat). TN van sua tay duoc tien cong no / loai chiet khau sau do (trigger chi chay luc tao + doi loai).

INSERT OR IGNORE INTO settings_loai_chiet_khau (ma, ten, stt) VALUES ('KH_TRA_GOP', 'Chiết khấu đơn KH trả góp', 7);

-- Don cu (213 don luc chot, phan lon 210 don vua import "Cho TN duyet" dang mang 28.258.000d cong no).
UPDATE dat_don_hang
SET so_tien_cong_no = 0,
    danh_gia_cong_no = NULL,
    loai_chiet_khau_id = CASE WHEN loai_chiet_khau_thu_cong = 0
      THEN (SELECT id FROM settings_loai_chiet_khau WHERE ma = 'KH_TRA_GOP') ELSE loai_chiet_khau_id END
WHERE loai_don = 'cong_no' AND instr(COALESCE(loai_de_xuat, ''), 'HỖ TRỢ NGOÀI BẢO HÀNH TG12') > 0;

CREATE TRIGGER IF NOT EXISTS trg_ddh_kh_tra_gop_i AFTER INSERT ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ NGOÀI BẢO HÀNH TG12') > 0
BEGIN
  UPDATE dat_don_hang
  SET so_tien_cong_no = 0,
      danh_gia_cong_no = NULL,
      loai_chiet_khau_id = CASE WHEN loai_chiet_khau_thu_cong = 0
        THEN (SELECT id FROM settings_loai_chiet_khau WHERE ma = 'KH_TRA_GOP') ELSE loai_chiet_khau_id END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ddh_kh_tra_gop_u AFTER UPDATE OF loai_de_xuat, loai_don ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ NGOÀI BẢO HÀNH TG12') > 0
  AND (OLD.loai_de_xuat IS NOT NEW.loai_de_xuat OR OLD.loai_don IS NOT NEW.loai_don)
BEGIN
  UPDATE dat_don_hang
  SET so_tien_cong_no = 0,
      danh_gia_cong_no = NULL,
      loai_chiet_khau_id = CASE WHEN loai_chiet_khau_thu_cong = 0
        THEN (SELECT id FROM settings_loai_chiet_khau WHERE ma = 'KH_TRA_GOP') ELSE loai_chiet_khau_id END
  WHERE id = NEW.id;
END;
