-- API key cho cac he thong DOI TAC goi VAO he nay tra cuu don hang/lich su theo case_id (xem
-- backend/src/lib/partnerApiAuth.ts, routes/partnerApi.ts). Chi luu HASH (SHA-256 hex cua key that)
-- - KHONG BAO GIO luu plaintext, cung nguyen tac voi partner_api_keys cua he DVBH goc (xem
-- CLAUDE.md "Diem noi he DVBH goc"). key_hash UNIQUE de tra cuu 1 lan qua index, khong quet toan bang.
CREATE TABLE partner_api_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ten_he_thong  TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  bat_tat       INTEGER NOT NULL DEFAULT 1,
  ghi_chu       TEXT,
  tao_luc       TEXT NOT NULL DEFAULT (datetime('now')),
  lan_dung_cuoi TEXT
);
