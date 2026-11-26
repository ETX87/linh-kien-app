-- v1.568 (26/11/2026): nhat ky dong bo ngay du kien tu app EO Mua hang -> ticket thieu hang (THB / TLK).
-- Moi lan cron ghi de ngay du kien (hoac ma EO) tren 1 ticket -> 1 dong o day (truoc / sau, PO, dong EO).
-- Khong chen dong vao thieu_lk_log vi trang thai ticket lay theo dong log moi nhat + SLA tinh tu gio dong log -> chen se reset dong ho SLA.
CREATE TABLE IF NOT EXISTS dong_bo_ngay_eo_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL,
  loai          TEXT NOT NULL CHECK (loai IN ('THB', 'TLK')),
  ngay_cu       TEXT,
  ngay_moi      TEXT NOT NULL,
  ma_eo_cu      TEXT,
  ma_eo_moi     TEXT,
  eo_item_id    INTEGER,
  khop_theo     TEXT,
  luc           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dbne_ticket ON dong_bo_ngay_eo_log(ticket_id, id);
