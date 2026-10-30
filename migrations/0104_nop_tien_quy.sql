-- KTV TU NOP TIEN VAO QUY (chot 2026-10-30, phuong an A - "giờ muốn cho họ up tiền ngoài vào quỹ thì nên làm thế nào cho dễ thao tác,
-- KTV thực hiện chủ yếu trên điện thoại"): KTV chup/chon anh chuyen khoan (app tu doc so tien) + so tien + ghi chu -> yeu cau
-- "Cho ke toan" -> Ke toan duyet voi SO THUC NHAN (ghi thanh 1 khoan_tien_ngoai nguon 'ktv' + so quy 'dieu_chinh', roi phanBoQuy tu tra
-- phieu dang cho tien) hoac tu choi (bat buoc ly do). Nguoi gui huy duoc khi con cho. Truoc khi duyet tien CHUA vao quy.
CREATE TABLE nop_tien_quy (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,   -- hien thi "NTQ-<id>"
    email               TEXT NOT NULL,                       -- chu quy (KTV; Ve tinh -> Tram)
    nguoi_gui           TEXT NOT NULL,
    so_tien             INTEGER NOT NULL CHECK (so_tien > 0), -- so KTV khai
    anh                 TEXT,                                -- JSON array URL anh Drive (<= 5)
    tien_doc_anh        TEXT,                                -- JSON {url: so|null} may KTV tu doc (chi canh bao)
    ghi_chu             TEXT,
    ngay_chuyen         TEXT,                                -- YYYY-MM-DD (tuy chon)
    trang_thai          TEXT NOT NULL DEFAULT 'Cho ke toan' CHECK (trang_thai IN ('Cho ke toan', 'Da duyet', 'Tu choi', 'Da huy')),
    so_tien_thuc_nhan   INTEGER,
    nguoi_xu_ly         TEXT,
    xu_ly_luc           TEXT,
    ly_do               TEXT,                                -- ly do tu choi / ghi chu Ke toan
    khoan_tien_ngoai_id INTEGER,
    ngay_tao            TEXT NOT NULL
);
CREATE INDEX idx_ntq_email ON nop_tien_quy(email, id);
CREATE INDEX idx_ntq_tt ON nop_tien_quy(trang_thai, id);
