import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { Badge } from "../components/ui/Badge";
import { KvRow } from "../components/ui/KvRow";
import { exportRowsToExcel } from "../lib/exportExcel";
import type { LyDoChamMuaLkRow, KtvLienHeRow } from "../types";

// Nhap/cap nhat hang loat danh ba KTV tu file Excel (phan hoi 2026-08-20, tiep theo tinh nang nhap
// danh muc linh kien hang loat) - khop dung backend/src/routes/settingsKtv.ts POST /bulk-import.
// Header linh hoat, uu tien khop dung nhan cot bang KtvTab dang hien thi ("Mã KTV"/"Tên hiển
// thị"/...) de export-thu-cong-roi-nhap-lai hoat dong xuoi, kem vai bien the tu he khac.
interface BulkImportKtvRow {
  ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string;
  vai_tro_ktv?: string; gmail?: string; giam_sat_quan_ly?: string; email_dang_nhap?: string;
}
interface BulkImportKtvChunkResult {
  done: boolean; nextOffset: number; success: number; errorCount: number;
  details: { ma_ktv: string; status: string }[];
}
function pickKtvField(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (raw[k] != null && raw[k] !== "") return String(raw[k]).trim();
  }
  return undefined;
}
const VAI_TRO_KTV_ALIASES: Record<string, string> = {
  ktv: "KTV", ctv: "CTV", tram: "Tram", "trạm": "Tram", "ve tinh": "Ve tinh", "vệ tinh": "Ve tinh", "vetinh": "Ve tinh",
};
async function parseKtvImportFile(file: File): Promise<BulkImportKtvRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: BulkImportKtvRow[] = [];
  for (const raw of rawRows) {
    const ma = pickKtvField(raw, ["Mã KTV", "Ma KTV", "ma_ktv"]);
    if (!ma) continue;
    const vaiTroRaw = pickKtvField(raw, ["Vai trò", "Vai tro", "vai_tro_ktv"]);
    const vaiTro = vaiTroRaw ? (VAI_TRO_KTV_ALIASES[vaiTroRaw.toLowerCase()] ?? vaiTroRaw) : undefined;
    rows.push({
      ma_ktv: ma,
      ten_hien_thi: pickKtvField(raw, ["Tên hiển thị", "Ten hien thi", "ten_hien_thi"]),
      sdt: pickKtvField(raw, ["SĐT", "Số điện thoại", "sdt"]),
      ghi_chu: pickKtvField(raw, ["Ghi chú", "Ghi chu", "ghi_chu"]),
      vai_tro_ktv: vaiTro,
      gmail: pickKtvField(raw, ["Gmail", "gmail"]),
      giam_sat_quan_ly: pickKtvField(raw, ["Email Giám sát quản lý", "Giám sát quản lý", "giam_sat_quan_ly"]),
      email_dang_nhap: pickKtvField(raw, ["Email đăng nhập", "Email dang nhap", "email_dang_nhap"]),
    });
  }
  return rows;
}

// Trang quan tri RUT GON tu frontend/src/modules/SettingsModule.tsx cua he DVBH goc - CHI giu 4 tab
// thuc su can cho module "Dat mua linh kien" (xem CLAUDE.md muc "Nguon goc tach he thong"): Lý do
// chậm, Loại đề xuất, Danh sách KTV, Google Drive. "Danh mục linh kiện" la 1 module rieng (menu
// "Danh mục linh kiện"), khong nam trong Settings o he nay (khac he goc gom chung).

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
}

const TABS = [
  { key: "ly-do-cham", label: "Lý do chậm" },
  { key: "loai-de-xuat", label: "Loại đề xuất" },
  { key: "ktv", label: "Danh sách KTV" },
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
        {tab === "ktv" && <KtvTab />}
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
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[#FBFBFB] border-b border-[var(--line)]">
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
  const addNhom = useMutation({
    mutationFn: () => api.post("/settings/loai-de-xuat/nhom", { ten_nhom: newNhom!.ten_nhom, vai_tro_json: JSON.stringify(Array.from(newNhom!.roles)) }),
    onSuccess: async () => {
      addToast("Đã thêm nhóm");
      await qc.invalidateQueries({ queryKey: ["settings-lde-nhom"] });
      setNewNhom(null);
    },
  });

  const nhoms = nhomData?.rows ?? [];
  const options = optData?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--ink-500)]">Danh sách "Loại đề xuất" khi tạo đơn hàng (theo từng nhóm, lọc theo vai trò người tạo).</div>
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
          <div className="font-semibold text-sm mb-2">{n.ten_nhom}</div>
          <div className="flex flex-wrap gap-2">
            {options.filter((o) => o.nhom_id === n.id).map((o) => (
              <label
                key={o.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer border transition-colors ${
                  o.bat_tat
                    ? "bg-[var(--indigo-600)] border-[var(--indigo-600)] text-white"
                    : "bg-white border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--indigo-600)]"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={!!o.bat_tat} onChange={(e) => toggleOption.mutate({ id: o.id, bat_tat: e.target.checked })} />
                {o.ten_option}
              </label>
            ))}
          </div>
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

function KtvTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data } = useQuery({ queryKey: ["settings-ktv"], queryFn: () => api.get<{ rows: KtvLienHeRow[] }>("/settings/ktv-lien-he") });
  const [editing, setEditing] = useState<KtvLienHeRow | "new" | null>(null);
  const [form, setForm] = useState({ ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV" as KtvLienHeRow["vai_tro_ktv"], email_dang_nhap: "", giam_sat_quan_ly: "" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkSummary, setBulkSummary] = useState<{ success: number; errorCount: number } | null>(null);
  const [bulkFailDetails, setBulkFailDetails] = useState<{ ma_ktv: string; status: string }[]>([]);

  async function handleBulkImportKtv(file: File) {
    setBulkRunning(true);
    setBulkSummary(null);
    setBulkFailDetails([]);
    try {
      const rows = await parseKtvImportFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại tiêu đề cột "Mã KTV")');
        return;
      }
      setBulkTotal(rows.length);
      let offset = 0;
      let success = 0, errorCount = 0;
      const failDetails: { ma_ktv: string; status: string }[] = [];
      while (offset < rows.length) {
        const res = await api.post<BulkImportKtvChunkResult>("/settings/ktv-lien-he/bulk-import", { rows, offset });
        success += res.success;
        errorCount += res.errorCount;
        failDetails.push(...res.details.filter((d) => d.status !== "thanh_cong"));
        offset = res.nextOffset;
        setBulkProcessed(Math.min(offset, rows.length));
        if (res.done) break;
      }
      setBulkSummary({ success, errorCount });
      setBulkFailDetails(failDetails);
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      addToast(`Đã nhập xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi nhập danh sách KTV hàng loạt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBulkRunning(false);
    }
  }

  function openEdit(row: KtvLienHeRow | "new") {
    setEditing(row);
    if (row === "new") setForm({ ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV", email_dang_nhap: "", giam_sat_quan_ly: "" });
    else
      setForm({
        ma_ktv: row.ma_ktv,
        ten_hien_thi: row.ten_hien_thi ?? "",
        sdt: row.sdt ?? "",
        vai_tro_ktv: row.vai_tro_ktv ?? "KTV",
        email_dang_nhap: row.email_dang_nhap ?? "",
        giam_sat_quan_ly: row.giam_sat_quan_ly ?? "",
      });
  }

  const save = useMutation({
    mutationFn: async () => {
      await api.post("/settings/ktv-lien-he", { ma_ktv: form.ma_ktv, ten_hien_thi: form.ten_hien_thi, sdt: form.sdt });
      await api.patch(`/settings/ktv-lien-he/${encodeURIComponent(form.ma_ktv)}/dat-mua-lk`, {
        vai_tro_ktv: form.vai_tro_ktv,
        email_dang_nhap: form.email_dang_nhap || null,
        giam_sat_quan_ly: form.giam_sat_quan_ly || null,
      });
    },
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      setEditing(null);
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  const remove = useMutation({
    mutationFn: (ma: string) => api.delete(`/settings/ktv-lien-he/${encodeURIComponent(ma)}`),
    onSuccess: async () => {
      addToast("Đã xoá");
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">
        Danh bạ KTV/CTV/Trạm/Vệ tinh - dùng để chọn "người nhận hàng" khi tạo đơn. Ghép "Email đăng nhập" để hệ thống tự cấp tài khoản chờ duyệt khi người đó đăng nhập Google lần đầu.
      </div>
      <div className="flex gap-2">
        <Btn size="sm" onClick={() => openEdit("new")}>+ Thêm KTV</Btn>
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => {
            setBulkOpen(true);
            setBulkSummary(null);
            setBulkFailDetails([]);
            setBulkTotal(0);
            setBulkProcessed(0);
          }}
        >
          📋 Nhập danh sách hàng loạt
        </Btn>
        {/* Xuat dung ten cot khop voi parseKtvImportFile o dau file - cho phep export, sua tay tren
            Excel, roi nhap lai qua "Nhap danh sach hang loat" ma khong can doi ten cot. */}
        <Btn
          variant="ghost"
          size="sm"
          onClick={() =>
            exportRowsToExcel(data?.rows ?? [], "danh_sach_ktv.xlsx", "KTV", {
              ma_ktv: "Mã KTV",
              ten_hien_thi: "Tên hiển thị",
              sdt: "SĐT",
              vai_tro_ktv: "Vai trò",
              email_dang_nhap: "Email đăng nhập",
              giam_sat_quan_ly: "Email Giám sát quản lý",
              gmail: "Gmail",
              ghi_chu: "Ghi chú",
              nguoi_cap_nhat: "Người cập nhật",
              ngay_cap_nhat: "Ngày cập nhật",
            })
          }
        >
          ⬇ Tải danh sách
        </Btn>
      </div>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[#FBFBFB] border-b border-[var(--line)]">
                <th className="px-3 py-2">Mã KTV</th>
                <th className="px-3 py-2">Tên hiển thị</th>
                <th className="px-3 py-2">Vai trò</th>
                <th className="px-3 py-2">Email đăng nhập</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.ma_ktv} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.ma_ktv}</td>
                  <td className="px-3 py-2">{r.ten_hien_thi ?? "—"}</td>
                  <td className="px-3 py-2">{r.vai_tro_ktv ?? "—"}</td>
                  <td className="px-3 py-2">{r.email_dang_nhap ?? "—"}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openEdit(r)}>Sửa</button>
                    <button className="text-[var(--coral-500)] hover:underline text-xs" onClick={() => remove.mutate(r.ma_ktv)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing === "new" ? "Thêm KTV" : "Sửa KTV"} width="max-w-md">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã KTV</label>
              <input value={form.ma_ktv} disabled={editing !== "new"} onChange={(e) => setForm({ ...form, ma_ktv: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên hiển thị</label>
              <input value={form.ten_hien_thi} onChange={(e) => setForm({ ...form, ten_hien_thi: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Số điện thoại</label>
              <input value={form.sdt} onChange={(e) => setForm({ ...form, sdt: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Vai trò</label>
              <Select value={form.vai_tro_ktv ?? "KTV"} onChange={(v) => setForm({ ...form, vai_tro_ktv: v as KtvLienHeRow["vai_tro_ktv"] })} options={[
                { value: "KTV", label: "KTV" }, { value: "CTV", label: "CTV" }, { value: "Tram", label: "Trạm" }, { value: "Ve tinh", label: "Vệ tinh" },
              ]} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Email đăng nhập (Google)</label>
              <input value={form.email_dang_nhap} onChange={(e) => setForm({ ...form, email_dang_nhap: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Email Giám sát quản lý (nếu là Vệ tinh)</label>
              <input value={form.giam_sat_quan_ly} onChange={(e) => setForm({ ...form, giam_sat_quan_ly: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ma_ktv.trim() || save.isPending} loading={save.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}

      <Modal open={bulkOpen} onClose={() => { if (!bulkRunning) setBulkOpen(false); }} title="Nhập danh sách KTV hàng loạt">
        <div className="space-y-3">
          <div className="text-xs text-[var(--ink-500)]">
            Chọn file Excel có ít nhất cột <span className="font-mono">Mã KTV</span>. Các cột khác (Tên hiển thị, SĐT, Ghi chú, Vai trò, Gmail, Email đăng nhập, Email Giám sát quản lý) là tuỳ chọn. Mã đã tồn tại sẽ được cập nhật đè, mã chưa có sẽ được thêm mới. Nếu có "Email đăng nhập", hệ thống tự cấp tài khoản chờ duyệt cho email đó (giống hệt khi ghép thủ công 1 dòng).
          </div>
          {!bulkRunning && !bulkSummary && (
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBulkImportKtv(f); e.target.value = ""; }}
              className="text-sm"
            />
          )}
          {bulkRunning && (
            <div className="text-sm">
              Đang xử lý... {bulkProcessed}/{bulkTotal} dòng
              <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--indigo-600)] transition-all"
                  style={{ width: `${bulkTotal ? Math.min(100, (bulkProcessed / bulkTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          {bulkSummary && (
            <div className="text-sm space-y-2">
              <div>
                ✅ Thành công: <b>{bulkSummary.success}</b> · Lỗi: <b>{bulkSummary.errorCount}</b>
              </div>
              {bulkFailDetails.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-[var(--line)] rounded-lg p-2 text-xs font-mono space-y-0.5">
                  {bulkFailDetails.map((d, i) => (
                    <div key={i}>{d.ma_ktv}: {d.status}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkRunning}>
              {bulkSummary ? "Đóng" : "Hủy"}
            </Btn>
          </div>
        </div>
      </Modal>
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
