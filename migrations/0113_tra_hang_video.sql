-- Video bang chung QC tu choi don tra hang (chot 2026-11-10, "khi QC từ chối sẽ nhập lý do từ chối + ghi chú + up ảnh bằng chứng + video bằng
-- chứng (tối đa 100mb)"). File video tai THANG tu trinh duyet len Google Drive qua phien resumable do Worker mo (Worker khong nhan body 100MB),
-- xong Worker kiem tra file (dung thu muc app, dung dung luong / dinh dang) + chia se "anyone with link" roi ghi dong nay.
CREATE TABLE tra_hang_video (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    drive_file_id   TEXT NOT NULL,
    ten_file        TEXT,
    kich_thuoc      INTEGER,
    mime            TEXT,
    nguoi_upload    TEXT NOT NULL,
    ngay_upload     TEXT NOT NULL
);
CREATE INDEX idx_thv_don ON tra_hang_video(dat_don_hang_id);
