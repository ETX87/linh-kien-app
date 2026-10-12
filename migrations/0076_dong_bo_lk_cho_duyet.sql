-- Migration 0076: DONG BO CA LK CHUA XAC NHAN sang DVBH/Sua chua (chot 2026-10-12).
-- Phan hoi: "là mã chưa xác nhận cũng cho phép đồng bộ về các hệ thống" - vd ma tao tay 3004030490 khong sang DVBH vi
-- dvbhSyncClient.ts loc trang_thai_ma IN ('Da xac nhan','Tu dong duyet') (migration 0053). Bo loc da go trong code;
-- cac ma "Cho xet duyet"/"Tu choi"/"Da doi ma" hien co co ngay_cap_nhat CU hon con tro dong bo nen phai lam moi
-- ngay_cap_nhat 1 lan de lan chay cron ke tiep day sang (upsert ben nhan, chay lai khong sao).
UPDATE linh_kien SET ngay_cap_nhat = datetime('now', '+7 hours')
WHERE trang_thai_ma IN ('Cho xet duyet', 'Tu choi', 'Da doi ma');
