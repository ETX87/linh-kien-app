-- 0060: bat/tat THEO TUNG MA KTV (chot 2026-10-01). Truoc do cong tac o Quan ly nguoi dung > KTV hien truong khoa
-- users.bi_khoa cua Gmail dang nhap -> 2 ma KTV dung CHUNG 1 Gmail (vd sonnmh.dvbh-hcm + sonnmh.ptdv-hcm) tat 1 la tat ca 2.
-- Gio: ngung_hoat_dong = ma nay bi tat (an khoi o chon nguoi nhan hang, import theo ma bi chan); Gmail CHI bi khoa dang nhap
-- khi MOI ma dung Gmail do deu tat (xem PATCH /settings/ktv-lien-he/:ma/bat-tat).
ALTER TABLE ktv_lien_he ADD COLUMN ngung_hoat_dong INTEGER NOT NULL DEFAULT 0;
-- Giu nguyen trang thai hien tai: ma co Gmail dang bi khoa -> coi la tat.
UPDATE ktv_lien_he SET ngung_hoat_dong = 1
WHERE email_dang_nhap IN (SELECT email FROM users WHERE bi_khoa = 1);
