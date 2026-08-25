-- Migration 0004: bang cau hinh chung dang key-value (phan hoi 2026-08-24: "cơ chế nén ảnh này cho
-- tôi bật tắt tuỳ chỉnh trong settings") - hien chi co 1 khoa "nen_anh_tra_hang" (bat/tat nen anh
-- phia trinh duyet truoc khi upload anh tra hang, xem frontend/src/lib/imageCompress.ts), thiet ke
-- key-value de dung lai duoc cho cac co bat/tat khac trong tuong lai ma khong can them migration
-- rieng moi lan.
CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_by  TEXT REFERENCES users(email),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO app_settings (key, value) VALUES ('nen_anh_tra_hang', '1');
