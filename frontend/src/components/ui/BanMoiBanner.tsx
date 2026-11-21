import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { btnClasses } from "./Btn";

// v1.553 (2026-11-21, bug giai trinh "khong xac dinh (ma: THIEU_PHAN_LOAI_LOI)"): tab mo tu truoc khi deploy van chay
// giao dien CU -> gui du lieu kieu cu, server moi tu choi. Moi 5 phut + khi quay lai tab: tai index.html (file tinh,
// KHONG qua Worker / D1) so script chinh /assets/index-*.js voi ban dang chay -> khac = hien thanh nhac tai lai.
const RE_SCRIPT = /\/assets\/index-[\w-]+\.js/;

function scriptDangChay(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const m = s.src.match(RE_SCRIPT);
    if (m) return m[0];
  }
  return null;
}

export function BanMoiBanner() {
  const [coBanMoi, setCoBanMoi] = useState(false);
  useEffect(() => {
    const dangChay = scriptDangChay();
    if (!dangChay) return; // dev server (khong co /assets/index-*.js)
    let huy = false;
    const kiemTra = async () => {
      if (huy || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/", { cache: "no-store" });
        if (!res.ok) return;
        const m = (await res.text()).match(RE_SCRIPT);
        if (!huy && m && m[0] !== dangChay) setCoBanMoi(true);
      } catch {
        /* mat mang - bo qua */
      }
    };
    const id = window.setInterval(kiemTra, 5 * 60_000);
    document.addEventListener("visibilitychange", kiemTra);
    return () => {
      huy = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", kiemTra);
    };
  }, []);
  if (!coBanMoi) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-xl border border-[var(--color-primary)] bg-white px-4 py-2 shadow-lg text-sm max-w-[95vw]">
      <span>{t("Ứng dụng đã có phiên bản mới — tải lại để dùng bản mới nhất.")}</span>
      <button type="button" className={btnClasses("primary", "sm")} onClick={() => window.location.reload()}>
        {t("Tải lại")}
      </button>
    </div>
  );
}
