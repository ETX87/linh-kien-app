-- Bang chung chuyen tien PXK: NHIEU anh (toi da 5) thay vi 1 (chot 2026-09-29, "cho phép up nhiều ảnh bằng chứng
-- (tối đa 5 ảnh)"). Thay cho viec tach phieu moi khi gop them don tu duyet: tong tien doi thi phieu ve "Cho KTV
-- chuyen" nhung GIU anh cu, KTV chuyen bo sung phan chenh lech + tai them anh roi xac nhan lai.
-- `bang_chung_chuyen_tien_anh` = JSON array URL anh. Cot cu `bang_chung_chuyen_tien_url` giu = anh DAU TIEN (tuong
-- thich noi doc cu).
ALTER TABLE phieu_xuat_kho ADD COLUMN bang_chung_chuyen_tien_anh TEXT;

UPDATE phieu_xuat_kho
SET bang_chung_chuyen_tien_anh = json_array(bang_chung_chuyen_tien_url)
WHERE bang_chung_chuyen_tien_url IS NOT NULL AND bang_chung_chuyen_tien_url != '';
