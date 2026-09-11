// Menu "giai doan hoa" (Phase 1, them 2026-09-11) - thay the thanh Tabs "Mua hang/Cong no/Tra hang/
// Phieu xuat kho" cu bang 1 danh sach nhieu muc, moi muc ung voi DUNG 1 trang thai/buoc xu ly thuc te
// trong he thong (tham khao he "ADMIN XUAT HANG MN v3" cua cong ty - menu chia nho theo tung giai
// doan/vai tro xu ly, xac nhan qua 5 diem sua cua nguoi dung 2026-09-11). CHI la lop TRINH BAY - toan
// bo dieu huong thuc su van di qua jumpTo()/setView()/cac callback duoc truyen tu
// DatMuaLinhKienModule.tsx (noi giu moi state/quyen/so dem that), StageMenu khong tu quyet dinh gi ca.
// "activeKey" chi la GOI Y hien thi (nho lai muc menu VUA bam gan nhat) - KHONG phai nguon chan ly cho
// biet dang xem dung trang thai nao (vd nguoi dung tu doi dropdown trang thai ben trong 1 tab, muc menu
// dang sang se khong tu tat) - chap nhan duoc vi day la thao tac "nhay nhanh", khong phai 1 bo loc 2
// chieu day du.

export interface StageMenuItem {
  key: string;
  label: string;
  count?: number;
  onClick: () => void;
  // "action" = hanh dong (Tao don/Tao ma xuat kho), to mau nhan manh khac voi cac muc dieu huong/loc
  // thong thuong - khong bao gio duoc coi la "active" (khong phai 1 trang thai de "dang xem").
  variant?: "action";
}

export interface StageMenuGroup {
  title?: string;
  items: StageMenuItem[];
}

function StageMenuButton({ item, active, vertical }: { item: StageMenuItem; active: boolean; vertical?: boolean }) {
  const isAction = item.variant === "action";
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`focus-ring rounded-lg font-semibold transition-colors whitespace-nowrap ${
        vertical ? "flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] text-left" : "px-2.5 py-1.5 text-xs"
      } ${
        isAction
          ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
          : active
            ? "bg-[var(--ocean-800)] text-white shadow-sm"
            : "bg-white text-[var(--ink-600)] border border-[var(--line)] hover:bg-slate-50"
      }`}
    >
      <span>{item.label}</span>
      {item.count != null && item.count > 0 && (
        <span
          className={`tabular rounded-full px-1.5 text-[11px] ${
            active || isAction ? "bg-white/25 text-white" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]"
          }`}
        >
          {item.count}
        </span>
      )}
    </button>
  );
}

export function StageMenu({ groups, activeKey, isMobile }: { groups: StageMenuGroup[]; activeKey: string; isMobile: boolean }) {
  // Mobile: khong du rong cho 1 rail doc (danh sach ~15 muc) - giu dang 1 hang vuot ngang, gom nhom
  // bang 1 vach doc mong giua cac nhom thay vi tieu de (tiet kiem chieu cao, tranh xuong 2 hang).
  if (isMobile) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-3 px-3" style={{ scrollbarWidth: "thin" }}>
        {groups.map((g, gi) => (
          <div key={gi} className="flex gap-1.5 items-center shrink-0">
            {gi > 0 && <div className="w-px self-stretch bg-[var(--line)] mx-0.5" />}
            {g.items.map((it) => (
              <StageMenuButton key={it.key} item={it} active={it.key === activeKey} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <nav className="w-60 shrink-0 border-r border-[var(--color-border)] pr-3 mr-4">
      {groups.map((g, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {g.title && <div className="px-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">{g.title}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <StageMenuButton key={it.key} item={it} active={it.key === activeKey} vertical />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
