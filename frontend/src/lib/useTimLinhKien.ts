// Hook dung chung cho bo tim linh kien (lib/timLinhKien.ts) - 2026-10-04.
//  - useBoTimLk(): dung bo tim tu danh muc dang co tren may + tu khoa phu / tu dong nghia (GET /lk-settings/tu-khoa, cache
//    tren may theo md_lk_tu_khoa - TINH_QUERY "lk-tu-khoa").
//  - useLichSuLk(): lich su CHON linh kien + TU KHOA da tim, luu localStorage theo tai khoan - KHONG gui server. Dung de:
//    "Chọn gần đây", "Bạn hay đặt" (dem so lan chon 90 ngay) va goi y tu khoa da tim khi o tim trong.
import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { boDau } from "./boDau";
import { taoBoTimLk, type BoTimLk, type LkTimDong } from "./timLinhKien";

export interface LkTuKhoaData {
  tu_khoa: { ma_linh_kien: string; tu_khoa: string }[];
  dong_nghia: { id: number; nhom: string; nguoi_cap_nhat: string | null; ngay_cap_nhat: string }[];
}

export function useLkTuKhoa() {
  return useQuery({
    queryKey: ["lk-tu-khoa"],
    queryFn: () => api.get<LkTuKhoaData>("/lk-settings/tu-khoa"),
    retry: false,
  });
}

/** Bo tim cho danh sach `rows` - tinh lai chi khi danh muc / tu khoa doi. */
export function useBoTimLk(rows: LkTimDong[]): BoTimLk {
  const { data } = useLkTuKhoa();
  return useMemo(
    () =>
      taoBoTimLk(
        rows,
        new Map((data?.tu_khoa ?? []).map((r) => [r.ma_linh_kien, r.tu_khoa])),
        (data?.dong_nghia ?? []).map((r) => r.nhom),
      ),
    [rows, data],
  );
}

// ---------- Lich su tren may ----------

interface LichSu {
  chon: { ma: string; t: number }[];
  tim: string[];
}
const RONG: LichSu = { chon: [], tim: [] };
const TOI_DA_CHON = 300;
const TOI_DA_TIM = 8;
const NGAY = 86_400_000;
const khoa = (email: string) => `lk-lich-su:v1:${email}`;

const nghe = new Set<() => void>();
const daDoc = new Map<string, LichSu>();

function doc(email: string): LichSu {
  const cu = daDoc.get(email);
  if (cu) return cu;
  let v = RONG;
  try {
    const raw = localStorage.getItem(khoa(email));
    if (raw) {
      const p = JSON.parse(raw) as Partial<LichSu>;
      v = { chon: Array.isArray(p.chon) ? p.chon : [], tim: Array.isArray(p.tim) ? p.tim : [] };
    }
  } catch {
    // localStorage hong/bi chan - coi nhu chua co lich su
  }
  daDoc.set(email, v);
  return v;
}

function ghi(email: string, v: LichSu) {
  daDoc.set(email, v);
  try {
    localStorage.setItem(khoa(email), JSON.stringify(v));
  } catch {
    // het dung luong / che do rieng tu - van giu trong bo nho phien nay
  }
  nghe.forEach((f) => f());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith("lk-lich-su:")) {
      daDoc.clear();
      nghe.forEach((f) => f());
    }
  });
}

export interface LichSuLk {
  /** ma da chon gan day (moi nhat truoc, khong trung). */
  ganDay: string[];
  /** ma -> so lan chon trong 90 ngay. */
  soLanChon: Map<string, number>;
  /** tu khoa da tim gan day (moi nhat truoc). */
  timGanDay: string[];
  ghiChon: (ma: string) => void;
  ghiTim: (q: string) => void;
  xoaTim: () => void;
}

export function useLichSuLk(): LichSuLk {
  const auth = useAuth();
  const email = auth.status === "authenticated" ? auth.user.email : "";
  const v = useSyncExternalStore(
    (f) => {
      nghe.add(f);
      return () => nghe.delete(f);
    },
    () => (email ? doc(email) : RONG),
  );
  return useMemo(() => {
    const moc = Date.now() - 90 * NGAY;
    const soLanChon = new Map<string, number>();
    for (const x of v.chon) if (x.t >= moc) soLanChon.set(x.ma, (soLanChon.get(x.ma) ?? 0) + 1);
    const ganDay: string[] = [];
    for (let i = v.chon.length - 1; i >= 0 && ganDay.length < 10; i--) if (!ganDay.includes(v.chon[i].ma)) ganDay.push(v.chon[i].ma);
    return {
      ganDay,
      soLanChon,
      timGanDay: v.tim,
      ghiChon: (ma: string) => {
        if (!email || !ma) return;
        const cu = doc(email);
        ghi(email, { ...cu, chon: [...cu.chon, { ma, t: Date.now() }].slice(-TOI_DA_CHON) });
      },
      ghiTim: (q: string) => {
        const t = q.trim().replace(/\s+/g, " ");
        if (!email || t.length < 2) return;
        const cu = doc(email);
        const k = boDau(t);
        ghi(email, { ...cu, tim: [t, ...cu.tim.filter((x) => boDau(x) !== k)].slice(0, TOI_DA_TIM) });
      },
      xoaTim: () => {
        if (!email) return;
        ghi(email, { ...doc(email), tim: [] });
      },
    };
  }, [v, email]);
}

/**
 * Diem uu tien "hay dat" cong vao diem tim: chinh minh hay chon (toi da +27) + hang dat 30 ngay toan he thong (+4..+12).
 * Nho hon khop nguyen tu (30) nhieu lan cong lai - do sat van quyet dinh truoc, cung muc moi xet hay dat.
 */
export function diemHayDat(ma: string, soLanChon: Map<string, number>, hangCongTy?: Map<string, number>): number {
  const n = soLanChon.get(ma) ?? 0;
  const r = hangCongTy?.get(ma);
  return (n ? Math.min(27, 12 + 3 * n) : 0) + (r == null ? 0 : r <= 10 ? 12 : r <= 50 ? 8 : 4);
}
