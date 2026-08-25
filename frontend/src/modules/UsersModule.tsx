import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import type { UserRow } from "../types";

// Trang quan tri nguoi dung RUT GON tu he goc - chi con vai_tro Admin/QC/Giam sat + 6 co vai tro
// nghiep vu (la_ktv_dvbh...la_tp_dvbh) + danh_muc_lk 2 co rieng - khop dung PATCH /api/users/:email
// o backend/src/routes/users.ts. Khong con khu_vuc_phu_trach/modules/la_ksnb_doi_tac.

const ROLE_FLAGS: { key: keyof UserRow; label: string }[] = [
  { key: "la_ktv_dvbh", label: "KTV DVBH" },
  { key: "la_ve_tinh", label: "Vệ tinh" },
  { key: "la_kho", label: "Kho" },
  { key: "la_ke_toan", label: "Kế toán" },
  { key: "la_tac_nghiep", label: "TN (tác nghiệp)" },
  { key: "la_tp_dvbh", label: "TP DVBH" },
];

export function UsersModule() {
  const [tab, setTab] = useState("cho-duyet");
  return (
    <div className="anim-in space-y-4">
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "cho-duyet", label: "Chờ duyệt" },
        { key: "da-duyet", label: "Đã duyệt" },
        { key: "phu-trach-gs", label: "Giám sát phụ trách" },
      ]} />
      {tab === "cho-duyet" && <UserListTab tabValue="cho-duyet" />}
      {tab === "da-duyet" && <UserListTab tabValue="da-duyet" />}
      {tab === "phu-trach-gs" && <PhuTrachGsTab />}
    </div>
  );
}

function UserListTab({ tabValue }: { tabValue: "cho-duyet" | "da-duyet" }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["users", tabValue, search],
    queryFn: () => api.get<{ rows: UserRow[] }>(`/users?tab=${tabValue}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const personDir = usePersonDirectory();

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo email/tên…"
        className="focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-[var(--ink-400)]">Không có tài khoản nào.</div>
      ) : (
        <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[#FBFBFB] border-b border-[var(--line)]">
                  <th className="px-3 py-2">Người dùng</th>
                  <th className="px-3 py-2">Vai trò</th>
                  <th className="px-3 py-2">Cờ nghiệp vụ</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.email} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                    {/* Quy uoc "Ten (email)" toan he thong (phan hoi 2026-08-25, hang muc #16). */}
                    <td className="px-3 py-2">{formatPersonDisplay(u.email, personDir)}</td>
                    <td className="px-3 py-2">{u.vai_tro ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {ROLE_FLAGS.filter((f) => u[f.key]).map((f) => (
                          <Badge key={f.key} tone="ocean">{f.label}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : u.trang_thai_duyet === "Cho duyet" ? "amber" : "coral"}>
                        {u.trang_thai_duyet}
                      </Badge>
                      {!!u.bi_khoa && <Badge tone="coral">Đã khoá</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => setEditing(u)}>
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            addToast("Đã lưu");
            await qc.invalidateQueries({ queryKey: ["users"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  // FIX (ma tran kiem soat he thong, Van de #9 sheet "5. Van de phat hien", xac nhan 2026-08-24):
  // backend cho phep Admin sua CHINH dong cua minh (ke ca tu doi vai_tro/tu khoa tai khoan) khong co
  // canh bao nao - day la canh bao UI (khong chan cung o backend, dung y da xac nhan "Khóa": chi can
  // canh bao ro + bat tick xac nhan truoc khi luu, khong can chan het).
  const auth = useAuth();
  const isSelf = auth.status === "authenticated" && auth.user.email === user.email;
  const [selfEditAck, setSelfEditAck] = useState(false);
  const [form, setForm] = useState({
    vai_tro: user.vai_tro ?? "",
    trang_thai_duyet: user.trang_thai_duyet,
    bi_khoa: !!user.bi_khoa,
    la_ktv_dvbh: !!user.la_ktv_dvbh,
    la_ve_tinh: !!user.la_ve_tinh,
    la_kho: !!user.la_kho,
    la_ke_toan: !!user.la_ke_toan,
    la_tac_nghiep: !!user.la_tac_nghiep,
    la_tp_dvbh: !!user.la_tp_dvbh,
    quan_ly_danh_muc_lk: !!user.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: !!user.xem_danh_muc_lk,
    tram_cha: user.tram_cha ?? "",
    giam_sat_quan_ly: user.giam_sat_quan_ly ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/users/${encodeURIComponent(user.email)}`, {
        vai_tro: form.vai_tro || null,
        trang_thai_duyet: form.trang_thai_duyet,
        bi_khoa: form.bi_khoa,
        la_ktv_dvbh: form.la_ktv_dvbh,
        la_ve_tinh: form.la_ve_tinh,
        la_kho: form.la_kho,
        la_ke_toan: form.la_ke_toan,
        la_tac_nghiep: form.la_tac_nghiep,
        la_tp_dvbh: form.la_tp_dvbh,
        quan_ly_danh_muc_lk: form.quan_ly_danh_muc_lk,
        xem_danh_muc_lk: form.xem_danh_muc_lk,
        tram_cha: form.tram_cha || null,
        giam_sat_quan_ly: form.giam_sat_quan_ly || null,
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={user.email} width="max-w-lg">
      <div className="space-y-4 text-sm">
        {isSelf && (
          <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--coral-600)]">
            <div className="font-bold mb-0.5">⚠ Bạn đang tự sửa tài khoản của chính mình</div>
            <div className="mb-2">
              Thay đổi vai trò/cờ quyền hoặc khoá tài khoản ở đây có thể khiến bạn tự mất quyền Admin hoặc tự khoá chính mình. Hãy chắc chắn trước khi lưu.
            </div>
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={selfEditAck} onChange={(e) => setSelfEditAck(e.target.checked)} />
              Tôi hiểu rủi ro và vẫn muốn tiếp tục sửa tài khoản của chính mình
            </label>
          </div>
        )}
        {user.trang_thai_duyet === "Cho duyet" && (
          <div className="flex gap-2">
            <Btn size="sm" onClick={() => setForm({ ...form, trang_thai_duyet: "Da duyet" })} variant={form.trang_thai_duyet === "Da duyet" ? "primary" : "ghost"}>
              Duyệt
            </Btn>
            <Btn size="sm" onClick={() => setForm({ ...form, trang_thai_duyet: "Tu choi" })} variant={form.trang_thai_duyet === "Tu choi" ? "danger" : "ghost"}>
              Từ chối
            </Btn>
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Vai trò (quản trị)</label>
          <Select
            value={form.vai_tro}
            onChange={(v) => setForm({ ...form, vai_tro: v })}
            options={[{ value: "", label: "— Không —" }, { value: "Admin", label: "Admin" }, { value: "QC", label: "QC" }, { value: "Giam sat", label: "Giám sát" }]}
          />
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--ink-400)] mb-1.5">Cờ nghiệp vụ (Đặt mua linh kiện)</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ROLE_FLAGS.map((f) => (
              <label key={f.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.quan_ly_danh_muc_lk} onChange={(e) => setForm({ ...form, quan_ly_danh_muc_lk: e.target.checked })} />
            Quản lý danh mục LK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.xem_danh_muc_lk} onChange={(e) => setForm({ ...form, xem_danh_muc_lk: e.target.checked })} />
            Xem danh mục LK
          </label>
        </div>
        <div>
          {/* Nguon DUY NHAT gan Giam sat quan ly (yeu cau 2026-08-25, hang muc #3) - truoc chi hien
              khi la_ve_tinh, nay luon hien vi day la noi DUY NHAT ghi users.giam_sat_quan_ly cho ca
              KTV lan Ve tinh (Settings/Danh sach KTV chi con hien thi read-only). */}
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Email Giám sát quản lý</label>
          <input value={form.giam_sat_quan_ly} onChange={(e) => setForm({ ...form, giam_sat_quan_ly: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Email Trạm cha (nếu là CTV/Vệ tinh trực thuộc 1 trạm)</label>
          <input value={form.tram_cha} onChange={(e) => setForm({ ...form, tram_cha: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.bi_khoa} onChange={(e) => setForm({ ...form, bi_khoa: e.target.checked })} />
          Khoá tài khoản
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose}>Huỷ</Btn>
          <Btn size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={isSelf && !selfEditAck}>Lưu</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PhuTrachGsTab() {
  const addToast = useToast();
  const personDir = usePersonDirectory();
  const { data: usersData } = useQuery({ queryKey: ["users", "da-duyet", ""], queryFn: () => api.get<{ rows: UserRow[] }>("/users?tab=da-duyet") });
  const rows = usersData?.rows ?? [];
  const tnKhoKeToan = useMemo(
    () => rows.filter((u) => u.la_tac_nghiep || u.la_kho || u.la_ke_toan),
    [rows],
  );
  const gsEmails = useMemo(() => rows.filter((u) => u.vai_tro === "Giam sat").map((u) => u.email), [rows]);

  const [selected, setSelected] = useState<string | null>(null);
  const { data: assignedData } = useQuery({
    queryKey: ["phu-trach-gs", selected],
    queryFn: () => api.get<{ emails: string[] }>(`/dat-mua-lk/phu-trach-gs?nguoi_phu_trach=${encodeURIComponent(selected!)}`),
    enabled: !!selected,
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function openFor(email: string) {
    setSelected(email);
    setChecked(new Set());
  }

  const save = useMutation({
    mutationFn: () => api.put("/dat-mua-lk/phu-trach-gs", { nguoi_phu_trach: selected, giam_sat_emails: Array.from(checked) }),
    onSuccess: () => {
      addToast("Đã lưu");
      setSelected(null);
    },
  });

  const effectiveChecked = assignedData && checked.size === 0 && selected ? new Set(assignedData.emails) : checked;

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">
        Gán "Giám sát phụ trách" cho từng người TN/Kho/Kế toán - chỉ ảnh hưởng badge/thống kê việc cần làm, không giới hạn danh sách/tìm kiếm.
      </div>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[#FBFBFB] border-b border-[var(--line)]">
                <th className="px-3 py-2">Người phụ trách</th>
                <th className="px-3 py-2">Vai trò</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tnKhoKeToan.map((u) => (
                <tr key={u.email} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2">{formatPersonDisplay(u.email, personDir)}</td>
                  <td className="px-3 py-2">
                    {[u.la_tac_nghiep && "TN", u.la_kho && "Kho", u.la_ke_toan && "Kế toán"].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openFor(u.email)}>
                      Gán Giám sát
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Gán Giám sát phụ trách — ${selected}`} width="max-w-md">
          <div className="space-y-2 text-sm">
            {gsEmails.length === 0 ? (
              <div className="text-[var(--ink-400)]">Chưa có ai mang vai trò "Giám sát".</div>
            ) : (
              gsEmails.map((email) => (
                <label key={email} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={effectiveChecked.has(email)}
                    onChange={(e) => {
                      const next = new Set(effectiveChecked);
                      if (e.target.checked) next.add(email);
                      else next.delete(email);
                      setChecked(next);
                    }}
                  />
                  {formatPersonDisplay(email, personDir)}
                </label>
              ))
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setSelected(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => save.mutate()} loading={save.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
