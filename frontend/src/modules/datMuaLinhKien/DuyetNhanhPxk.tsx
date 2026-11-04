import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Btn } from "../../components/x/Btn";
import { t, dichSau } from "../../i18n";
import { describeApiError, invalidatePipelineCounts } from "./helpers";

// KE TOAN DUYET NHANH PHIEU XUAT (chot 2026-11-05, v1.441 - "phiếu xuất => thêm nút duyệt 'Kế toán duyệt nhanh': Mã đơn hàng = ID phiếu, mã PXK =
// PXK-'ID phiếu'" + "Danh sách phiếu thêm chức năng chọn nhiều phiếu hoặc chọn tất cả ... 'KT duyệt nhanh' (tự thêm mã đơn hàng và mã PXK), 'KT duyệt
// trừ kho nhanh', 'KT duyệt xong phiếu nhanh', 'Trừ kho', 'Đã chốt xong đơn xuất' => đã có sẵn mã đơn hàng + pxk => chỉ chốt phiếu").
// KHONG co API rieng: goi LAN LUOT dung cac API ma nguoi dung bam tay (giu nguyen moi kiem tra + tac dung phu cua tung buoc):
//   1. PATCH /:id/ma-xuat-kho  (phieu "Dang tao phieu" chua xac nhan ma don hang) - ma = ma dang go san, khong co thi = ID phieu
//   2. POST  /:id/log "Cho ke toan" (Gui ke toan - chan neu chua duyet tien / thieu ly do cham / don chua duyet...)
//   3. PATCH /:id/ma-misa "PXK-<ID>" (phieu "Cho ke toan" chua co Ma MISA)
//   4. POST  /:id/log "Hang tru kho" | "Da chot xong don xuat"
// Loi o buoc nao thi dung phieu do, bao ly do, chay tiep phieu sau.

export type HanhDongDuyetNhanh = "duyet" | "duyet_tru_kho" | "duyet_chot" | "tru_kho" | "chot";

export const NHAN_DUYET_NHANH: Record<HanhDongDuyetNhanh, string> = {
  duyet: dichSau("⚡ KT duyệt nhanh"),
  duyet_tru_kho: dichSau("⚡ KT duyệt trừ kho nhanh"),
  duyet_chot: dichSau("⚡ KT duyệt xong phiếu nhanh"),
  tru_kho: dichSau("📦 Trừ kho"),
  chot: dichSau("✅ Đã chốt xong đơn xuất"),
};

const MO_TA_DUYET_NHANH: Record<HanhDongDuyetNhanh, string> = {
  duyet: dichSau("Điền Mã đơn hàng = ID phiếu, gửi kế toán, điền Mã PXK = PXK-ID phiếu (phiếu dừng ở bước Chờ mã MISA đã có đủ mã)"),
  duyet_tru_kho: dichSau("Điền đủ 2 mã như KT duyệt nhanh rồi chuyển Hàng trừ kho (kết thúc phiếu, không qua Kho)"),
  duyet_chot: dichSau("Điền đủ 2 mã như KT duyệt nhanh rồi Đã chốt xong đơn xuất (chuyển Kho gửi hàng)"),
  tru_kho: dichSau("Chỉ phiếu đã có Mã đơn hàng + Mã PXK: chuyển Hàng trừ kho"),
  chot: dichSau("Chỉ phiếu đã có Mã đơn hàng + Mã PXK: Đã chốt xong đơn xuất"),
};

export interface PxkDuyetNhanh {
  id: string;
  trang_thai: string | null;
  loai_don?: string | null;
  ma_xuat_kho?: string | null;
  ma_xuat_kho_xac_nhan?: number | null;
  ma_misa?: string | null;
}

class LoiDuyetNhanh extends Error {}

/** Chay 1 phieu. Tra ve trang thai cuoi. Loi -> throw (Error / ApiError). */
export async function duyetNhanhPxk(p: PxkDuyetNhanh, hd: HanhDongDuyetNhanh): Promise<string> {
  const id = p.id;
  let tt = p.trang_thai ?? "Dang tao phieu";
  let coMisa = !!p.ma_misa?.trim();
  const dienMa = hd === "duyet" || hd === "duyet_tru_kho" || hd === "duyet_chot";
  if ((hd === "tru_kho" || hd === "duyet_tru_kho") && p.loai_don === "tra_hang") throw new LoiDuyetNhanh(t("Phiếu trả hàng không trừ kho được"));
  if (dienMa) {
    if (tt === "Dang tao phieu") {
      if (!p.ma_xuat_kho_xac_nhan || !p.ma_xuat_kho?.trim()) {
        await api.patch(`/phieu-xuat-kho/${encodeURIComponent(id)}/ma-xuat-kho`, { ma_xuat_kho: p.ma_xuat_kho?.trim() || id });
      }
      await api.post(`/phieu-xuat-kho/${encodeURIComponent(id)}/log`, { trang_thai: "Cho ke toan" });
      tt = "Cho ke toan";
    }
    if (tt !== "Cho ke toan") throw new LoiDuyetNhanh(t("Phiếu đã qua bước kế toán"));
    if (!coMisa) {
      await api.patch(`/phieu-xuat-kho/${encodeURIComponent(id)}/ma-misa`, { ma_misa: `PXK-${id}` });
      coMisa = true;
    }
    if (hd === "duyet") return tt;
  } else {
    if (tt !== "Cho ke toan") throw new LoiDuyetNhanh(t("Phiếu không ở bước Chờ mã MISA"));
    if (!coMisa || !p.ma_xuat_kho?.trim()) throw new LoiDuyetNhanh(t("Chưa có Mã đơn hàng / Mã PXK — dùng \"KT duyệt … nhanh\""));
  }
  const dich = hd === "tru_kho" || hd === "duyet_tru_kho" ? "Hang tru kho" : "Da chot xong don xuat";
  await api.post(`/phieu-xuat-kho/${encodeURIComponent(id)}/log`, { trang_thai: dich });
  return dich;
}

export interface KetQuaDuyetNhanh {
  xong: string[];
  loi: { id: string; loi: string }[];
}

/** Chay lan luot nhieu phieu (khong dung o loi - ghi lai ly do tung phieu). */
export async function duyetNhanhNhieuPxk(
  ds: PxkDuyetNhanh[], hd: HanhDongDuyetNhanh, onTienDo?: (da: number) => void,
): Promise<KetQuaDuyetNhanh> {
  const kq: KetQuaDuyetNhanh = { xong: [], loi: [] };
  for (let i = 0; i < ds.length; i++) {
    try {
      await duyetNhanhPxk(ds[i], hd);
      kq.xong.push(ds[i].id);
    } catch (e) {
      kq.loi.push({ id: ds[i].id, loi: e instanceof LoiDuyetNhanh ? e.message : describeApiError(e) });
    }
    onTienDo?.(i + 1);
  }
  return kq;
}

function useLamMoi() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
    qc.invalidateQueries({ queryKey: ["pxk-detail"] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-status-counts"] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
    invalidatePipelineCounts(qc);
  };
}

/** Nut "⚡ Kế toán duyệt nhanh" o chi tiet phieu - dien 2 ma + gui ke toan (dung o Cho ma MISA da co du ma). */
export function NutKtDuyetNhanh({ pxk, addToast }: { pxk: PxkDuyetNhanh; addToast: (m: string) => void }) {
  const [dang, setDang] = useState(false);
  const lamMoi = useLamMoi();
  return (
    <Btn
      variant="ghost"
      loading={dang}
      disabled={dang}
      title={t(MO_TA_DUYET_NHANH.duyet)}
      onClick={async () => {
        if (!window.confirm(t("Kế toán duyệt nhanh phiếu {id}?\n\n{mt}", { id: pxk.id, mt: t(MO_TA_DUYET_NHANH.duyet) }))) return;
        setDang(true);
        try {
          await duyetNhanhPxk(pxk, "duyet");
          addToast(t("Đã duyệt nhanh {id} — Mã đơn hàng / Mã PXK đã điền, chờ chốt", { id: pxk.id }));
        } catch (e) {
          addToast(t("Lỗi: ") + (e instanceof LoiDuyetNhanh ? e.message : describeApiError(e)));
        } finally {
          setDang(false);
          lamMoi();
        }
      }}
    >
      {t("⚡ Kế toán duyệt nhanh")}
    </Btn>
  );
}

/** Thanh thao tac hang loat o danh sach phieu (Ke toan / Admin). */
export function ThanhDuyetNhanhPxk({
  chon, tongTheoBoLoc, dangChonTatCa, onChonTatCa, onBoChon, addToast,
}: {
  chon: PxkDuyetNhanh[];
  tongTheoBoLoc: number;
  dangChonTatCa: boolean;
  onChonTatCa: () => void;
  onBoChon: () => void;
  addToast: (m: string) => void;
}) {
  const [dang, setDang] = useState<{ hd: HanhDongDuyetNhanh; da: number } | null>(null);
  const [ketQua, setKetQua] = useState<KetQuaDuyetNhanh | null>(null);
  const lamMoi = useLamMoi();
  if (chon.length === 0 && !ketQua) return null;
  async function chay(hd: HanhDongDuyetNhanh) {
    if (!window.confirm(t("{a} cho {n} phiếu đã chọn?\n\n{mt}\n\nPhiếu nào lỗi sẽ bỏ qua và báo lý do.", { a: t(NHAN_DUYET_NHANH[hd]), n: chon.length, mt: t(MO_TA_DUYET_NHANH[hd]) }))) return;
    setKetQua(null);
    setDang({ hd, da: 0 });
    try {
      const kq = await duyetNhanhNhieuPxk(chon, hd, (da) => setDang({ hd, da }));
      setKetQua(kq);
      addToast(t("{a}: xong {x}/{n} phiếu", { a: t(NHAN_DUYET_NHANH[hd]), x: kq.xong.length, n: chon.length }));
      onBoChon();
    } finally {
      setDang(null);
      lamMoi();
    }
  }
  return (
    <div className="mb-2 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-surface-soft)] px-3 py-2 text-[13px]">
      {chon.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--color-text)]">{t("Đã chọn {n} phiếu", { n: chon.length })}</span>
          {!dangChonTatCa && tongTheoBoLoc > chon.length && (
            <button type="button" className="code-link underline underline-offset-2" onClick={onChonTatCa} disabled={!!dang}>
              {t("Chọn tất cả {n} phiếu theo bộ lọc", { n: tongTheoBoLoc })}
            </button>
          )}
          <button type="button" className="text-[var(--color-text-secondary)] hover:underline" onClick={onBoChon} disabled={!!dang}>{t("Bỏ chọn")}</button>
          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
          {(Object.keys(NHAN_DUYET_NHANH) as HanhDongDuyetNhanh[]).map((hd) => (
            <Btn key={hd} size="sm" variant={hd === "duyet" ? "primary" : "ghost"} disabled={!!dang} title={t(MO_TA_DUYET_NHANH[hd])} onClick={() => chay(hd)}>
              {t(NHAN_DUYET_NHANH[hd])}
            </Btn>
          ))}
          {dang && <span className="text-[var(--color-text-secondary)]">{t("Đang xử lý {a}/{n}…", { a: dang.da, n: chon.length })}</span>}
        </div>
      )}
      {ketQua && (
        <div className="mt-1 text-[12px]">
          <span className="text-[var(--color-success-strong)]">{t("Xong {n} phiếu.", { n: ketQua.xong.length })}</span>
          {ketQua.loi.length > 0 && (
            <>
              {" "}<span className="text-[var(--color-danger)]">{t("{n} phiếu không xử lý được:", { n: ketQua.loi.length })}</span>
              <ul className="mt-0.5 max-h-40 list-disc overflow-y-auto pl-5 text-[var(--color-text-secondary)]">
                {ketQua.loi.map((l) => <li key={l.id}><span className="font-mono">{l.id}</span>: {l.loi}</li>)}
              </ul>
            </>
          )}
          <button type="button" className="ml-2 text-[var(--color-text-faint)] hover:underline" onClick={() => setKetQua(null)}>{t("Đóng")}</button>
        </div>
      )}
    </div>
  );
}
