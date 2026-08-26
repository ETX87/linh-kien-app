-- Migration 0007: luu Web Push subscription cua tung thiet bi (phan hoi 2026-08-26: "Khi có tin nhắn
-- thông báo mới => đẩy thông báo lập tức cho nhân sự nhận thông báo") - dung chung 1 co che Web Push
-- (Push API + Service Worker, xem frontend/public/sw.js) cho CA mobile (hien qua he thong thong bao
-- cua OS/PWA) lan desktop web (browser tu hien popup he thong o goc man hinh) - khac biet hien thi
-- giua 2 nen tang la do TRINH DUYET/OS tu quyet dinh, khong phai 2 co che rieng o phia app.
-- 1 nguoi dung co the co NHIEU dong (nhieu thiet bi/trinh duyet dang bat thong bao cung luc) - moi
-- dong ung voi 1 PushSubscription duy nhat (endpoint la khoa tu nhien, browser tu sinh moi lien he).
CREATE TABLE push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung  TEXT NOT NULL REFERENCES users(email),
    endpoint    TEXT NOT NULL UNIQUE,
    -- Nguyen van 2 truong "keys" tu PushSubscription.toJSON() (base64url) - can du de dung lai
    -- buildPushPayload() cua @block65/webcrypto-web-push luc gui, khong tach nho hon.
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    ngay_tao    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Truy van chinh: lay TOAN BO subscription cua 1 nguoi dung luc can day thong bao.
CREATE INDEX idx_push_subscriptions_nguoi_dung ON push_subscriptions(nguoi_dung);
