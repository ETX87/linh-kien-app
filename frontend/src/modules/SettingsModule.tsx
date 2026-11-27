import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { Badge } from "../components/ui/Badge";
import { KvRow } from "../components/ui/KvRow";
import type { LyDoChamMuaLkRow, KhuVucRow, UserRow } from "../types";
import { fmtDateTime } from "../types";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import { LOAI_CHIET_KHAU_KEY, useLoaiChietKhauList, LoaiChietKhauChip, type LoaiChietKhauRow } from "./datMuaLinhKien/LoaiChietKhau";

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

// 3 gia tri hop le cho "mau file xuat MISA" de xuat cho PXK (xem resolveTemplate o backend lib/misaExport.ts). SUA 2026-10-05:
// gia tri nay ap ca don cong no (truoc day cong no LUON Chuyen kho); de trong = don mua Ban hang, don cong no Chuyen kho;
// don tra hang LUON Chuyen kho, TRỪ CÔNG NỢ chi Ban hang / CN, hỗ trợ.
const MISA_TEMPLATE_OPTIONS = [
  { value: "", label: "(mặc định: mua → Bán hàng, công nợ → Chuyển kho)" },
  { value: "ban_hang", label: "Bán hàng" },
  { value: "chuyen_kho", label: "Chuyển kho" },
  { value: "xuat_kho", label: "CN, hỗ trợ" },
];

const TABS = [
  { key: "ly-do-cham", label: "Lý do chậm" },
  { key: "loai-de-xuat", label: "Loại đề xuất" },
  { key: "loai-chiet-khau", label: "Loại chiết khấu" },
  { key: "khu-vuc", label: "Khu vực" },
  { key: "google-drive", label: "Google Drive" },
  { key: "dong-bo-dvbh", label: "Đồng bộ DVBH" },
  { key: "dong-bo-gia88", label: "Đồng bộ Gia88" },
  { key: "api-doi-tac", label: "API đối tác" },
];

export function SettingsModule() {
  const [tab, setTab] = useState("ly-do-cham");
  return (
    <div className="anim-in">
      <Tabs active={tab} onChange={setTab} tabs={TABS} />
      <div className="mt-4">
        {tab === "ly-do-cham" && <LyDoChamTab />}
        {tab === "loai-de-xuat" && <LoaiDeXuatTab />}
        {tab === "loai-chiet-khau" && <LoaiChietKhauTab />}
        {tab === "khu-vuc" && <KhuVucTab />}
        {tab === "google-drive" && <GoogleDriveTab />}
        {tab === "dong-bo-dvbh" && <DongBoDvbhTab />}
        {tab === "dong-bo-gia88" && <DongBoGia88Tab />}
        {tab === "api-doi-tac" && <PartnerApiTab />}
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
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Tên lý do</th>
                <th className="hidden sm:table-cell px-3 py-2">Hệ thống sử dụng</th>
                <th className="hidden sm:table-cell px-3 py-2">Quản lý đơn thiếu LK</th>
                <th className="px-3 py-2">Bật/tắt</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr onClick={() => openEdit(r)} key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2">{r.ten_ly_do}</td>
                  <td className="hidden sm:table-cell px-3 py-2">{r.he_thong_su_dung}</td>
                  <td className="hidden sm:table-cell px-3 py-2">{r.quan_ly_don_thieu_linh_kien ? "Có" : "—"}</td>
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

// Loai chiet khau (2026-09-26, migration 0033). Loai "Hệ thống" = khop 1 nhanh cua thuat toan tinh tien PXK,
// duoc gan TU DONG khi tao PXK - chi doi ten/tat (tat = he thong ngung gan loai do). Loai tu them (Admin o
// day, hoac TN them ngay luc chon lai tren don) chi dung khi TN chon tay. Khong xoa - tat de an khoi danh
// sach chon ma khong lam mat nhan tren cac don cu.
function LoaiChietKhauTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data: rows } = useLoaiChietKhauList();
  const [editing, setEditing] = useState<LoaiChietKhauRow | "new" | null>(null);
  const [form, setForm] = useState({ ten: "", bat_tat: true });

  function openEdit(row: LoaiChietKhauRow | "new") {
    setEditing(row);
    setForm(row === "new" ? { ten: "", bat_tat: true } : { ten: row.ten, bat_tat: !!row.bat_tat });
  }

  const save = useMutation({
    mutationFn: () =>
      editing === "new" ? api.post("/settings/loai-chiet-khau", form) : api.patch(`/settings/loai-chiet-khau/${(editing as LoaiChietKhauRow).id}`, form),
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: LOAI_CHIET_KHAU_KEY });
      setEditing(null);
    },
    onError: (err) => addToast(err instanceof ApiError && err.code === "TEN_DA_TON_TAI" ? "Tên loại chiết khấu đã tồn tại." : "Không thể lưu, thử lại sau."),
  });

  const ganLai = useMutation({
    mutationFn: () => api.post<{ so_phieu: number }>("/phieu-xuat-kho/loai-chiet-khau/gan-lai"),
    onSuccess: (r) => {
      addToast(r.so_phieu ? `Đã gán loại chiết khấu cho ${r.so_phieu} phiếu xuất kho` : "Không còn phiếu nào cần gán");
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("dat-mua-lk") || q.queryKey[0] === "pxk-detail" });
    },
    onError: () => addToast("Không thể gán, thử lại sau."),
  });

  // Chay 1 lan sau dot doi cong thuc tinh tien PXK (2026-09-28) - xem POST /tinh-lai-tien-dang-mo.
  const tinhLaiTien = useMutation({
    mutationFn: () => api.post<{ so_phieu: number; so_phieu_doi: number }>("/phieu-xuat-kho/tinh-lai-tien-dang-mo"),
    onSuccess: (r) => {
      addToast(`Đã tính lại ${r.so_phieu} phiếu đang tạo — ${r.so_phieu_doi} phiếu thay đổi tiền cần chuyển`);
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("dat-mua-lk") || q.queryKey[0] === "pxk-detail" });
    },
    onError: () => addToast("Không thể tính lại, thử lại sau."),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)]">
        Loại chiết khấu được hưởng của từng đơn. Hệ thống tự gán khi tạo phiếu xuất kho (cả phiếu hưởng chung theo tổng các dòng) và
        tự tính lại khi thêm/bớt đơn trong phiếu; TN chọn lại được nếu sai. Chỉ là nhãn phân loại — không đổi số tiền cần chuyển.
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" onClick={() => openEdit("new")}>+ Thêm loại chiết khấu</Btn>
        <Btn size="sm" variant="ghost" loading={ganLai.isPending} disabled={ganLai.isPending} onClick={() => ganLai.mutate()}>
          Gán cho các phiếu xuất kho cũ
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          loading={tinhLaiTien.isPending}
          disabled={tinhLaiTien.isPending}
          onClick={() => {
            if (window.confirm("Tính lại tiền cần chuyển cho MỌI phiếu xuất kho đang tạo? Phiếu nào lệch số sẽ bị đặt lại chuyển tiền về \"Chờ KTV chuyển\" (xoá bằng chứng đã nộp).")) tinhLaiTien.mutate();
          }}
        >
          Tính lại tiền phiếu đang tạo
        </Btn>
      </div>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Tên loại chiết khấu</th>
                <th className="hidden sm:table-cell px-3 py-2">Nguồn</th>
                <th className="hidden sm:table-cell px-3 py-2">Bật/tắt</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr onClick={() => openEdit(r)} key={r.id} className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer ${r.bat_tat ? "" : "text-[var(--ink-400)]"}`}>
                  <td className="px-3 py-2"><LoaiChietKhauChip loai={r} /></td>
                  <td className="hidden sm:table-cell px-3 py-2">{r.ma ? <Badge tone="ocean">Hệ thống tự gán</Badge> : <Badge tone="gray">Tự thêm</Badge>}</td>
                  <td className="hidden sm:table-cell px-3 py-2">{r.bat_tat ? "Bật" : "Tắt"}</td>
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
        <Modal open onClose={() => setEditing(null)} title={editing === "new" ? "Thêm loại chiết khấu" : "Sửa loại chiết khấu"} width="max-w-md">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên loại chiết khấu</label>
              <input value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.bat_tat} onChange={(e) => setForm({ ...form, bat_tat: e.target.checked })} />
              Đang bật {editing !== "new" && editing.ma ? "(tắt = hệ thống ngừng tự gán loại này)" : "(hiện trong danh sách chọn)"}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ten.trim() || save.isPending} loading={save.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Token nhan dien trong vai_tro_json (xem frontend/src/lib/loaiDeXuatCache.ts getOptionsForUser) -
// Admin luon bypass loc nay nen KHONG can token rieng cho Admin; nguoi khong co bat ky co/vai_tro nao
// trong day (vd la_kho/la_ke_toan thuan tuy) se KHONG thay nhom nay khi tu tao don - dung y thiet ke
// goc (ho la nguoi XU LY don, khong phai nguoi TAO don).
// FIX (phan hoi 2026-09-11: "vai trò TN đang không nhìn thấy các loại đề xuất để chọn") - them token
// "la_tac_nghiep": TN CO quyen "tạo hộ" (canDatHo o DatMuaLinhKienModule.tsx) nen KHAC voi la_kho/
// la_ke_toan thuan tuy o tren, truoc day thieu checkbox nay nen khong Admin nao gan duoc cho nhom
// nao (vd nhom "Tác nghiệp + Giám sát" co san chi gan duoc QC/Giam sat, thieu han Tac nghiep).
const VAI_TRO_TOKENS = [
  { value: "la_ktv_dvbh", label: "KTV / CTV / Trạm" },
  { value: "la_ve_tinh", label: "Vệ tinh" },
  { value: "la_tac_nghiep", label: "Tác nghiệp" },
  { value: "la_nv_sua_chua", label: "NV sửa chữa" },
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
  // "Mã kho" RIÊNG cho mẫu Xuất kho (them 2026-09-04) - khac han he ma cua mau Ban hang/Chuyen kho o
  // tren (vd "LKKGMB"/"LKKGMN" so voi "6803"/"6804") - xem giai thich day du o backend/src/lib/
  // misaExport.ts loadKhoSettings().
  misa_ma_kho_xk_mien_bac: string;
  misa_ma_kho_xk_mien_nam: string;
  // Kho ky gui hang moi KRF cho LK phan loai "Máy" (migration 0059, 2026-09-30) - tru dong TRỪ CÔNG NỢ.
  misa_ma_kho_may_mien_bac: string;
  misa_ten_kho_may_mien_bac: string;
  misa_ma_kho_may_mien_nam: string;
  misa_ten_kho_may_mien_nam: string;
}

const EMPTY_MISA_KHO_SETTINGS: MisaKhoSettingsData = {
  misa_ma_kho_mien_bac: "", misa_ten_kho_mien_bac: "", misa_ma_kho_mien_nam: "", misa_ten_kho_mien_nam: "",
  misa_ma_kho_xk_mien_bac: "", misa_ma_kho_xk_mien_nam: "",
  misa_ma_kho_may_mien_bac: "", misa_ten_kho_may_mien_bac: "", misa_ma_kho_may_mien_nam: "", misa_ten_kho_may_mien_nam: "",
};

const KHO_MAY_FIELDS: { key: keyof MisaKhoSettingsData; label: string }[] = [
  { key: "misa_ma_kho_may_mien_bac", label: "Mã kho Máy — Miền Bắc" },
  { key: "misa_ten_kho_may_mien_bac", label: "Tên kho Máy — Miền Bắc" },
  { key: "misa_ma_kho_may_mien_nam", label: "Mã kho Máy — Miền Nam" },
  { key: "misa_ten_kho_may_mien_nam", label: "Tên kho Máy — Miền Nam" },
];

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
  const current = form ?? data ?? EMPTY_MISA_KHO_SETTINGS;

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
            <div className="text-[var(--ink-500)]">Mã kho — Miền Bắc (Bán hàng/Chuyển kho)</div>
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
            <div className="text-[var(--ink-500)]">Mã kho — Miền Nam (Bán hàng/Chuyển kho)</div>
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
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Mã kho — Miền Bắc (riêng mẫu Xuất kho)</div>
            <input
              value={current.misa_ma_kho_xk_mien_bac}
              onChange={(e) => setForm({ ...current, misa_ma_kho_xk_mien_bac: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <div className="text-[var(--ink-500)]">Mã kho — Miền Nam (riêng mẫu Xuất kho)</div>
            <input
              value={current.misa_ma_kho_xk_mien_nam}
              onChange={(e) => setForm({ ...current, misa_ma_kho_xk_mien_nam: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="col-span-2 pt-2 border-t border-[var(--line)] text-xs text-[var(--ink-500)]">
            Linh kiện có Phân loại <b>"Máy"</b> xuất từ kho dưới đây (mọi mẫu file, trừ dòng "Trừ công nợ" vẫn trừ kho của
            KTV). Để trống thì dùng kho theo miền ở trên.
          </div>
          {KHO_MAY_FIELDS.map((f) => (
            <label key={f.key} className="text-xs space-y-1">
              <div className="text-[var(--ink-500)]">{f.label}</div>
              <input
                value={current[f.key]}
                onChange={(e) => setForm({ ...current, [f.key]: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
          ))}
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
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Tên</th>
                <th className="px-3 py-2">Giám sát phụ trách</th>
                <th className="hidden sm:table-cell px-3 py-2">Bật/tắt</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr onClick={() => openEdit(r)} key={r.ma} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-xs">{r.ma}</td>
                  <td className="px-3 py-2">{r.ten}</td>
                  <td className="px-3 py-2">{r.gs_email ? formatPersonDisplay(r.gs_email, personDir) : "— (chưa gán)"}</td>
                  <td className="hidden sm:table-cell px-3 py-2">{r.bat_tat ? "Bật" : "Tắt"}</td>
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
              {/* "Chưa có khu vực" (CHUA_CO, migration 0042): khu vuc he thong gom don khong xac dinh duoc khu vuc -
                  khong gan GS (backend chan KHU_VUC_HE_THONG); gan TN xu ly o Users › Nhân viên văn phòng. */}
              {form.ma === "CHUA_CO" ? (
                <div className="mt-1 text-xs text-[var(--ink-500)]">
                  Khu vực hệ thống: gom các đơn không xác định được khu vực (người nhận không thuộc khu vực nào và không do GS có khu vực tạo). Không gán Giám sát — hãy gán TN xử lý ở Users › Nhân viên văn phòng.
                </div>
              ) : (
                <Select value={form.gs_email} onChange={(v) => { setForm({ ...form, gs_email: v }); setGsOverwriteAck(false); }} options={[{ value: "", label: "— Không —" }, ...gsOptions]} />
              )}
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
    queryFn: () => api.get<{ connected: boolean; can_ket_noi_lai?: boolean; google_email?: string; authorized_at?: string }>("/settings/google-drive/status"),
  });

  return (
    <div className="max-w-md space-y-4">
      <div>
        <div className="text-xs text-[var(--ink-500)] mb-3">
          Uỷ quyền 1 tài khoản Google thật để upload ảnh trong hệ: "ảnh minh hoạ linh kiện" (Bảng giá), ảnh trả hàng (Đặt mua linh kiện › Trả hàng), và ảnh biên bản/bằng chứng chuyển tiền (Phiếu xuất kho). Chưa kết nối thì các thao tác upload ảnh này sẽ báo lỗi.
        </div>
        <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
          {isLoading ? (
            <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
          ) : (
            <>
              <KvRow label="Trạng thái">
                {data?.connected ? (data.can_ket_noi_lai ? <Badge tone="coral">Cần kết nối lại</Badge> : <Badge tone="teal">Đã kết nối</Badge>) : <Badge tone="gray">Chưa kết nối</Badge>}
              </KvRow>
              {data?.connected && (
                <>
                  <KvRow label="Tài khoản">
                    <span className="font-mono">{data.google_email}</span>
                  </KvRow>
                  <KvRow label="Uỷ quyền lúc">{data.authorized_at}</KvRow>
                </>
              )}
              {data?.can_ket_noi_lai && (
                <div className="text-xs text-[var(--color-danger-strong)] mt-2">
                  Khoá hệ thống đã đổi nên kết nối cũ không dùng được — mọi thao tác tải ảnh đang báo lỗi. Bấm "Kết nối tài khoản Google Drive" để uỷ quyền lại.
                </div>
              )}
              <div className="mt-3">
                {data?.connected && !data.can_ket_noi_lai ? (
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

interface DvbhSyncStatus {
  ktvPending: number;
  linhKienPending: number;
  khuVucPending: number;
  lastSyncKtv: string | null;
  lastSyncLinhKien: string | null;
  lastSyncKhuVuc: string | null;
}
interface DvbhSyncResult {
  ktvSynced: number;
  linhKienSynced: number;
  khuVucSynced: number;
  errors: string[];
}

// "Đồng bộ DVBH" (them 2026-08-28, phan hoi "khi cập nhật danh sách ktv hoặc cập nhật danh sách
// linh kiện, sẽ bắn API về web dvbh để cập nhật bổ sung dữ liệu mới nhất" + 04/09/2026: them dich thu
// 2 "suachua" + entity "Khu vực") - linh-kien-app la nguon su that cho ktv_lien_he/linh_kien/khu_vuc
// tu sau khi tach he, cron 1h/lan (backend `scheduled()`) tu day thay doi sang CA 2 dich, tab nay chi
// hien trang thai (gop ca 2 dich - "đang chờ" nghia la con IT NHAT 1 dich chua nhan, xem
// backend/src/lib/dvbhSyncClient.ts) + cho Admin bam dong bo ngay khi can gap.
function DongBoDvbhTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["dvbh-sync-status"],
    queryFn: () => api.get<DvbhSyncStatus>("/dvbh-sync"),
    refetchInterval: 60_000,
  });

  const run = useMutation({
    mutationFn: () => api.post<DvbhSyncResult>("/dvbh-sync/run", {}),
    onSuccess: async (res) => {
      if (res.errors.length > 0) {
        addToast(`Đồng bộ có lỗi: ${res.errors.join("; ")}`);
      } else {
        addToast(`Đã đồng bộ ${res.ktvSynced} KTV, ${res.linhKienSynced} linh kiện, ${res.khuVucSynced} Khu vực`);
      }
      await qc.invalidateQueries({ queryKey: ["dvbh-sync-status"] });
    },
    onError: (err) => addToast("Không thể đồng bộ: " + (err instanceof Error ? err.message : String(err))),
  });

  const tongDangCho = (data?.ktvPending ?? 0) + (data?.linhKienPending ?? 0) + (data?.khuVucPending ?? 0);

  return (
    <div className="max-w-md space-y-4">
      <div className="text-xs text-[var(--ink-500)]">
        Đẩy danh bạ KTV/danh mục linh kiện/Khu vực mới nhất sang hệ DVBH gốc và Worker "Sửa chữa bảo
        hành" (ghi đè - hệ này là nguồn dữ liệu chính từ sau khi tách hệ). Tự động chạy mỗi giờ, hoặc
        bấm "Đồng bộ ngay" để đẩy ngay lập tức khi cần gấp.
      </div>
      <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
        {isLoading ? (
          <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
        ) : (
          <>
            <KvRow label="KTV đang chờ đồng bộ">
              {(data?.ktvPending ?? 0) > 0 ? <Badge tone="amber">{data?.ktvPending}</Badge> : <Badge tone="teal">0</Badge>}
            </KvRow>
            <KvRow label="Linh kiện đang chờ đồng bộ">
              {(data?.linhKienPending ?? 0) > 0 ? <Badge tone="amber">{data?.linhKienPending}</Badge> : <Badge tone="teal">0</Badge>}
            </KvRow>
            <KvRow label="Khu vực đang chờ đồng bộ">
              {(data?.khuVucPending ?? 0) > 0 ? <Badge tone="amber">{data?.khuVucPending}</Badge> : <Badge tone="teal">0</Badge>}
            </KvRow>
            <KvRow label="Lần đồng bộ KTV gần nhất">{data?.lastSyncKtv ? fmtDateTime(data.lastSyncKtv) : "— (chưa từng)"}</KvRow>
            <KvRow label="Lần đồng bộ linh kiện gần nhất">{data?.lastSyncLinhKien ? fmtDateTime(data.lastSyncLinhKien) : "— (chưa từng)"}</KvRow>
            <KvRow label="Lần đồng bộ Khu vực gần nhất">{data?.lastSyncKhuVuc ? fmtDateTime(data.lastSyncKhuVuc) : "— (chưa từng)"}</KvRow>
            <div className="mt-3">
              <Btn size="sm" onClick={() => run.mutate()} loading={run.isPending} disabled={tongDangCho === 0 && !run.isPending}>
                🔄 Đồng bộ ngay
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface Gia88SyncStatus {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  last_error: string | null;
}

// "Đồng bộ Gia88" (them 2026-09-12, tich hop API bang gia doi tac "gia88" lam nguon chinh danh muc
// linh_kien - xem api-lk-prices_gia88.md + backend/src/lib/gia88Sync.ts). Cron tu chay 1 lan/dem luc
// 0h gio VN (backend `scheduled()`, gate theo gio UTC=17) - tab nay CHI hien trang thai lan chay gan
// nhat + cho Admin bam dong bo ngay khi can gap, mo phong dung khuon DongBoDvbhTab o tren.
function DongBoGia88Tab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["gia88-sync-status"],
    queryFn: () => api.get<Gia88SyncStatus>("/gia88-sync"),
    refetchInterval: 60_000,
  });

  const run = useMutation({
    mutationFn: () => api.post<Gia88SyncStatus>("/gia88-sync/run", {}),
    onSuccess: async (res) => {
      if (res.last_status === "error") {
        addToast(`Đồng bộ lỗi: ${res.last_error}`);
      } else {
        addToast(`Đã đồng bộ xong, ${res.changed_count} dòng thay đổi`);
      }
      await qc.invalidateQueries({ queryKey: ["gia88-sync-status"] });
    },
    onError: (err) => addToast("Không thể đồng bộ: " + (err instanceof Error ? err.message : String(err))),
  });

  return (
    <div className="max-w-md space-y-4">
      <div className="text-xs text-[var(--ink-500)]">
        Kéo bảng giá linh kiện mới nhất từ đối tác "gia88" về danh mục (Giá NY/KTV/dự phòng/EU, nhãn
        hàng, thiết bị, cấm bán...) — nguồn chính từ 2026-09-12, các trường đồng bộ chuyển "chỉ xem"
        trong Bảng giá. Tự động chạy 1 lần/đêm lúc 0h, hoặc bấm "Đồng bộ ngay" khi cần gấp.
      </div>
      <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
        {isLoading ? (
          <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
        ) : (
          <>
            <KvRow label="Lần đồng bộ gần nhất">{data?.last_run_at ? fmtDateTime(data.last_run_at) : "— (chưa từng)"}</KvRow>
            <KvRow label="Trạng thái">
              {data?.last_status === "error" ? <Badge tone="coral">Lỗi</Badge> : data?.last_status === "ok" ? <Badge tone="teal">OK</Badge> : "—"}
            </KvRow>
            <KvRow label="Số dòng thay đổi lần gần nhất">{data?.changed_count ?? 0}</KvRow>
            {data?.last_status === "error" && data.last_error && (
              <KvRow label="Chi tiết lỗi"><span className="text-[var(--coral-600)]">{data.last_error}</span></KvRow>
            )}
            <div className="mt-3">
              <Btn size="sm" onClick={() => run.mutate()} loading={run.isPending}>
                🔄 Đồng bộ ngay
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface PartnerApiKeyRow {
  id: number;
  ten_he_thong: string;
  bat_tat: number;
  ghi_chu: string | null;
  tao_luc: string;
  lan_dung_cuoi: string | null;
  email_dat_hang: string | null;
  dat_thay_nguoi_dung: number;
}

// "API đối tác" (them 2026-09-05, phan hoi "xây dựng cơ chế sẵn sàng cho các hệ thống gọi API tra
// cứu") - quan ly key cho GET /api/partner/v1/case-timeline (backend/src/routes/partnerApi.ts). Xac
// thuc rieng qua header "X-API-Key" (KHAC HOAN TOAN cookie session dung cho nguoi dung Google that) -
// key chi hien PLAINTEXT DUY NHAT 1 LAN luc tao (server chi luu hash), khong the xem lai sau.
function PartnerApiTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data } = useQuery({ queryKey: ["partner-api-keys"], queryFn: () => api.get<{ rows: PartnerApiKeyRow[] }>("/settings/partner-api-keys") });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ten_he_thong: "", ghi_chu: "" });
  // Key vua tao - CHI giu trong state phia client, khong bao gio doc lai duoc tu server sau khi dong
  // modal nay.
  const [newKey, setNewKey] = useState<{ ten_he_thong: string; api_key: string } | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<{ id: number; ten_he_thong: string; api_key: string }>("/settings/partner-api-keys", form),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["partner-api-keys"] });
      setCreating(false);
      setForm({ ten_he_thong: "", ghi_chu: "" });
      setNewKey({ ten_he_thong: res.ten_he_thong, api_key: res.api_key });
    },
    onError: () => addToast("Không thể tạo key, thử lại sau."),
  });

  const toggle = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/partner-api-keys/${id}`, { bat_tat }),
    onSuccess: async () => {
      addToast("Đã lưu");
      await qc.invalidateQueries({ queryKey: ["partner-api-keys"] });
    },
  });

  // Tai khoan dat hang thay (v1.470) - key co tai khoan nay moi goi duoc POST /api/partner/v1/dat-hang; don tao voi quyen cua tai khoan do.
  const dir = usePersonDirectory();
  const [ganTk, setGanTk] = useState<{ id: number; ten: string; email: string; datThay: boolean } | null>(null);
  const luuTk = useMutation({
    mutationFn: (v: { id: number; email: string; datThay: boolean }) =>
      api.patch(`/settings/partner-api-keys/${v.id}`, { email_dat_hang: v.email || null, dat_thay_nguoi_dung: v.datThay }),
    onSuccess: async () => {
      addToast("Đã lưu");
      setGanTk(null);
      await qc.invalidateQueries({ queryKey: ["partner-api-keys"] });
    },
    onError: (e) => addToast(e instanceof ApiError && e.code === "TAI_KHOAN_DAT_HANG_KHONG_HOP_LE" ? "Tài khoản chưa duyệt hoặc đã bị khoá." : "Không lưu được, thử lại sau."),
  });
  const tkOptions = [
    { value: "", label: "— Không đặt hàng (chỉ tra cứu) —" },
    ...[...dir.users.keys()].sort().map((email) => ({ value: email, label: `${formatPersonDisplay(email, dir)} · ${email}` })),
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Key cho các hệ thống đối tác bên ngoài gọi API <span className="font-mono">/api/partner/v1/…</span> (tra cứu đơn hàng, tồn kho, linh kiện; đặt linh kiện khi key được gán "Tài khoản đặt hàng").
        <Tooltip text={`Xác thực qua header "X-API-Key" (không liên quan tài khoản Google/đăng nhập). Mỗi key đại diện 1 hệ thống đối tác - khoá 1 key không ảnh hưởng các key khác, dùng khi 1 hệ thống ngừng hợp tác hoặc nghi lộ key.`} />
      </div>
      <Btn size="sm" onClick={() => setCreating(true)}>+ Tạo key mới</Btn>
      <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2">Hệ thống</th>
                <th className="hidden sm:table-cell px-3 py-2">Ghi chú</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Tài khoản đặt hàng</th>
                <th className="hidden sm:table-cell px-3 py-2">Tạo lúc</th>
                <th className="hidden sm:table-cell px-3 py-2">Lần dùng cuối</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-400)]">Chưa có key nào.</td>
                </tr>
              ) : (
                (data?.rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2">{r.ten_he_thong}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-[var(--ink-500)]">{r.ghi_chu ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.bat_tat ? "teal" : "coral"}>{r.bat_tat ? "Đang bật" : "Đã khoá"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="hover:underline text-xs text-[var(--ocean-600)]"
                        title="Đơn tạo qua API dùng quyền của tài khoản này"
                        onClick={() => setGanTk({ id: r.id, ten: r.ten_he_thong, email: r.email_dat_hang ?? "", datThay: !!r.dat_thay_nguoi_dung })}
                      >
                        {r.email_dat_hang ? formatPersonDisplay(r.email_dat_hang, dir) : r.dat_thay_nguoi_dung ? "— Không cố định" : "— Chỉ tra cứu (gán…)"}
                      </button>
                      {!!r.dat_thay_nguoi_dung && <div className="text-[11px] text-[var(--ink-500)]">+ đặt thay đúng người bấm</div>}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2">{fmtDateTime(r.tao_luc)}</td>
                    <td className="hidden sm:table-cell px-3 py-2">{r.lan_dung_cuoi ? fmtDateTime(r.lan_dung_cuoi) : "— (chưa từng)"}</td>
                    <td className="px-3 py-2">
                      <button
                        className={`hover:underline text-xs ${r.bat_tat ? "text-[var(--coral-500)]" : "text-[var(--ocean-600)]"}`}
                        onClick={() => toggle.mutate({ id: r.id, bat_tat: !r.bat_tat })}
                      >
                        {r.bat_tat ? "Khoá" : "Mở khoá"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal open onClose={() => setCreating(false)} title="Tạo key API mới" width="max-w-md">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên hệ thống đối tác</label>
              <input
                value={form.ten_he_thong}
                onChange={(e) => setForm({ ...form, ten_he_thong: e.target.value })}
                placeholder="Vd: Hệ thống DVBH gốc, CRM đối tác X"
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Ghi chú (tuỳ chọn)</label>
              <input
                value={form.ghi_chu}
                onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setCreating(false)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => create.mutate()} disabled={!form.ten_he_thong.trim() || create.isPending} loading={create.isPending}>
                Tạo key
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {ganTk && (
        <Modal open onClose={() => setGanTk(null)} title={`Tài khoản đặt hàng cho "${ganTk.ten}"`} width="max-w-lg">
          <div className="space-y-3 text-sm">
            <div className="text-xs text-[var(--ink-500)] leading-relaxed">
              Đơn hệ thống đối tác tạo qua <span className="font-mono">POST /api/partner/v1/dat-hang</span> được ghi là do tài khoản này đặt, đi đúng quy trình
              như khi tài khoản này bấm "Tạo đơn" (giá, chiết khấu, tồn kho, trần công nợ, tự duyệt). Tài khoản KTV chỉ đặt cho chính mình; Tác nghiệp / Giám
              sát / Admin đặt hộ được mọi KTV.
            </div>
            <Select value={ganTk.email} onChange={(v) => setGanTk({ ...ganTk, email: v })} options={tkOptions} className="w-full" />
            <label className="flex items-start gap-2 text-xs leading-relaxed">
              <input type="checkbox" className="mt-0.5" checked={ganTk.datThay} onChange={(e) => setGanTk({ ...ganTk, datThay: e.target.checked })} />
              <span>
                Cho hệ thống đối tác <b>đặt thay đúng người bấm</b> (gửi <span className="font-mono">email_nguoi_dat</span>): đơn ghi là do chính tài khoản đó đặt, theo
                quyền của tài khoản đó. Chỉ bật cho hệ thống nội bộ đã tự xác thực người dùng (vd DVBH đặt lõi lọc NSKX).
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setGanTk(null)}>Huỷ</Btn>
              <Btn size="sm" onClick={() => luuTk.mutate({ id: ganTk.id, email: ganTk.email, datThay: ganTk.datThay })} loading={luuTk.isPending} disabled={luuTk.isPending}>
                Lưu
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {newKey && (
        <Modal open onClose={() => setNewKey(null)} title={`Key mới cho "${newKey.ten_he_thong}"`} width="max-w-lg">
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-[var(--coral-500)] bg-[var(--coral-100)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--coral-600)] font-semibold">
              ⚠ Đây là LẦN DUY NHẤT bạn thấy được key này - hệ thống chỉ lưu bản mã hoá, không thể xem lại sau khi đóng. Sao chép và gửi cho hệ thống đối tác ngay bây giờ.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs break-all">{newKey.api_key}</code>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(newKey.api_key);
                  addToast("Đã sao chép");
                }}
              >
                Sao chép
              </Btn>
            </div>
            <div className="text-[var(--ink-500)] text-xs">
              Truyền qua header <span className="font-mono">X-API-Key</span> khi gọi <span className="font-mono">GET /api/partner/v1/case-timeline?id=&lt;case_id&gt;</span>.
            </div>
            <div className="flex justify-end pt-2">
              <Btn size="sm" onClick={() => setNewKey(null)}>Đã lưu, đóng lại</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
