-- 2026-11-07: API bang gia doi tac (gia88, tai lieu v2.0 - api-lk-prices_gia88.md) them truong "boMa" = LK da bo ma
-- (van con vi KTV con ton kho, KHONG nen dat moi). Luu vao linh_kien.bo_ma, dong bo moi dem cung cac truong gia88 khac.
-- App chi CANH BAO (nhan "Đã bỏ mã" truoc ten LK), khong chan dat - cung cach "Cấm bán" (chot 2026-10-10).
ALTER TABLE linh_kien ADD COLUMN bo_ma INTEGER NOT NULL DEFAULT 0;
