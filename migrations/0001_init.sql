-- He doc lap "Dat mua linh kien" - schema TONG HOP 1 lan tu he DVBH goc (khong replay lich su 20+
-- migration nho cua he goc - xem CLAUDE.md muc "Nguon goc tach he thong"). Dung dung shape CUOI CUNG
-- cua tung bang o he goc tinh den 2026-08-19, tru cac cot/bang thuoc mien nghiep vu KHONG tach sang
-- day (khu_vuc_phu_trach, la_ksnb_doi_tac, modules, co_the_import_tranh_chap, sdt/ghi_chu CSKH cua
-- ktv_lien_he van GIU vi khong ton hai gi khi port nguyen, xem settingsKtv.ts).
--
-- GIU NGUYEN "phieu_dat" (bang header vestigial, khong con doc o dau ca sau khi he goc bo khai niem
-- nay o migration 0075 cua chinh no) thay vi bo han - dat_don_hang.id van sinh qua id_counters voi
-- key "phieu_dat" (dung y he goc, chi la ten key lich su) de giu nguyen logic sinh ID trong
-- routes/datMuaLinhKien.ts, giam rui ro khi port so voi viec vong qua sinh lai logic ID moi.
--
-- SUA 1 CHECK constraint bi loi thoi o he goc: dat_don_hang_log.trang_thai thieu gia tri
-- 'Cho TBP xac nhan' (code he goc da dung tu 2026-08-17, migration 0082, nhung chua migration nao
-- cap nhat lai CHECK) - da them dung ngay tu dau o day.

CREATE TABLE users (
    email               TEXT PRIMARY KEY,
    ten                 TEXT,
    vai_tro             TEXT CHECK (vai_tro IN ('Admin', 'QC', 'Giam sat')),
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'Cho duyet' CHECK (trang_thai_duyet IN ('Cho duyet', 'Da duyet', 'Tu choi')),
    bi_khoa             INTEGER NOT NULL DEFAULT 0,
    la_ktv_dvbh         INTEGER NOT NULL DEFAULT 0,
    la_ve_tinh          INTEGER NOT NULL DEFAULT 0,
    la_kho              INTEGER NOT NULL DEFAULT 0,
    la_ke_toan          INTEGER NOT NULL DEFAULT 0,
    la_tac_nghiep       INTEGER NOT NULL DEFAULT 0,
    la_tp_dvbh          INTEGER NOT NULL DEFAULT 0,
    quan_ly_danh_muc_lk INTEGER NOT NULL DEFAULT 0,
    xem_danh_muc_lk     INTEGER NOT NULL DEFAULT 1,
    tram_cha            TEXT REFERENCES users(email),
    giam_sat_quan_ly    TEXT REFERENCES users(email),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_gs_ql ON users(giam_sat_quan_ly) WHERE giam_sat_quan_ly IS NOT NULL;
CREATE INDEX idx_users_tram_c ON users(tram_cha) WHERE tram_cha IS NOT NULL;

CREATE TABLE login_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    thoi_gian   TEXT NOT NULL DEFAULT (datetime('now')),
    ip          TEXT,
    user_agent  TEXT
);
CREATE INDEX idx_login_log_thoi_gian ON login_log(thoi_gian);
CREATE INDEX idx_login_log_email ON login_log(email);

-- ---------- Danh muc linh kien (ban sao doc lap - KHONG chung voi module giai trinh o he goc) ----------

CREATE TABLE linh_kien (
    ma_linh_kien    TEXT PRIMARY KEY,
    ten_linh_kien   TEXT NOT NULL,
    gia_ban         REAL,
    gia_tham_chieu  REAL,
    don_vi          TEXT,
    ghi_chu         TEXT,
    anh_demo        TEXT,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now')),
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    dac_thu         INTEGER NOT NULL DEFAULT 0,
    chi_sua_chua    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lk_nhom_thay_the (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_nhom        TEXT NOT NULL,
    ghi_chu         TEXT,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE lk_nhom_thay_the_ct (
    nhom_id TEXT    NOT NULL REFERENCES lk_nhom_thay_the(id),
    ma_lk   TEXT    NOT NULL REFERENCES linh_kien(ma_linh_kien),
    PRIMARY KEY (nhom_id, ma_lk)
);
CREATE INDEX idx_lk_nhom_ct_ma ON lk_nhom_thay_the_ct(ma_lk);

CREATE TABLE lk_bom (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_model     TEXT NOT NULL,
    ma_lk        TEXT NOT NULL,
    ten_lk       TEXT,
    so_luong     REAL NOT NULL DEFAULT 1,
    ngay_import  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bom_model ON lk_bom(ma_model);
CREATE INDEX idx_bom_ma_lk ON lk_bom(ma_lk);

-- ---------- Danh ba KTV (schema giu nguyen so voi he goc, xem settingsKtv.ts) ----------

CREATE TABLE ktv_lien_he (
    ma_ktv           TEXT PRIMARY KEY,
    ten_hien_thi     TEXT,
    sdt              TEXT,
    ghi_chu          TEXT,
    nguoi_cap_nhat   TEXT REFERENCES users(email),
    ngay_cap_nhat    TEXT NOT NULL DEFAULT (datetime('now')),
    gmail            TEXT,
    vai_tro_ktv      TEXT CHECK (vai_tro_ktv IN ('KTV', 'CTV', 'Tram', 'Ve tinh')),
    giam_sat_quan_ly TEXT,
    email_dang_nhap  TEXT
);

-- ---------- Settings: ly do cham, loai de xuat ----------

CREATE TABLE settings_ly_do_cham (
    id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_ly_do                    TEXT NOT NULL,
    he_thong_su_dung             TEXT NOT NULL,
    quan_ly_don_thieu_linh_kien  INTEGER NOT NULL DEFAULT 0,
    bat_tat                      INTEGER NOT NULL DEFAULT 1,
    stt                          INTEGER NOT NULL DEFAULT 0,
    nguoi_cap_nhat               TEXT REFERENCES users(email),
    ngay_cap_nhat                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings_loai_de_xuat_nhom (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_nhom        TEXT NOT NULL,
    vai_tro_json    TEXT NOT NULL DEFAULT '[]',
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE settings_loai_de_xuat (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom_id         INTEGER NOT NULL REFERENCES settings_loai_de_xuat_nhom(id),
    ten_option      TEXT NOT NULL,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    stt             INTEGER NOT NULL DEFAULT 0,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_loai_de_xuat_nhom_id ON settings_loai_de_xuat(nhom_id, bat_tat);

-- ---------- Google Drive OAuth (uy quyen 1 tai khoan that de upload anh minh hoa linh kien) ----------

CREATE TABLE google_drive_oauth (
    id                 INTEGER PRIMARY KEY,
    google_email       TEXT NOT NULL,
    refresh_token_enc  TEXT NOT NULL,
    folder_id          TEXT NOT NULL,
    authorized_by      TEXT REFERENCES users(email),
    authorized_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Luong chinh: dat_don_hang (dat mua/cong no/tra hang deu chung 1 bang, phan biet loai_don) ----------

CREATE TABLE phieu_dat (
    id               TEXT PRIMARY KEY,
    nguoi_tao        TEXT NOT NULL REFERENCES users(email),
    ngay_tao         TEXT NOT NULL DEFAULT (datetime('now')),
    email_gs         TEXT REFERENCES users(email),
    ghi_chu          TEXT,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    nguoi_nhan_hang  TEXT REFERENCES users(email)
);
CREATE INDEX idx_phieu_dat_nguoi_tao ON phieu_dat(nguoi_tao);
CREATE INDEX idx_phieu_dat_gs ON phieu_dat(email_gs);

CREATE TABLE dat_don_hang (
    id                  TEXT PRIMARY KEY,
    phieu_dat_id        TEXT NOT NULL REFERENCES phieu_dat(id),
    loai_don            TEXT NOT NULL CHECK (loai_don IN ('mua', 'cong_no', 'tra_hang')),
    ma_lk               TEXT NOT NULL REFERENCES linh_kien(ma_linh_kien),
    ten_lk_snapshot     TEXT,
    loai_de_xuat        TEXT,
    so_luong_de_xuat    INTEGER NOT NULL DEFAULT 1,
    so_luong_thuc_xuat  INTEGER,
    gia_de_xuat         REAL,
    gia_chot            REAL,
    ly_do_cham          TEXT,
    ma_xuat_kho         TEXT,
    ma_misa             TEXT,
    so_tien_cong_no     REAL,
    nguoi_tao           TEXT NOT NULL REFERENCES users(email),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu             TEXT,
    yeu_cau_hoa_don     TEXT,
    tt_mail_duyet       TEXT,
    tt_khach_hang       TEXT,
    chinh_sach          TEXT CHECK (chinh_sach IN ('Trong CSBH', 'Ngoài CSBH')),
    ma_yeu_cau_su_co    TEXT,
    email_gs            TEXT REFERENCES users(email),
    nguoi_nhan_hang     TEXT REFERENCES users(email),
    uu_tien             INTEGER NOT NULL DEFAULT 0,
    trang_thai_hien_tai TEXT,
    version             INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_ddh_phieu_dat ON dat_don_hang(phieu_dat_id);
CREATE INDEX idx_ddh_ma_xuat_kho ON dat_don_hang(ma_xuat_kho) WHERE ma_xuat_kho IS NOT NULL;
CREATE INDEX idx_ddh_nguoi_nhan_hang ON dat_don_hang(nguoi_nhan_hang);
CREATE INDEX idx_ddh_email_gs ON dat_don_hang(email_gs);
CREATE INDEX idx_ddh_loai_don_trang_thai ON dat_don_hang(loai_don, trang_thai_hien_tai, ngay_tao);
CREATE INDEX idx_ddh_nhan_hang_trang_thai ON dat_don_hang(nguoi_nhan_hang, trang_thai_hien_tai);

CREATE TABLE dat_don_hang_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id   TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Cho Tram duyet', 'Cho TN duyet', 'Cho TBP xac nhan', 'TN da duyet', 'TN tu choi',
                          'Cho hang', 'Da huy'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
CREATE INDEX idx_ddhl_dat_don_hang ON dat_don_hang_log(dat_don_hang_id);

-- "case_id" la tham chieu MEM (text) sang case_dvbh.id cua he DVBH goc - he nay KHONG co ban sao
-- case_dvbh cuc bo (chi tra cuu qua API, xem lib/caseLookupClient.ts), nen KHONG THE dat FK that.
CREATE TABLE dat_don_case (
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    case_id         TEXT NOT NULL,
    PRIMARY KEY (dat_don_hang_id, case_id)
);
CREATE INDEX idx_ddc_case_id ON dat_don_case(case_id);

CREATE TABLE thieu_lk (
    id                    TEXT PRIMARY KEY,
    dat_don_hang_id       TEXT NOT NULL REFERENCES dat_don_hang(id),
    ly_do                 TEXT,
    nguoi_tao             TEXT NOT NULL REFERENCES users(email),
    ngay_tao              TEXT NOT NULL DEFAULT (datetime('now')),
    ly_do_cham_id         INTEGER REFERENCES settings_ly_do_cham(id),
    ngay_du_kien_co_hang  TEXT
);
CREATE TABLE thieu_lk_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thieu_lk_id  TEXT NOT NULL REFERENCES thieu_lk(id),
    trang_thai   TEXT NOT NULL CHECK (trang_thai IN (
                     'Cho kho xu ly', 'Kho da tiep nhan',
                     'Kho xac nhan hang da ve', 'Kho tu choi sai TT',
                     'Da huy bo', 'Da ket thuc'
                 )),
    nguoi_xu_ly  TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly   TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu      TEXT
);
CREATE INDEX idx_tlk_don ON thieu_lk(dat_don_hang_id);
CREATE INDEX idx_tlkl_tlk ON thieu_lk_log(thieu_lk_id);

-- ---------- Phieu xuat kho ----------

CREATE TABLE phieu_xuat_kho (
    id                              TEXT PRIMARY KEY,
    ma_xuat_kho                     TEXT NOT NULL UNIQUE,
    nguoi_tao                       TEXT NOT NULL REFERENCES users(email),
    ngay_tao                        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu                         TEXT,
    so_tien_can_chuyen              REAL,
    trang_thai_chuyen_tien          TEXT CHECK (trang_thai_chuyen_tien IN ('Cho KTV chuyen', 'KTV da chuyen', 'TN da duyet')),
    bang_chung_chuyen_tien_url      TEXT,
    bang_chung_chuyen_tien_ghi_chu  TEXT,
    ngay_ktv_chuyen                 TEXT,
    ma_xuat_kho_xac_nhan            INTEGER NOT NULL DEFAULT 0,
    ma_misa                         TEXT,
    ma_van_don                      TEXT,
    anh_bien_ban_url                TEXT,
    nguoi_nhan_hang                 TEXT REFERENCES users(email),
    loai_don                        TEXT CHECK (loai_don IN ('mua', 'cong_no', 'tra_hang')),
    trang_thai_hien_tai             TEXT,
    version                         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_pxk_ma ON phieu_xuat_kho(ma_xuat_kho);
CREATE INDEX idx_pxk_trang_thai_nhan_hang ON phieu_xuat_kho(trang_thai_hien_tai, nguoi_nhan_hang, ngay_tao);

CREATE TABLE phieu_xuat_kho_dong (
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    dat_don_hang_id   TEXT NOT NULL REFERENCES dat_don_hang(id),
    PRIMARY KEY (phieu_xuat_kho_id, dat_don_hang_id)
);

CREATE TABLE phieu_xuat_kho_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);

-- ---------- Tra hang ----------

CREATE TABLE tra_hang_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai      TEXT NOT NULL CHECK (trang_thai IN (
                        'Cho ke toan duyet mem', 'Cho kho xac nhan', 'Cho QC xac nhan',
                        'Cho TN duyet tong', 'Cho ke toan xac nhan nhap kho', 'Cho kho xac nhan nhap kho',
                        'Da hoan thanh', 'Tu choi', 'Da huy'
                    )),
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
CREATE INDEX idx_thl_don_hang ON tra_hang_log(dat_don_hang_id);

-- ---------- GS phu trach (gan mem theo khu vuc/nguoi) ----------

CREATE TABLE dat_mua_lk_phu_trach_gs (
    nguoi_phu_trach TEXT NOT NULL REFERENCES users(email),
    giam_sat_email  TEXT NOT NULL REFERENCES users(email),
    ngay_gan        TEXT NOT NULL DEFAULT (datetime('now')),
    tu_dong_gan     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (nguoi_phu_trach, giam_sat_email)
);
CREATE INDEX idx_dmlpgs_gs ON dat_mua_lk_phu_trach_gs(giam_sat_email);

-- ---------- Ha tang dung chung (id sequence, cache bao cao, hash noi dung) ----------

CREATE TABLE id_counters (
    ten_bang         TEXT PRIMARY KEY,
    gia_tri_hien_tai INTEGER NOT NULL DEFAULT 0
);
INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES
    ('phieu_dat', 0), ('dat_don_hang', 0), ('thieu_lk', 0), ('phieu_xuat_kho', 0);

CREATE TABLE data_versions (
    domain      TEXT PRIMARY KEY,
    version     INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE precomputed_cache (
    key         TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content_versions (
    ten_bang    TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
