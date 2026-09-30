-- KHO XUAT CHO LINH KIEN PHAN LOAI "Máy" (chot 2026-09-30): dong co linh_kien.don_vi = 'Máy' (cot "Phân loại") trong file
-- MISA xuat tu kho ky gui hang moi KRF theo mien, THAY kho cong ty theo mien (misa_ma_kho_mien_*); TRU dong "TRỪ CÔNG NỢ"
-- (van tru kho cua KTV). Admin sua o Cai dat > Ma kho mac dinh (xuat file MISA). Xem lib/misaExport.ts.
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('misa_ma_kho_may_mien_bac', '157KRFM-MB'),
  ('misa_ten_kho_may_mien_bac', 'Kho ký gửi hàng mới KRF-Hưng Yên'),
  ('misa_ma_kho_may_mien_nam', '157KRFM-MN'),
  ('misa_ten_kho_may_mien_nam', 'Kho ký gửi hàng mới KRF-Q2 HCM');
