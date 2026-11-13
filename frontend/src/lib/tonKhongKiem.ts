// LK "Không kiểm tra tồn kho" (2026-11-13, v1.489, migration 0118): backend computeTonKhoChot tra TON_KHONG_KIEM (lib/tonKhoCongTy.ts)
// thay so ton that -> moi cho hien so ton tu server (kiem tra tao don, goi y thay the, danh gia ticket) doi qua day.
export const TON_KHONG_KIEM = 1_000_000_000;

export function laTonKhongKiem(ton: number | null | undefined): boolean {
  return (ton ?? 0) >= TON_KHONG_KIEM;
}

