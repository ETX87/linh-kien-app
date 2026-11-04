import { useEffect, useRef, useState } from "react";
import { DropdownPortal } from "./DropdownPortal";
import { khopTim } from "../../lib/boDau";
import { t } from "../../i18n";

export type SelectOption = string | { value: string; label: string };

// Nguong tu dong chuyen tu <select> thuan sang o nhap tim theo tu khoa - danh sach dai (vd KTV
// ~300 dong, Tinh 63, Linh kien ~400) rat kho cuon tim bang <select> thuan; danh sach ngan (trang
// thai, loai...) giu nguyen <select> nhu cu, khong doi hanh vi/giao dien. Ap dung CHUNG cho toan
// bo component Select (khong can sua tung noi goi) - dung options.length hien tai nen tu thich
// ung neu du lieu dai/ngan thay doi theo thoi gian (vd them CSKH/KTV moi).
const SEARCHABLE_THRESHOLD = 10;

function optValue(o: SelectOption): string {
  return typeof o === "string" ? o : o.value;
}
function optLabel(o: SelectOption): string {
  return typeof o === "string" ? o : o.label;
}

export function Select({
  value,
  onChange,
  options,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
}) {
  if (options.length > SEARCHABLE_THRESHOLD) {
    return <SearchableSelect value={value} onChange={onChange} options={options} className={className} disabled={disabled} />;
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      // FIX (phan hoi 2026-09-05: "nút filter listdown đang không nổi bật, khó nhìn") - truoc day dung
      // bg-surface-100 (#f4f4f5), CUNG MAU HET voi panel bo loc bao quanh no (vd DonCuaToiTab.tsx dong
      // "showFilters &&" dung chinh bg-surface-100 cho ca khoi) nen o filter lan vao nen, chi con thay
      // border rat nhat - doi sang bg-surface (trang) + border dam hon (ink-400) de noi bat, khop dung
      // border-2 cac input ngay thang ("Từ ngày"/"Đến ngày") dat CANH no trong CUNG panel dang dung
      // bg-white san.
      className={`focus-ring h-9 bg-[var(--surface)] border border-[var(--color-border)] rounded-[var(--radius-btn)] px-2.5 text-[13px] text-[var(--color-text-body)] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {t(o)}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ),
      )}
    </select>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => optValue(o) === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // .normalize("NFC") (fix bug 2026-09-12: "tìm 'khách h' ra, 'khách hà' không ra") - ky tu co dau go
  // tu ban phim/IME co the o dang to hop (NFD, vd "h" + dau huyen rieng) khac voi dang dung san trong
  // option (NFC, 1 ky tu "à" duy nhat) - 2 chuoi nhin GIONG HET nhau nhung .includes() so sanh byte
  // nen khong khop. Chuan hoa CA HAI ve cung 1 dang truoc khi so sanh, khong doi hanh vi loc con lai.
  // + KHONG dau (2026-09-29, khopTim - go "nguyen" ra "Nguyễn"); NFD roi bo dau nen van dung voi IME to hop.
  const q = query.trim();
  const filtered = q ? options.filter((o) => khopTim(optLabel(o), q)) : options;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : (selected ? optLabel(selected) : "")}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery("");
        }}
        disabled={disabled}
        title={selected ? optLabel(selected) : undefined}
        placeholder={t("Gõ để tìm…")}
        // FIX (phan hoi 2026-09-05, giong het comment o <select> thuan phia tren): cung doi bg-surface-100
        // -> bg-surface + border dam hon de khong lan vao panel bo loc bao quanh.
        className="focus-ring w-full h-9 bg-[var(--surface)] border border-[var(--color-border)] rounded-[var(--radius-btn)] px-2.5 text-[13px] text-[var(--color-text-body)] disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {/* minWidth (phan hoi 2026-09-05: "listdown lỗi hiện thị" - nhan dai bi cat cut khi anchor hep,
          vd o trong 1 <td> chat hep) - xem giai thich day du o DropdownPortal.tsx. */}
      <DropdownPortal anchorRef={containerRef} contentRef={dropdownRef} open={open} maxHeight={224} minWidth={320} className="rounded-lg py-1 max-w-[calc(100vw-16px)]">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--ink-400)] italic">{t("Không tìm thấy.")}</div>
        ) : (
          filtered.map((o, i) => {
            const v = optValue(o);
            return (
              // onMouseDown (khong phai onClick) de chay TRUOC su kien blur cua input.
              // key = "value::index" (SUA BUG 2026-09-04, phan hoi "filter ktv bị trùng tên, nhập
              // tìm kiếm không phản hồi"): nhieu noi goi Select nay dung email_dang_nhap lam value
              // (vd nguoiNhanHangData) - NHIEU ma_ktv (Ve tinh khac nhau) co the CUNG dung 1 email
              // dang nhap chung voi Tram cha, khien 2 option khac nhau co CUNG value -> key trung
              // lam React nham lan DOM node giua 2 hang khi danh sach loc doi theo tung ky tu go -
              // hien trung/sai noi dung va nhu "khong phan hoi". Ghep them index de LUON duy nhat,
              // khong doi "value" dung cho onChange.
              <button
                key={`${v}::${i}`}
                type="button"
                title={optLabel(o)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(v);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left px-3 py-1.5 text-sm leading-snug whitespace-normal break-words hover:bg-[var(--color-subtle)] ${v === value ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] font-semibold" : ""}`}
              >
                {optLabel(o)}
              </button>
            );
          })
        )}
      </DropdownPortal>
    </div>
  );
}
