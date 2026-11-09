// Bo loc NGAY TAO dung chung cho danh sach Don hang + Phieu xuat (2026-11-09, "trong danh sách đơn, sao tài khoản khác (ngoài
// admin) không có filter ngày đến ngày?" + "Bổ sung thêm filter tháng tạo ở đơn hàng và phiếu"). Truoc day o "Từ ngày / Đến ngày"
// cua Don hang nam trong khoi chi Tram (va Admin lam thay Tram) moi thay. "Tháng tạo" chi la loi tat: chon thang = dat Tu ngay
// = ngay 1, Den ngay = ngay cuoi thang (server van loc theo tu_ngay / den_ngay, khong them tham so moi).
import { t } from "../../i18n";

const O_NGAY = "focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm";

/** "YYYY-MM" -> [ngay dau, ngay cuoi] dang "YYYY-MM-DD". */
export function khoangThang(thang: string): [string, string] {
  const [y, m] = thang.split("-").map(Number);
  const cuoi = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${thang}-01`, `${thang}-${String(cuoi).padStart(2, "0")}`];
}

/** Thang dang chon neu tu / den dung tron 1 thang, khong thi "". */
export function thangCuaKhoang(tu: string, den: string): string {
  if (!tu || !den || tu.slice(0, 7) !== den.slice(0, 7)) return "";
  const [a, b] = khoangThang(tu.slice(0, 7));
  return tu === a && den === b ? tu.slice(0, 7) : "";
}

const dinhDang = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Chip bo loc dang ap (ActiveFiltersBar) - 1 chip "Tháng 11/2026" khi tron thang, khong thi Tu / Den rieng. */
export function chipNgayTao(tu: string, den: string, onChange: (tu: string, den: string) => void): { label: string; onClear: () => void }[] {
  const thang = thangCuaKhoang(tu, den);
  if (thang) return [{ label: t("Tháng tạo {a}", { a: `${thang.slice(5, 7)}/${thang.slice(0, 4)}` }), onClear: () => onChange("", "") }];
  return [
    ...(tu ? [{ label: t("Từ ngày {a}", { a: dinhDang(tu) }), onClear: () => onChange("", den) }] : []),
    ...(den ? [{ label: t("Đến ngày {a}", { a: dinhDang(den) }), onClear: () => onChange(tu, "") }] : []),
  ];
}

export function LocNgayTao({ tu, den, onChange }: { tu: string; den: string; onChange: (tu: string, den: string) => void }) {
  const thang = thangCuaKhoang(tu, den);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--ink-500)]">{t("Tháng tạo")}</span>
      <input
        type="month"
        value={thang}
        onChange={(e) => (e.target.value ? onChange(...khoangThang(e.target.value)) : onChange("", ""))}
        className={O_NGAY}
        aria-label={t("Tháng tạo")}
      />
      <span className="text-xs text-[var(--ink-500)]">{t("Từ ngày")}</span>
      <input type="date" value={tu} max={den || undefined} onChange={(e) => onChange(e.target.value, den)} className={O_NGAY} aria-label={t("Từ ngày")} />
      <span className="text-xs text-[var(--ink-500)]">{t("Đến ngày")}</span>
      <input type="date" value={den} min={tu || undefined} onChange={(e) => onChange(tu, e.target.value)} className={O_NGAY} aria-label={t("Đến ngày")} />
    </div>
  );
}
