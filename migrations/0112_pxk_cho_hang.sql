-- Phieu tach rieng don THIEU HANG (chot 2026-11-10, "Khi đặt hàng, tự động tách riêng các phiếu chờ hàng của KTV ra (phiếu có hàng và phiếu
-- chờ hàng riêng để kế toán có thể xuất hàng có trước cho ktv)"). cho_hang = 1: phieu chua don "Cho thanh toan" (kho thieu hang) tach khoi
-- phieu don co hang - tu gom (lib/pxkAutoBundle.ts) hoac KTV / TN bam "Tách đơn thiếu hàng ra phiếu riêng" (POST /phieu-xuat-kho/:id/tach-cho-hang).
-- Chi la nhan de gom dung phieu + canh bao Ke toan; tien / trang thai phieu khong doi gi.
ALTER TABLE phieu_xuat_kho ADD COLUMN cho_hang INTEGER NOT NULL DEFAULT 0;

-- Popup "Chuyển tiền bị từ chối" cho KTV (chot 2026-11-10): luc nguoi nhan hang bam "Đã đọc" / "Đến phiếu"; Ke toan / TN tu choi lan moi -> NULL.
ALTER TABLE phieu_xuat_kho ADD COLUMN tu_choi_da_doc_luc TEXT;
