import { useEffect, useState } from "react";
import type { KiemTraDong, ThayTheConHang } from "./types";
import { t } from "../../i18n";

// GOI Y LK TUONG DUONG khi dong dang soan THIEU HANG (chot 2026-11-01, v1.430). Nguyen van yeu cau: "linh kiện họ đặt thiếu hàng và có mã
// tương đương đủ hàng, hiện 1 nhắc nhở ... A thiếu hoàn toàn => thay tất cả bằng B; A còn 5, B có 5 => A=5 + B=5 hoặc B=10; A=5, B=3, C=2
// hoặc A=5, B=3, thiếu 2 ... đưa ra các đề xuất cho người dùng chọn (họ có thể bỏ nếu vẫn muốn chọn đủ 10 linh kiện A)" + "click vào mã
// được đề xuất để chuyển linh kiện đang đặt thành linh kiện tương đương ngay".
// Nguon: KiemTraDong.thay_the (POST /phieu-dat/kiem-tra -> goiYThayTheThieuHang o backend: ma cung nhom thay the, ton CUNG khu vuc kho
// cua don, da tru cac dong khac trong phieu). Ap dung 1 phuong an = tach dong dang soan thanh nhieu dong (moi dong = 1 don, giu nguyen
// loai de xuat / chinh sach / ma YCSC...) -> form tu kiem tra lai.

export interface PhanDat {
  ma_lk: string;
  sl: number;
  choHang?: boolean; // phan con thieu van dat ma goc (se cho hang)
}
interface PhuongAn {
  key: string;
  phan: PhanDat[];
}

// Dung cac phuong an chia SL (thuan, de doc): A = ma dang dat (con `a` chiec), alts = ma tuong duong con ton (nhieu ton truoc).
export function dungPhuongAn(maA: string, n: number, tonA: number, alts: ThayTheConHang[]): PhuongAn[] {
  const a = Math.max(0, Math.min(n, Math.floor(tonA)));
  const thieu = n - a;
  const ds: PhuongAn[] = [];
  const them = (phan: PhanDat[]) => {
    const p = phan.filter((x) => x.sl > 0);
    const key = p.map((x) => `${x.ma_lk}:${x.sl}${x.choHang ? "*" : ""}`).join("+");
    if (p.length && !ds.some((d) => d.key === key)) ds.push({ key, phan: p });
  };
  // 1) A con 1 phan + 1 ma bu du phan thieu
  if (a > 0) for (const b of alts.filter((x) => x.ton >= thieu).slice(0, 2)) them([{ ma_lk: maA, sl: a }, { ma_lk: b.ma_lk, sl: thieu }]);
  // 2) Thay TOAN BO bang 1 ma du hang
  for (const b of alts.filter((x) => x.ton >= n).slice(0, 2)) them([{ ma_lk: b.ma_lk, sl: n }]);
  // 3) Khong ma nao bu du 1 minh -> gop nhieu ma (A truoc, roi ma nhieu ton truoc)
  if (!alts.some((x) => x.ton >= thieu)) {
    const phan: PhanDat[] = [{ ma_lk: maA, sl: a }];
    let con = thieu;
    for (const b of alts) {
      if (con <= 0) break;
      const lay = Math.min(con, b.ton);
      phan.push({ ma_lk: b.ma_lk, sl: lay });
      con -= lay;
    }
    if (con <= 0) them(phan);
    else {
      // Van thieu: (a) phan thieu dat tiep ma goc (cho hang), (b) chi dat phan dang co hang.
      them([...phan, { ma_lk: maA, sl: con, choHang: true }]);
      them(phan);
    }
  }
  return ds.slice(0, 5);
}

export function GoiYThayTheThieuHang({
  ketQua, onDoiMa, onApDung,
}: {
  ketQua: KiemTraDong[] | undefined;
  onDoiMa: (ma: string) => void; // bam ma tuong duong = doi ngay ma dang dat (giu SL)
  onApDung: (phan: PhanDat[]) => void;
}) {
  const r = ketQua?.length === 1 ? ketQua[0] : null; // dong combo (nhieu ket qua) khong goi y
  const alts = r?.thay_the ?? [];
  const khoa = r ? `${r.ma_lk}|${r.so_luong}` : "";
  const [boQua, setBoQua] = useState<string | null>(null);
  useEffect(() => {
    if (boQua && boQua !== khoa) setBoQua(null);
  }, [khoa, boQua]);
  if (!r || !alts.length || boQua === khoa) return null;
  const tonA = Math.max(0, r.ton ?? 0);
  const phuongAn = dungPhuongAn(r.ma_lk, r.so_luong, tonA, alts);

  return (
    <div className="mt-1.5 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] px-2.5 py-2 text-[11.5px] space-y-1.5" role="status">
      <div className="font-semibold text-[var(--color-text)]">
        {tonA > 0
          ? t("💡 {ma} chỉ còn {a}/{n} — có linh kiện tương đương còn hàng:", { ma: r.ma_lk, a: tonA, n: r.so_luong })
          : t("💡 {ma} đang hết hàng — có linh kiện tương đương còn hàng:", { ma: r.ma_lk })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {alts.map((b) => (
          <button
            key={b.ma_lk}
            type="button"
            onClick={() => onDoiMa(b.ma_lk)}
            title={t("Bấm để đổi linh kiện đang đặt thành {ma}", { ma: b.ma_lk })}
            className="focus-ring inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] bg-[var(--color-surface)] px-2.5 py-1 font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
          >
            ↔ <span className="font-mono">{b.ma_lk}</span>
            <span className="font-normal truncate max-w-[180px]">{b.ten_lk}</span>
            <span className="font-normal opacity-80">· {t("kho còn {n}", { n: b.ton })}</span>
          </button>
        ))}
      </div>
      {phuongAn.length > 0 && (
        <>
          <div className="text-[var(--color-text-secondary)]">{t("Đề xuất đặt thay ({n} chiếc):", { n: r.so_luong })}</div>
          <div className="flex flex-col gap-1">
            {phuongAn.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onApDung(p.phan)}
                className="focus-ring text-left rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:border-[var(--color-primary)]"
              >
                {p.phan.map((x, i) => (
                  <span key={i}>
                    {i > 0 && " + "}
                    <span className="font-mono font-semibold">{x.ma_lk}</span> × {x.sl}
                    {x.choHang && <span className="text-[var(--color-warning-strong)]"> ({t("chờ hàng")})</span>}
                  </span>
                ))}
                {p.phan.reduce((s, x) => s + x.sl, 0) < r.so_luong && (
                  <span className="text-[var(--color-text-secondary)]"> — {t("bỏ {n} chiếc còn thiếu", { n: r.so_luong - p.phan.reduce((s, x) => s + x.sl, 0) })}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => setBoQua(khoa)} className="focus-ring text-[var(--color-text-secondary)] underline">
          {t("Bỏ qua, vẫn đặt {n} × {ma}", { n: r.so_luong, ma: r.ma_lk })}
        </button>
      </div>
    </div>
  );
}
