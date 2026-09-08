// Goi moi khi ktv_lien_he.ma_misa duoc gan/doi (3 diem: settingsKtv.ts PATCH /:ma/dat-mua-lk, PATCH
// /:ma/cong-no-misa, POST /bulk-import) - phan hoi 2026-09-08: "chọn bổ sung mã MISA từ danh sách tồn
// kho chưa tìm được khớp KTV" phai co hieu luc NGAY, khong doi import lai (import GHI DE toan bo bang
// ktv_ton_kho hang ngay, xem routes/ktvTonKho.ts). CHI gan lai cac dong dang ma_ktv IS NULL (chua tung
// khop KTV nao) - khong dung cham dong da khop 1 KTV khac (ma_misa khong co rang buoc UNIQUE, hiem gap
// nhung an toan hon).
export async function relinkTonKhoForMaMisa(db: D1Database, maKtv: string | undefined, maMisa: string | null): Promise<void> {
  if (!maKtv || !maMisa) return;
  await db.prepare("UPDATE ktv_ton_kho SET ma_ktv = ? WHERE ma_kho = ? AND ma_ktv IS NULL").bind(maKtv, maMisa).run();
}
