-- Migration 0016: mo rong dvbh_sync_state de dong bo day toi NHIEU dich (khong chi rieng "dvbh" nua)
-- + them entity "khu_vuc" - phan hoi 04/09/2026: "Bên linh-kien-app sẽ bắn api khi danh sách ktv có
-- thay đổi. bên app sua chua sẽ nhận api vào cập nhật danh sách" + "Khu vực sẽ học linh-kien-app.
-- lấy thông tin đồng bộ tự động từ linh-kien-app khi bên linh kien app có thay đổi" (xem CLAUDE.md
-- repo "gui-bao-hanh-linh-kien" muc "Chot 5 cau hoi mo..." + "Cau hoi #6 chot xong...").
--
-- Truoc migration nay, dvbh_sync_state.entity la PRIMARY KEY don (gia dinh CHI 1 dich "dvbh") - gio
-- co them Worker "suachua" (doc lap thu 3, xem CLAUDE.md repo do) cung can nhan dung du lieu nay, nen
-- can theo doi con tro RIENG cho tung cap (entity, target) - vd KTV co the da dong bo xong toi "dvbh"
-- nhung chua xong toi "suachua" (loi tam thoi/deploy lech nhau), khong duoc de 1 dich thanh cong lam
-- "an" mat viec dich kia con dang cho.
--
-- Khong co bang nao FK toi dvbh_sync_state (da kiem tra truoc khi viet migration nay) - an toan dung
-- pattern "tao bang moi -> copy -> drop -> rename" thay vi ALTER TABLE (SQLite khong cho doi PRIMARY
-- KEY tai cho).
CREATE TABLE dvbh_sync_state_new (
    entity          TEXT NOT NULL,   -- 'ktv' | 'linh_kien' | 'khu_vuc'
    target          TEXT NOT NULL,   -- 'dvbh' | 'suachua'
    last_synced_at  TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
    PRIMARY KEY (entity, target)
);

-- Du lieu cu (entity don, chi co dich "dvbh") chuyen thang sang, giu nguyen tien do da dong bo toi
-- dvbh - khong reset ve epoch (tranh gui lai toan bo KTV/linh kien 1 lan nua khong can thiet).
INSERT INTO dvbh_sync_state_new (entity, target, last_synced_at)
    SELECT entity, 'dvbh', last_synced_at FROM dvbh_sync_state;

DROP TABLE dvbh_sync_state;
ALTER TABLE dvbh_sync_state_new RENAME TO dvbh_sync_state;

-- Seed cac cap (entity, target) MOI - deu bat dau tu epoch (chua tung dong bo lan nao):
--   - ktv/linh_kien toi "suachua" (dich moi, du lieu da co san tu lau nhung chua tung gui sang do)
--   - khu_vuc toi "suachua" (entity MOI HOAN TOAN, chi "suachua" can, "dvbh" khong co khai niem Khu
--     vuc trong schema cua no nen KHONG seed cap (khu_vuc, dvbh))
INSERT INTO dvbh_sync_state (entity, target, last_synced_at) VALUES
    ('ktv', 'suachua', '1970-01-01 00:00:00'),
    ('linh_kien', 'suachua', '1970-01-01 00:00:00'),
    ('khu_vuc', 'suachua', '1970-01-01 00:00:00');
