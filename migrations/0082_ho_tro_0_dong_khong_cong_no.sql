-- Migration 0082 (2026-10-15): don "HỖ TRỢ 0 ĐỒNG" / "HỖ TRỢ 0 ĐỒNG (KÊNH MT)" KHONG tinh gia tri cong no - mac dinh bo qua buoc vuot
-- tran ("Cho GS duyet"), giong don KH tra gop (0063). Code tinh 0 tu dau (khongTinhCongNo, lib/pxkRecalculate.ts); trigger giu dung cho
-- MOI duong ghi (sua loai de xuat, duong ghi sau nay). CHI ap don tao/sua tu nay - don cu giu so_tien_cong_no da luu (chua chot backfill).
CREATE TRIGGER IF NOT EXISTS trg_ddh_ho_tro_0d_i AFTER INSERT ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ 0 ĐỒNG') > 0
BEGIN
  UPDATE dat_don_hang SET so_tien_cong_no = 0, danh_gia_cong_no = NULL WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ddh_ho_tro_0d_u AFTER UPDATE OF loai_de_xuat, loai_don ON dat_don_hang
WHEN NEW.loai_don = 'cong_no' AND instr(COALESCE(NEW.loai_de_xuat, ''), 'HỖ TRỢ 0 ĐỒNG') > 0
  AND (OLD.loai_de_xuat IS NOT NEW.loai_de_xuat OR OLD.loai_don IS NOT NEW.loai_don)
BEGIN
  UPDATE dat_don_hang SET so_tien_cong_no = 0, danh_gia_cong_no = NULL WHERE id = NEW.id;
END;
