-- Mau MISA de xuat theo cot FOM file "Diễn giải hệ thống misa.xlsx" (chot 2026-10-05): don CÔNG NỢ / HỖ TRỢ dung mau
-- "MISA CN, hỗ trợ" (ma noi bo 'xuat_kho'). Code (lib/misaExport.ts resolveTemplate) bo quy tac cu "phieu cong no LUON Chuyen
-- kho" - mau de xuat gio theo cot nay; chua dien thi phieu cong no van Chuyen kho, phieu mua van Ban hang.
-- Giu nguyen: TRẢ HÀNG * (Chuyen kho), TRỪ CÔNG NỢ * (Ban hang), "CÔNG NỢ (XUẤT HÀNG TỪ KHO TRUNG GIAN)" (Chuyen kho).
-- "CÔNG NỢ" truoc day co 2 dong (2 nhom vai tro) mau thuan: chuyen_kho / xuat_kho -> thong nhat xuat_kho.
UPDATE settings_loai_de_xuat SET loai_file_xuat_misa = 'xuat_kho'
WHERE ten_option IN (
  'CÔNG NỢ',
  'CÔNG NỢ - ĐƠN ĐANG XỬ LÝ',
  'HỖ TRỢ 0 ĐỒNG',
  'HỖ TRỢ 0 ĐỒNG (KÊNH MT)',
  'HỖ TRỢ CÔNG NỢ',
  'HỖ TRỢ CÔNG NỢ (KÊNH MT)',
  'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NPP',
  'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX'
);
