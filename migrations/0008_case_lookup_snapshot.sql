-- Migration 0008: cache "snapshot" ket qua tra cuu day du 1 case tu API doi tac (xem
-- backend/src/lib/caseLookupClient.ts + PARTNER_API_GUIDE.md). Phuc vu man "Xem chi tiet case" moi
-- (mo tu bat ky noi nao dang hien ID case trong don hang) - CHOT: chi keo API doi tac 1 LAN dau tien
-- roi luu lai (tranh goi lap API doi tac moi lan mo lai chi tiet 1 case da xem truoc do), nguoi dung
-- tu bam "Dong bo lai" khi can du lieu moi nhat. `data` la nguyen van JSON cua CaseLookupPreview (ca
-- 29 field ke ca tai chinh) tai thoi diem dong bo gan nhat.
CREATE TABLE case_lookup_snapshot (
    case_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    synced_at  TEXT NOT NULL
);
