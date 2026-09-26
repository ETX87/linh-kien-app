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

function StageMenuButton({ item, active, sidebar }: { item: StageMenuItem; active: boolean; sidebar?: boolean }) {
  const isAction = item.variant === "action";
  if (sidebar) {
    // Nhung trong Sidebar dieu huong chung (them 2026-09-11, phan hoi "đẩy nó ra sidebar" - truoc do
    // la 1 rail doc rieng NAM CANH noi dung, nhin nhu "2 sidebar chong nhau") - dung mau token cua
    // chinh Sidebar.tsx (--sidebar-*) thay vi theme "ocean" cua content, de hoa lam 1 khoi voi menu
    // dieu huong chung chu khong phai 1 mang mau khac dat canh nhau.
    return (
      <button
        type="button"
        onClick={item.onClick}
        className={`focus-ring w-full flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-[12.5px] font-semibold text-left transition-colors ${
          isAction
            ? "bg-[var(--sidebar-tag-bg)] text-[var(--sidebar-tag-fg)] hover:bg-[var(--sidebar-hover-bg)]"
            : active
              ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
              : "text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover-bg)]"
        }`}
      >
        <span className="truncate">{item.label}</span>
        {item.count != null && item.count > 0 && (
          // Mau do trung voi badge muc "Đặt mua linh kiện" tren no (Sidebar.tsx, --color-danger) -
          // phan hoi 2026-09-11: "số chuyển thành màu đỏ giống số ở mục đặt mua linh kiện".
          <span className="shrink-0 tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {item.count > 99 ? "99+" : item.count}
          </span>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`focus-ring rounded-[var(--radius-pill)] font-semibold transition-colors whitespace-nowrap px-[11px] py-1 text-xs ${
        isAction
          ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
          : active
            ? "bg-[var(--color-primary)] text-white"
            : "bg-[var(--color-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary-dark)]"
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

// SUA (phan hoi 2026-09-11: "không đúng tôi muốn các button này ra menu" + "đẩy nó ra sidebar") - bo
// han nhanh "rail doc rieng" tung dat canh noi dung tren desktop (nhin nhu 2 thanh dieu huong chong
// nhau). isMobile=false gio LUON duoc portal thang vao trong Sidebar dieu huong chung (xem
// DatMuaLinhKienModule.tsx `stageMenuSlot` + Sidebar.tsx `stageMenuSlotRef`), nen chi con 2 nhanh:
// hang ngang tren mobile (khong doi) va danh sach long trong Sidebar tren desktop (moi).
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
    <div className="flex flex-col gap-3">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <div className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--sidebar-fg-dim)]">{g.title}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => (
              <StageMenuButton key={it.key} item={it} active={it.key === activeKey} sidebar />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
