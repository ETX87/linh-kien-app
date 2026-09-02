import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { Badge } from "../components/ui/Badge";
import { KvRow } from "../components/ui/KvRow";
import type { LyDoChamMuaLkRow, KhuVucRow, UserRow } from "../types";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";

// Trang quan tri RUT GON tu frontend/src/modules/SettingsModule.tsx cua he DVBH goc - CHI giu cac
// tab thuc su can cho module "Dat mua linh kien" (xem CLAUDE.md muc "Nguon goc tach he thong"): Lý
// do chậm, Loại đề xuất, Khu vực, Google Drive. "Danh mục linh kiện" la 1 module rieng (menu "Danh
// mục linh kiện"), khong nam trong Settings o he nay (khac he goc gom chung). "Danh sách KTV" DA
// CHUYEN sang UsersModule.tsx lam the "KTV hiện trường" (2026-08-26, xay lai quan ly tai khoan/vai
// tro - yeu cau "tach rieng 2 the quan ly" KTV vs Nhan vien van phong, xem CLAUDE.md).

interface LoaiDeXuatNhomRow {
  id: number;
  ten_nhom: string;
  vai_tro_json: string;
  bat_tat: number;
}
interface LoaiDeXuatOptionRow {
  id: number;
  nhom_id: number;
  ten_option: string;
  bat_tat: number;
  stt: number;
  ten_nhom: string;
  loai_file_xuat_misa: string | null;
}

// 3 gia tri hop le cho "mau file xuat MISA" khi tao PXK (xem lib/misaExport.ts o backend) - rong =
// mac dinh "Bán hàng" (KHONG bat buoc Admin phai dien, chi dung khi loai_don='mua'; loai_don='cong_no'/
// 'tra_hang' LUON dung "Chuyển kho" bat ke gia tri nay, xac nhan qua AskUserQuestion 2026-09-02).
const MISA_TEMPLATE_OPTIONS = [
  { value: "", label: "(mặc định: Bán hàng)" },
  { value: "ban_hang", label: "Bán hàng" },
  { value: "chuyen_kho", label: "Chuyển kho" },
  { value: "xuat_kho", label: "Xuất kho" },
];

const TABS = [
  { key: "ly-do-cham", label: "Lý do chậm" },
  { key: "loai-de-xuat", label: "Loại đề xuất" },
  { key: "khu-vuc", label: "Khu vực" },
  { key: "google-drive", label: "Google Drive" },
];

export function SettingsModule() {
  const [tab, setTab] = useState("ly-do-cham");
  return (
    <div className="anim-in">
      <Tabs active={tab} onChange={setTab} tabs={TABS} />
      <div className="mt-4">
        {tab === "ly-do-cham" && <LyDoChamTab />}
        {tab === "loai-de-xuat" && <LoaiDeXuatTab />}
        {tab === "khu-vuc" && <KhuVucTab />}
        {tab === "google-drive" && <GoogleDriveTab />}
      </div>
    </div>
  );
}

function LyDoChamTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data } = useQuery({ queryKey: ["settings-ly-do-cham"], queryFn: () => api.get<{ rows: LyDoChamMuaLkRow[] }>("/settings/ly-do-cham") });
  const [editing, setEditing] = useState<LyDoChamMuaLkRow | "new" | null>(null);
  const [form, setForm] = useState({ ten_ly_do: "", he_thong_su_dung: "Mua hàng", quan_ly_don_thieu_linh_kien: false, bat_tat: true, stt: 0 });

  function openEdit(row: LyDoChamMuaLkRow | "new") {
    setEditing(row);
    if (row === "new") setForm({ ten_ly_do: "", he_thong_su_dung: "Mua hàng", quan_ly_don_thieu_linh_kien: false, bat_tat: true, stt: 0 });
    else setForm({ ten_ly_do: row.ten_ly_do, he_thong_su_dung: row.he_thong_su_dung, quan_ly_don_thieu_linh_kien: !!row.quan_ly_don_thieu_linh_kien, bat_tat: !!row.bat_tat, stt: row.stt });
  }

  const save = useMutation({
    mutationFn: () =>
      editing === "new" ? api.post("/settings/ly-do-cham", form) : api.patch(`/settings/ly-do-cham/${(editing as LyDoChamMuaLkRow).id}`, form),
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["settings-ly-do-cham"] });
      setEditing(null);
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">Danh sách lý do dùng ở nút "Chờ hàng"/"Từ chối" khi TN xử lý đơn hàng.</div>
      <Btn size="sm" onClick={() => openEdit("new")}>+ Thêm lý do</Btn>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                <th className="px-3 py-2">Tên lý do</th>
                <th className="px-3 py-2">Hệ thống sử dụng</th>
                <th className="px-3 py-2">Quản lý đơn thiếu LK</th>
                <th className="px-3 py-2">Bật/tắt</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2">{r.ten_ly_do}</td>
                  <td className="px-3 py-2">{r.he_thong_su_dung}</td>
                  <td className="px-3 py-2">{r.quan_ly_don_thieu_linh_kien ? "Có" : "—"}</td>
                  <td className="px-3 py-2">{r.bat_tat ? "Bật" : "Tắt"}</td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openEdit(r)}>
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing === "new" ? "Thêm lý do chậm" : "Sửa lý do chậm"} width="max-w-md">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên lý do</label>
              <input value={form.ten_ly_do} onChange={(e) => setForm({ ...form, ten_ly_do: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Hệ thống sử dụng</label>
              <Select value={form.he_thong_su_dung} onChange={(v) => setForm({ ...form, he_thong_su_dung: v })} options={[{ value: "Mua hàng", label: "Mua hàng" }, { value: "Bảo hành", label: "Bảo hành" }]} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.quan_ly_don_thieu_linh_kien} onChange={(e) => setForm({ ...form, quan_ly_don_thieu_linh_kien: e.target.checked })} />
              Mở ticket "Thiếu linh kiện" khi chọn lý do này
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.bat_tat} onChange={(e) => setForm({ ...form, bat_tat: e.target.checked })} />
              Đang bật (hiện trong dropdown)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ten_ly_do.trim() || save.isPending} loading={save.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Token nhan dien trong vai_tro_json (xem frontend/src/lib/loaiDeXuatCache.ts getOptionsForUser) -
// Admin luon bypass loc nay nen KHONG can token rieng cho Admin; nguoi khong co bat ky co/vai_tro nao
// trong day (vd la_kho/la_ke_toan/la_tac_nghiep thuan tuy) se KHONG thay nhom nay khi tu tao don -
// dung y thiet ke goc (ho la nguoi XU LY don, khong phai nguoi TAO don).
const VAI_TRO_TOKENS = [
  { value: "la_ktv_dvbh", label: "KTV / CTV / Trạm" },
  { value: "la_ve_tinh", label: "Vệ tinh" },
  { value: "vai_tro:QC", label: "QC" },
  { value: "vai_tro:Giam sat", label: "Giám sát" },
];

function LoaiDeXuatTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: nhomData } = useQuery({ queryKey: ["settings-lde-nhom"], queryFn: () => api.get<{ rows: LoaiDeXuatNhomRow[] }>("/settings/loai-de-xuat/nhom") });
  const { data: optData } = useQuery({ queryKey: ["settings-lde-options"], queryFn: () => api.get<{ rows: LoaiDeXuatOptionRow[] }>("/settings/loai-de-xuat") });
  const [newOption, setNewOption] = useState<{ nhom_id: number; ten_option: string } | null>(null);
  const [newNhom, setNewNhom] = useState<{ ten_nhom: string; roles: Set<string> } | null>(null);
  // Sua nhom (bo sung theo audit "Ma trận kiểm soát hệ thống", muc A2/6: PATCH /loai-de-xuat/nhom/:id
  // da co san o backend nhung UI truoc day chi co "+ Thêm nhóm", khong sua duoc ten/vai_tro_json/
  // bat_tat cua nhom da tao - gio them nut "Sửa" mo lai dung form nhu "+ Thêm nhóm", chi khac la PATCH
  // thay vi POST.
  const [editingNhom, setEditingNhom] = useState<{ id: number; ten_nhom: string; roles: Set<string>; bat_tat: boolean } | null>(null);

  const addOption = useMutation({
    mutationFn: () => api.post("/settings/loai-de-xuat", newOption),
    onSuccess: async () => {
      addToast("Đã thêm");
      await qc.invalidateQueries({ queryKey: ["settings-lde-options"] });
      setNewOption(null);
    },
  });
  const toggleOption = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/loai-de-xuat/${id}`, { bat_tat }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings-lde-options"] }),
  });
  // Chon mau file xuat MISA cho tung lua chon "loai de xuat" (them 2026-09-02, xem CLAUDE.md muc xuat
  // MISA) - CHI anh huong don co loai_don='mua' luc xuat file (xem lib/misaExport.ts), khong anh huong
  // gi den luong duyet don binh thuong.
  const setMisaTemplate = useMutation({
    mutationFn: ({ id, loai_file_xuat_misa }: { id: number; loai_file_xuat_misa: string | null }) =>
      api.patch(`/settings/loai-de-xuat/${id}`, { loai_file_xuat_misa }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings-lde-options"] }),
  });
  // Xoa 1 lua chon (bo sung theo audit, muc A2/7: DELETE /loai-de-xuat/:id da co san o backend nhung
  // UI truoc day chi bat/tat duoc (khong xoa han) - gio them nut xoa canh moi chip lua chon.
  const deleteOption = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/loai-de-xuat/${id}`),
    onSuccess: async () => {
      addToast("Đã xoá lựa chọn");
      await qc.invalidateQueries({ queryKey: ["settings-lde-options"] });
    },
  });
  const addNhom = useMutation({
    mutationFn: () => api.post("/settings/loai-de-xuat/nhom", { ten_nhom: newNhom!.ten_nhom, vai_tro_json: JSON.stringify(Array.from(newNhom!.roles)) }),
    onSuccess: async () => {
      addToast("Đã thêm nhóm");
      await qc.invalidateQueries({ queryKey: ["settings-lde-nhom"] });
      setNewNhom(null);
    },
  });
  const saveNhom = useMutation({
    mutationFn: () =>
      api.patch(`/settings/loai-de-xuat/nhom/${editingNhom!.id}`, {
        ten_nhom: editingNhom!.ten_nhom,
        vai_tro_json: JSON.stringify(Array.from(editingNhom!.roles)),
        bat_tat: editingNhom!.bat_tat,
      }),
    onSuccess: async () => {
      addToast("Đã lưu nhóm");
      await qc.invalidateQueries({ queryKey: ["settings-lde-nhom"] });
      setEditingNhom(null);
    },
  });

  const nhoms = nhomData?.rows ?? [];
  const options = optData?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--ink-500)]">Danh sách "Loại đề xuất" khi tạo đơn hàng (theo từng nhóm, lọc theo vai trò người tạo).</div>
      <MisaKhoSettings />
      {newNhom ? (
        <div className="border border-[var(--line)] rounded-xl p-3 space-y-2">
          <input
            autoFocus
            value={newNhom.ten_nhom}
            onChange={(e) => setNewNhom({ ...newNhom, ten_nhom: e.target.value })}
            className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            placeholder="Tên nhóm (vd: Mua hàng, Công nợ...)"
          />
          <div className="flex flex-wrap gap-3 text-xs">
            {VAI_TRO_TOKENS.map((t) => (
              <label key={t.value} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={newNhom.roles.has(t.value)}
                  onChange={(e) => {
                    const roles = new Set(newNhom.roles);
                    if (e.target.checked) roles.add(t.value);
                    else roles.delete(t.value);
                    setNewNhom({ ...newNhom, roles });
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Btn size="sm" variant="ghost" onClick={() => setNewNhom(null)}>Huỷ</Btn>
            <Btn size="sm" onClick={() => addNhom.mutate()} disabled={!newNhom.ten_nhom.trim() || addNhom.isPending} loading={addNhom.isPending}>Lưu</Btn>
          </div>
        </div>
      ) : (
        <Btn size="sm" onClick={() => setNewNhom({ ten_nhom: "", roles: new Set(["la_ktv_dvbh", "la_ve_tinh"]) })}>+ Thêm nhóm</Btn>
      )}
      {nhoms.map((n) => (
        <div key={n.id} className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-3">
          {editingNhom?.id === n.id ? (
            <div className="space-y-2 mb-2">
              <input
                autoFocus
                value={editingNhom.ten_nhom}
                onChange={(e) => setEditingNhom({ ...editingNhom, ten_nhom: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                placeholder="Tên nhóm (vd: Mua hàng, Công nợ...)"
              />
              <div className="flex flex-wrap gap-3 text-xs">
                {VAI_TRO_TOKENS.map((t) => (
                  <label key={t.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingNhom.roles.has(t.value)}
                      onChange={(e) => {
                        const roles = new Set(editingNhom.roles);
                        if (e.target.checked) roles.add(t.value);
                        else roles.delete(t.value);
                        setEditingNhom({ ...editingNhom, roles });
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={editingNhom.bat_tat} onChange={(e) => setEditingNhom({ ...editingNhom, bat_tat: e.target.checked })} />
                Hiển thị nhóm này khi tạo đơn
              </label>
              <div className="flex justify-end gap-2">
                <Btn size="sm" variant="ghost" onClick={() => setEditingNhom(null)}>Huỷ</Btn>
                <Btn size="sm" onClick={() => saveNhom.mutate()} disabled={!editingNhom.ten_nhom.trim() || saveNhom.isPending} loading={saveNhom.isPending}>Lưu</Btn>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm flex items-center gap-2">
                {n.ten_nhom}
                {!n.bat_tat && <Badge tone="gray">Đang ẩn</Badge>}
              </div>
              <button
                className="text-xs text-[var(--ocean-600)] hover:underline shrink-0"
                onClick={() => setEditingNhom({ id: n.id, ten_nhom: n.ten_nhom, roles: new Set(JSON.parse(n.vai_tro_json || "[]")), bat_tat: !!n.bat_tat })}
              >
                Sửa
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {options.filter((o) => o.nhom_id === n.id).map((o) => (
              <span
                key={o.id}
                className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1.5 text-xs font-medium border transition-colors ${
                  o.bat_tat
                    ? "bg-[var(--ocean-800)] border-[var(--ocean-800)] text-white"
                    : "bg-white border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--ocean-800)]"
                }`}
              >
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" className="sr-only" checked={!!o.bat_tat} onChange={(e) => toggleOption.mutate({ id: o.id, bat_tat: e.target.checked })} />
                  {o.ten_option}
                </label>
                {/* Xoa lua chon (bo sung theo audit, muc A2/7) - confirm truoc vi xoa han (DELETE that,
                    khong phai bat_tat=false) - dat CANH nhan thay vi de nguoi dung nham lan voi toggle
                    bat/tat o phia truoc. */}
                <button
                  type="button"
                  title="Xoá lựa chọn này"
                  className={`w-4 h-4 rounded-full flex items-center justify-center leading-none shrink-0 ${o.bat_tat ? "hover:bg-white/20" : "hover:bg-[var(--coral-100)] hover:text-[var(--coral-600)]"}`}
                  onClick={() => {
                    if (window.confirm(`Xoá lựa chọn "${o.ten_option}"? Không thể hoàn tác.`)) deleteOption.mutate(o.id);
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          {/* Mau file xuat MISA theo tung lua chon (them 2026-09-02) - chi hien khi nhom co it nhat 1
              lua chon, dat rieng ben duoi hang chip vi Select can rong hon 1 pill. */}
          {options.filter((o) => o.nhom_id === n.id).length > 0 && (
            <div className="mt-2 space-y-1">
              {options.filter((o) => o.nhom_id === n.id).map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--ink-500)] min-w-0 truncate flex-1">{o.ten_option}</span>
                  <span className="text-[var(--ink-400)] shrink-0">Mẫu MISA (khi loại đơn = mua):</span>
                  <div className="w-40 shrink-0">
                    <Select
                      value={o.loai_file_xuat_misa ?? ""}
                      onChange={(v) => setMisaTemplate.mutate({ id: o.id, loai_file_xuat_misa: v || null })}
                      options={MISA_TEMPLATE_OPTIONS}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {newOption?.nhom_id === n.id ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={newOption.ten_option}
                onChange={(e) => setNewOption({ nhom_id: n.id, ten_option: e.target.value })}
                className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1 text-xs"
                placeholder="Tên lựa chọn mới"
              />
              <Btn size="sm" onClick={() => addOption.mutate()} disabled={!newOption.ten_option.trim()}>Thêm</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setNewOption(null)}>Huỷ</Btn>
            </div>
          ) : (
            <button className="text-xs text-[var(--ocean-600)] hover:underline mt-2" onClick={() => setNewOption({ nhom_id: n.id, ten_option: "" })}>
              + Thêm lựa chọn
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface MisaKhoSettingsData {
  misa_ma_kho_mien_bac: string;
  misa_ten_kho_mien_bac: string;
  misa_ma_kho_mien_nam: string;
  misa_ten_kho_mien_nam: string;
}

// Ma/Ten kho mac dinh theo mien Bac/Nam (them 2026-09-02, xem CLAUDE.md muc xuat MISA) - dung de dien
// cot "Mã kho" khi xuat file import MISA tu Phieu xuat kho (lib/misaExport.ts). Mien suy tu
// ktv_lien_he.khu_vuc_ma cua nguoi nhan hang (chua "MB"=Bac, chua "MN"=Nam) - Admin CHUA dien thi cot
// "Mã kho" trong file xuat se de trong (khong chan xuat file).
function MisaKhoSettings() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<MisaKhoSettingsData & { nen_anh_tra_hang: boolean }>("/settings/app-settings"),
  });
  const [form, setForm] = useState<MisaKhoSettingsData | null>(null);
  const current = form ?? data ?? { misa_ma_kho_mien_bac: "", misa_ten_kho_mien_bac: "", misa_ma_kho_mien_nam: "", misa_ten_kho_mien_nam: "" };

  const save = useMutation({
    mutationFn: () => api.patch("/settings/app-settings", current),
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["app-settings"] });
      setForm(null);
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  return (
    <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
      <div className="font-semibold text-sm mb-1">Mã kho mặc định (xuất file MISA)</div>
      <div className="text-xs text-[var(--ink-500)] mb-3">
        Dùng để điền cột "Mã kho" khi tải file import MISA từ Phiếu xuất kho, theo miền của KTV nhận hàng.
      </div>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-w-lg">
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Mã kho — Miền Bắc</div>
            <input
              value={current.misa_ma_kho_mien_bac}
              onChange={(e) => setForm({ ...current, misa_ma_kho_mien_bac: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Tên kho — Miền Bắc</div>
            <input
              value={current.misa_ten_kho_mien_bac}
              onChange={(e) => setForm({ ...current, misa_ten_kho_mien_bac: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Mã kho — Miền Nam</div>
            <input
              value={current.misa_ma_kho_mien_nam}
              onChange={(e) => setForm({ ...current, misa_ma_kho_mien_nam: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Tên kho — Miền Nam</div>
            <input
              value={current.misa_ten_kho_mien_nam}
              onChange={(e) => setForm({ ...current, misa_ten_kho_mien_nam: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
      {form && (
        <div className="flex justify-end gap-2 mt-3">
          <Btn size="sm" variant="ghost" onClick={() => setForm(null)}>Huỷ</Btn>
          <Btn size="sm" onClick={() => save.mutate()} disabled={save.isPending} loading={save.isPending}>Lưu</Btn>
        </div>
      )}
    </div>
  );
}

// Them 2026-08-26 (xay lai quan ly tai khoan/vai tro, migration 0009) - CRUD Khu vuc + gan/go GS phu
// trach. 1 khu vuc chi 1 GS tai 1 thoi diem (ep o backend), 1 GS duoc phep phu trach nhieu khu vuc -
// gan GS moi cho 1 khu vuc DA co GS se ghi de (canh bao ro truoc khi luu, khong chan cung).
function KhuVucTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data } = useQuery({ queryKey: ["settings-khu-vuc"], queryFn: () => api.get<{ rows: KhuVucRow[] }>("/settings/khu-vuc") });
  const { data: gsData } = useQuery({ queryKey: ["users", "da-duyet", "", "Giam sat"], queryFn: () => api.get<{ rows: UserRow[] }>("/users?tab=da-duyet&vai_tro=Giam sat") });
  const personDir = usePersonDirectory();
  const gsOptions = (gsData?.rows ?? []).map((u) => ({ value: u.email, label: formatPersonDisplay(u.email, personDir) }));

  const [editing, setEditing] = useState<KhuVucRow | "new" | null>(null);
  const [form, setForm] = useState({ ma: "", ten: "", stt: 0, bat_tat: true, gs_email: "" });
  const [gsOverwriteAck, setGsOverwriteAck] = useState(false);

  function openEdit(row: KhuVucRow | "new") {
    setEditing(row);
    setGsOverwriteAck(false);
    if (row === "new") setForm({ ma: "", ten: "", stt: (data?.rows.length ?? 0) + 1, bat_tat: true, gs_email: "" });
    else setForm({ ma: row.ma, ten: row.ten, stt: row.stt, bat_tat: !!row.bat_tat, gs_email: row.gs_email ?? "" });
  }

  const existingGs = editing !== "new" ? editing?.gs_email ?? null : null;
  const gsChanged = form.gs_email !== (existingGs ?? "");
  const needsOverwriteAck = gsChanged && !!existingGs && form.gs_email !== "";

  const save = useMutation({
    mutationFn: async () => {
      if (editing === "new") {
        await api.post("/settings/khu-vuc", { ma: form.ma, ten: form.ten, stt: form.stt });
      } else {
        await api.patch(`/settings/khu-vuc/${encodeURIComponent(form.ma)}`, { ten: form.ten, stt: form.stt, bat_tat: form.bat_tat });
      }
      if (editing === "new" ? !!form.gs_email : gsChanged) {
        await api.patch(`/settings/khu-vuc/${encodeURIComponent(form.ma)}/gs`, { gs_email: form.gs_email || null });
      }
    },
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["settings-khu-vuc"] });
      setEditing(null);
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Danh sách khu vực - gán 1 Giám sát phụ trách cho mỗi khu vực (1 khu vực chỉ 1 GS, 1 GS có thể phụ trách nhiều khu vực).
        <Tooltip text={`Khu vực của KTV/Vệ tinh gán ở thẻ "KTV hiện trường" (Quản lý User). Khu vực của Tác nghiệp/Kho/Kế toán gán ở modal sửa từng người trong thẻ "Nhân viên văn phòng".`} />
      </div>
      {/* Them (ra soat UI 2026-08-27, hang muc #4): canh bao khu vuc BAT nhung chua gan GS - day chinh
          la nguyen nhan goc cua bug "GS khong thay don cua KTV khu vuc minh" da fix truoc do (email_gs
          suy tu khu_vuc.gs_email, khu vuc rong thi KHONG GS nao thay duoc don cua KTV trong do). Giup
          Admin chu dong phat hien som thay vi cho nguoi dung bao loi roi moi tra nguoc lai. */}
      {data && data.rows.filter((r) => r.bat_tat && !r.gs_email).length > 0 && (
        <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2 text-xs text-[var(--coral-600)]">
          ⚠ {data.rows.filter((r) => r.bat_tat && !r.gs_email).length} khu vực đang bật nhưng chưa gán Giám sát phụ trách — KTV thuộc các khu vực này sẽ không có GS nào theo dõi đơn của họ.
        </div>
      )}
      <Btn size="sm" onClick={() => openEdit("new")}>+ Thêm khu vực</Btn>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Tên</th>
                <th className="px-3 py-2">Giám sát phụ trách</th>
                <th className="px-3 py-2">Bật/tắt</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.ma} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.ma}</td>
                  <td className="px-3 py-2">{r.ten}</td>
                  <td className="px-3 py-2">{r.gs_email ? formatPersonDisplay(r.gs_email, personDir) : "— (chưa gán)"}</td>
                  <td className="px-3 py-2">{r.bat_tat ? "Bật" : "Tắt"}</td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openEdit(r)}>Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing === "new" ? "Thêm khu vực" : "Sửa khu vực"} width="max-w-md">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã khu vực</label>
              <input value={form.ma} disabled={editing !== "new"} onChange={(e) => setForm({ ...form, ma: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên hiển thị</label>
              <input value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Giám sát phụ trách</label>
              <Select value={form.gs_email} onChange={(v) => { setForm({ ...form, gs_email: v }); setGsOverwriteAck(false); }} options={[{ value: "", label: "— Không —" }, ...gsOptions]} />
            </div>
            {needsOverwriteAck && (
              <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--coral-600)]">
                <div className="font-bold mb-0.5">⚠ Khu vực này đang do {formatPersonDisplay(existingGs!, personDir)} phụ trách</div>
                <div className="mb-2">Gán Giám sát mới sẽ khiến người này MẤT khu vực "{form.ten || form.ma}" ngay lập tức.</div>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={gsOverwriteAck} onChange={(e) => setGsOverwriteAck(e.target.checked)} />
                  Tôi hiểu và vẫn muốn gán lại
                </label>
              </div>
            )}
            {editing !== "new" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.bat_tat} onChange={(e) => setForm({ ...form, bat_tat: e.target.checked })} />
                Đang bật (hiện trong dropdown chọn khu vực)
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ma.trim() || !form.ten.trim() || save.isPending || (needsOverwriteAck && !gsOverwriteAck)} loading={save.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GoogleDriveTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["google-drive-status"],
    queryFn: () => api.get<{ connected: boolean; google_email?: string; authorized_at?: string }>("/settings/google-drive/status"),
  });

  return (
    <div className="max-w-md space-y-4">
      <div>
        <div className="text-xs text-[var(--ink-500)] mb-3">
          Uỷ quyền 1 tài khoản Google thật để upload ảnh trong hệ: "ảnh minh hoạ linh kiện" (Danh mục linh kiện), ảnh trả hàng (Đặt mua linh kiện › Trả hàng), và ảnh biên bản/bằng chứng chuyển tiền (Phiếu xuất kho). Chưa kết nối thì các thao tác upload ảnh này sẽ báo lỗi.
        </div>
        <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
          {isLoading ? (
            <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
          ) : (
            <>
              <KvRow label="Trạng thái">
                {data?.connected ? <Badge tone="teal">Đã kết nối</Badge> : <Badge tone="gray">Chưa kết nối</Badge>}
              </KvRow>
              {data?.connected && (
                <>
                  <KvRow label="Tài khoản">
                    <span className="font-mono">{data.google_email}</span>
                  </KvRow>
                  <KvRow label="Uỷ quyền lúc">{data.authorized_at}</KvRow>
                </>
              )}
              <div className="mt-3">
                {data?.connected ? (
                  <a href="/api/settings/google-drive/authorize" className="inline-block">
                    <Btn size="sm" variant="ghost">Kết nối lại / đổi tài khoản</Btn>
                  </a>
                ) : (
                  <a href="/api/settings/google-drive/authorize">
                    <Btn size="sm">Kết nối tài khoản Google Drive</Btn>
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <NenAnhTraHangToggle />
    </div>
  );
}

// Co bat/tat "nen anh tra hang truoc khi upload" (them 2026-08-24, phan hoi "cơ chế nén ảnh này cho
// tôi bật tắt tuỳ chỉnh trong settings") - nen chay o trinh duyet nguoi tao/QC (Canvas API, xem
// frontend/src/lib/imageCompress.ts), khong phai o day - o day chi luu 1 co bat/tat DUNG CHUNG toan
// he thong (bang app_settings, migration 0004_app_settings.sql).
function NenAnhTraHangToggle() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<{ nen_anh_tra_hang: boolean }>("/settings/app-settings"),
  });
  const save = useMutation({
    mutationFn: (nen_anh_tra_hang: boolean) => api.patch("/settings/app-settings", { nen_anh_tra_hang }),
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  return (
    <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
      <div className="font-semibold text-sm mb-1">Nén ảnh trả hàng trước khi tải lên</div>
      <div className="text-xs text-[var(--ink-500)] mb-3">
        Tự động thu nhỏ (cạnh dài nhất ~2000px) + nén JPEG chất lượng cao ngay trên trình duyệt trước khi tải ảnh trả hàng (tạo đơn/QC từ chối) lên Drive — giảm dung lượng đáng kể, mắt thường không thấy khác biệt. Tắt nếu muốn giữ nguyên ảnh gốc.
      </div>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data?.nen_anh_tra_hang ?? true}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.checked)}
          />
          {data?.nen_anh_tra_hang ?? true ? "Đang bật" : "Đang tắt"}
        </label>
      )}
    </div>
  );
}
