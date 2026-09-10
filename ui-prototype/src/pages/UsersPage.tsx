import { useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Tabs } from "../components/ui/Tabs";
import { SearchBar } from "../components/ui/SearchBar";
import { Select } from "../components/ui/Form";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Btn } from "../components/ui/Btn";
import { EmptyState } from "../components/ui/Misc";
import { usePersona } from "../hooks/usePersona";
import { useToast } from "../components/ui/Toast";
import { fmtDateTime } from "../lib/format";
import { KTV_LIST } from "../mock/people";
import { KHU_VUC, USERS_OFFICE, USERS_PENDING, LOGIN_LOG } from "../mock/extra";
import type { UserRow, PendingUserRow, LoginLogRow } from "../types";

export function UsersPage() {
  const { persona } = usePersona();
  const toast = useToast();
  const [tab, setTab] = useState("cho-duyet");
  const [q, setQ] = useState("");
  const [cap, setCap] = useState("");
  const [kv, setKv] = useState("");

  if (persona.coreRole !== "ADMIN") {
    return (
      <div className="anim-in">
        <PageHeader title="Quản lý người dùng" />
        <EmptyState title="Chỉ Admin truy cập được" />
      </div>
    );
  }

  const ktvRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return KTV_LIST.filter((k) => {
      if (s && !(k.email.toLowerCase().includes(s) || k.ten.toLowerCase().includes(s))) return false;
      if (cap === "1" && k.vaiTro === "Vệ tinh") return false;
      if (cap === "2" && k.vaiTro !== "Vệ tinh") return false;
      if (kv && k.khuVuc !== kv) return false;
      return true;
    });
  }, [q, cap, kv]);

  const pendingCols: Column<PendingUserRow & { id: string }>[] = [
    { key: "email", header: "Email", cell: (r) => <span className="font-mono text-[12.5px]">{r.email}</span> },
    { key: "ten", header: "Tên", cell: (r) => <span className="text-[12.5px]">{r.ten}</span> },
    { key: "ngay", header: "Ngày đăng ký", cell: (r) => <span className="tabular text-[12px] text-[var(--color-text-secondary)]">{fmtDateTime(r.ngayDangKy)}</span> },
    { key: "act", header: "", cell: (r) => <span className="flex gap-1"><Btn size="xs" variant="success" onClick={() => toast("Đã duyệt " + r.email)}>Duyệt</Btn><Btn size="xs" variant="danger-line" onClick={() => toast("Đã từ chối " + r.email, "danger")}>Từ chối</Btn></span> },
  ];

  const ktvCols: Column<(typeof KTV_LIST)[number] & { id: string }>[] = [
    { key: "email", header: "Email đăng nhập", cell: (r) => <span className="font-mono text-[12px]">{r.email}</span> },
    { key: "ten", header: "Tên hiển thị", cell: (r) => <span className="text-[12.5px] font-medium">{r.ten}</span> },
    { key: "vt", header: "Vai trò KTV", cell: (r) => <Badge tone={r.vaiTro === "Vệ tinh" ? "purple" : "info"} variant="soft">{r.vaiTro}</Badge> },
    { key: "kv", header: "Khu vực", cell: (r) => <span className="text-[12px]">{r.khuVuc}</span> },
    { key: "tc", header: "Trạm cha", cell: (r) => <span className="text-[12px] text-[var(--color-text-secondary)]">{r.tramCha ? KTV_LIST.find((x) => x.email === r.tramCha)?.ten ?? r.tramCha : "—"}</span> },
    { key: "gs", header: "GS", cell: (r) => <span className="text-[12px] text-[var(--color-text-secondary)]">{r.gsTen}</span> },
    { key: "act", header: "", cell: (r) => <Btn variant="ghost" size="xs" onClick={() => toast("Sửa " + r.ten + " (mô phỏng)", "info")}>Sửa</Btn> },
  ];

  const officeCols: Column<UserRow & { id: string }>[] = [
    { key: "email", header: "Email", cell: (r) => <span className="font-mono text-[12px]">{r.email}</span> },
    { key: "ten", header: "Tên", cell: (r) => <span className="text-[12.5px] font-medium">{r.ten}</span> },
    { key: "vt", header: "Vai trò lõi", cell: (r) => <span className="text-[12.5px]">{r.vaiTro}</span> },
    { key: "co", header: "Cờ nghiệp vụ", cell: (r) => <span className="flex flex-wrap gap-1">{r.co.map((c) => <Badge key={c} tone="info">{c}</Badge>)}{r.co.length === 0 && <span className="text-[12px] text-[var(--color-text-faint)]">—</span>}</span> },
    { key: "kv", header: "Khu vực", cell: (r) => <span className="text-[12px]">{r.khuVuc.join(", ") || "—"}</span> },
    { key: "tt", header: "Trạng thái", cell: (r) => <Badge tone={r.trangThai === "Hoạt động" ? "success" : "neutral"} variant="soft">{r.trangThai}</Badge> },
    { key: "act", header: "", cell: (r) => <Btn variant="ghost" size="xs" onClick={() => toast((r.trangThai === "Hoạt động" ? "Khoá " : "Mở khoá ") + r.email, "info")}>{r.trangThai === "Hoạt động" ? "Khoá" : "Mở khoá"}</Btn> },
  ];

  const gsCols: Column<{ id: string; ma: string; ten: string; gsTen: string | null; soKtv: number }>[] = [
    { key: "gs", header: "Giám sát", cell: (r) => (r.gsTen ? <span className="text-[12.5px] font-medium">{r.gsTen}</span> : <span className="text-[12px] text-[var(--color-text-faint)]">— Chưa gán —</span>) },
    { key: "kv", header: "Khu vực phụ trách", cell: (r) => <span className="text-[12.5px]">{r.ma} · {r.ten}</span> },
    { key: "so", header: "Số KTV", align: "right", cell: (r) => <span className="tabular">{r.soKtv}</span> },
  ];

  const logCols: Column<LoginLogRow & { id: string }>[] = [
    { key: "email", header: "Email", cell: (r) => <span className="font-mono text-[12px]">{r.email}</span> },
    { key: "tg", header: "Thời gian", cell: (r) => <span className="tabular text-[12px]">{fmtDateTime(r.thoiGian)}</span> },
    { key: "ip", header: "IP", cell: (r) => <span className="font-mono text-[12px]">{r.ip}</span> },
    { key: "ua", header: "Thiết bị", cell: (r) => <span className="text-[12px] text-[var(--color-text-secondary)]">{r.ua}</span> },
  ];

  return (
    <div className="anim-in">
      <PageHeader title="Quản lý người dùng" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "cho-duyet", label: "Chờ duyệt", count: USERS_PENDING.length },
          { key: "ktv", label: "KTV hiện trường" },
          { key: "van-phong", label: "Nhân viên văn phòng" },
          { key: "gs", label: "Giám sát phụ trách" },
          { key: "login", label: "Lịch sử đăng nhập" },
        ]}
      />

      <div className="mt-3">
        {tab === "cho-duyet" && <DataTable columns={pendingCols} rows={USERS_PENDING.map((u) => ({ ...u, id: u.email }))} minWidth={620} emptyText="Không có tài khoản chờ duyệt." />}

        {tab === "ktv" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchBar value={q} onChange={setQ} placeholder="Tìm mã / tên / SĐT / email…" className="min-w-[240px] flex-1" />
              <Select value={cap} onChange={setCap} className="w-52" options={[{ value: "", label: "— Mọi cấp —" }, { value: "1", label: "Cấp 1 (KTV/CTV/Trạm)" }, { value: "2", label: "Cấp 2 (Vệ tinh)" }]} />
              <Select value={kv} onChange={setKv} className="w-44" options={[{ value: "", label: "— Mọi khu vực —" }, ...KHU_VUC.map((k) => ({ value: k.ma, label: k.ten }))]} />
            </div>
            <DataTable columns={ktvCols} rows={ktvRows.map((k) => ({ ...k, id: k.email }))} minWidth={900} />
          </div>
        )}

        {tab === "van-phong" && <DataTable columns={officeCols} rows={USERS_OFFICE.map((u) => ({ ...u, id: u.email }))} minWidth={980} />}

        {tab === "gs" && <DataTable columns={gsCols} rows={KHU_VUC.map((k) => ({ id: k.ma, ma: k.ma, ten: k.ten, gsTen: k.gsTen, soKtv: k.soKtv }))} minWidth={560} />}

        {tab === "login" && (
          <div className="space-y-3">
            <SearchBar value={q} onChange={setQ} placeholder="Lọc theo đúng email…" className="w-[320px]" />
            <DataTable columns={logCols} rows={LOGIN_LOG.filter((l) => !q || l.email.includes(q.trim())).map((l, i) => ({ ...l, id: String(i) }))} minWidth={620} />
          </div>
        )}
      </div>
    </div>
  );
}
