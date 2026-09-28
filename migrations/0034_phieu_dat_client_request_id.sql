-- Chong tao don trung (2026-09-28, bug: KTV tao 1 don, he thong hien 5 don giong het lien tiep).
-- Client gui kem 1 ma ngau nhien cho moi lan bam "Tạo đơn" (giu nguyen khi bam lai cung noi dung sau
-- loi mang/timeout). POST /api/dat-mua-lk/phieu-dat gap lai ma da co -> tra ve phieu cu, khong tao
-- them. Unique index la chot chan cuoi cho 2 request chay song song cung ma (batch thu 2 bi rollback).
ALTER TABLE phieu_dat ADD COLUMN client_request_id TEXT;
CREATE UNIQUE INDEX idx_phieu_dat_client_request_id ON phieu_dat(client_request_id) WHERE client_request_id IS NOT NULL;
