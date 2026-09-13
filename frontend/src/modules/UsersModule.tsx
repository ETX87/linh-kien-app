import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { FileButton } from "../components/ui/FileButton";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { Tooltip } from "../components/ui/Tooltip";
import { useToast } from "../components/ui/Toast";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { useAuth } from "../auth/AuthContext";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import { exportRowsToExcel } from "../lib/exportExcel";
import { parseKtvImportFile, type BulkImportKtvChunkResult } from "../lib/ktvImport";
import { fmtVND, fmtDateTime } from "../types";
import type { UserRow, KtvLienHeRow, KhuVucRow, Paged, LoginLogRow, MaKhoChuaKhopRow } from "../types";

// Trang quan tri nguoi dung - xay lai 2026-08-26 (yeu cau "tach rieng 2 the quan ly" cho 2 nhom doi
// tuong dang nhap Gmail: KTV hien truong vs Nhan vien van phong, xem CLAUDE.md). "KTV hien truong"
// (truoc day la tab "Danh sách KTV" trong SettingsModule.tsx) CHUYEN VE DAY vi day moi la man hinh
// quan ly TAI KHOAN/QUYEN, Settings chi con giu du lieu nghiep vu thuan tuy (linh kien, ly do cham...).

const ROLE_FLAGS: { key: keyof UserRow; label: string }[] = [
  { key: "la_ktv_dvbh", label: "KTV DVBH" },
  { key: "la_ve_tinh", label: "Vệ tinh" },
  { key: "la_kho", label: "Kho" },
  { key: "la_ke_toan", label: "Kế toán" },
  { key: "la_tac_nghiep", label: "TN (tác nghiệp)" },
  { key: "la_tp_dvbh", label: "TP DVBH" },
  { key: "la_view", label: "View" },
];

export function UsersModule() {
  const [tab, setTab] = useState("cho-duyet");
  return (
    <div className="anim-in space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "cho-duyet", label: "Chờ duyệt" },
          { key: "ktv", label: "KTV hiện trường" },
          { key: "van-phong", label: "Nhân viên văn phòng" },
          { key: "phu-trach-gs", label: "Giám sát phụ trách" },
          { key: "login-log", label: "Lịch sử đăng nhập" },
        ]}
      />
      {tab === "cho-duyet" && <UserListTab tabValue="cho-duyet" />}
      {tab === "ktv" && <KtvTab />}
      {tab === "van-phong" && <VanPhongTab />}
      {tab === "phu-trach-gs" && <PhuTrachGsTab />}
      {tab === "login-log" && <LoginLogTab />}
    </div>
  );
}

function UserListTab({ tabValue }: { tabValue: "cho-duyet" | "da-duyet" }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const query = buildQuery({ tab: tabValue, search: search || undefined, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users", tabValue, search, page],
    queryFn: () => api.get<Paged<UserRow>>(`/users${query}`),
  });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const personDir = usePersonDirectory();

  // FIX (phan hoi 2026-09-05, audit AUD-001): endpoint /users gio LUON phan trang (khong con nhanh
  // tra het khi thieu page) - chuyen sang PaginatedTable giong VanPhongTab, thay vi <table> tu tay
  // khong co phan trang nhu truoc.
  const columns: Column<UserRow>[] = [
    // Quy uoc "Ten (email)" toan he thong (phan hoi 2026-08-25, hang muc #16).
    { key: "nguoi_dung", header: "Người dùng", render: (u) => formatPersonDisplay(u.email, personDir) },
    { key: "vai_tro", header: "Vai trò", render: (u) => u.vai_tro ?? "—" },
    {
      key: "co_nghiep_vu",
      header: "Cờ nghiệp vụ",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {ROLE_FLAGS.filter((f) => u[f.key]).map((f) => <Badge key={f.key} tone="ocean">{f.label}</Badge>)}
        </div>
      ),
    },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (u) => (
        <>
          <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : u.trang_thai_duyet === "Cho duyet" ? "amber" : "coral"}>
            {u.trang_thai_duyet}
          </Badge>
          {!!u.bi_khoa && <Badge tone="coral">Đã khoá</Badge>}
        </>
      ),
    },
    {
      key: "actions",
      header: "",
      mobileHint: "actions",
      render: (u) => (
        <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={(e) => { e.stopPropagation(); setEditing(u); }}>
          Sửa
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Tài khoản Gmail đăng nhập lần đầu, chưa xác định thuộc nhóm nào - Admin tự quyết định: tick cờ KTV DVBH/Vệ tinh (đẩy sang thẻ "KTV hiện trường") hoặc tick cờ/vai trò nhân viên văn phòng (đẩy sang thẻ "Nhân viên văn phòng") rồi bấm Duyệt.
      </div>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Tìm theo email/tên…"
        className="focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(u) => u.email}
        emptyText="Không có tài khoản nào."
        onRowClick={(u) => setEditing(u)}
      />
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
  const personDir = usePersonDirectory();
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
    la_view: !!user.la_view,
    quan_ly_danh_muc_lk: !!user.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: !!user.xem_danh_muc_lk,
    ma_misa: user.ma_misa ?? "",
    ten_misa: user.ten_misa ?? "",
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
        la_view: form.la_view,
        quan_ly_danh_muc_lk: form.quan_ly_danh_muc_lk,
        xem_danh_muc_lk: form.xem_danh_muc_lk,
        ma_misa: form.ma_misa.trim() || null,
        ten_misa: form.ten_misa.trim() || null,
      }),
    onSuccess: onSaved,
  });

  // Khu vuc phu trach (them 2026-08-26) - TN/Kho/Ke toan: bang user_khu_vuc, nhieu-nhieu, duoc phep
  // chong cheo, CHI phuc vu tim kiem/thong ke/badge - xem GET/PUT /api/users/:email/khu-vuc. View
  // (them sau, xac nhan nguoi dung "view thấy theo khu vực được set"): CUNG bang nay nhung Khu vuc o
  // day THAT SU gioi han du lieu View thay duoc (xem khuVucViewEmailInSql() trong scopeDatMua.ts) -
  // chua gan Khu vuc nao = View khong thay don nao ca. GS gan khu vuc qua khu_vuc.gs_email (Settings >
  // Khu vực), o day chi hien READ-ONLY.
  const showKhuVucAssign = form.la_kho || form.la_ke_toan || form.la_tac_nghiep || form.la_view;
  const isGiamSat = form.vai_tro === "Giam sat";
  const { data: khuVucData } = useQuery({ queryKey: ["settings-khu-vuc"], queryFn: () => api.get<{ rows: KhuVucRow[] }>("/settings/khu-vuc") });
  const khuVucRows = khuVucData?.rows ?? [];
  const { data: userKhuVucData } = useQuery({
    queryKey: ["user-khu-vuc", user.email],
    queryFn: () => api.get<{ khu_vuc_ma: string[] }>(`/users/${encodeURIComponent(user.email)}/khu-vuc`),
    enabled: showKhuVucAssign,
  });
  const [khuVucSelected, setKhuVucSelected] = useState<Set<string> | null>(null);
  const effectiveKhuVuc = khuVucSelected ?? new Set(userKhuVucData?.khu_vuc_ma ?? []);
  const saveKhuVuc = useMutation({
    mutationFn: () => api.put(`/users/${encodeURIComponent(user.email)}/khu-vuc`, { khu_vuc_ma: Array.from(effectiveKhuVuc) }),
  });
  const gsKhuVuc = khuVucRows.filter((k) => k.gs_email === user.email);

  async function handleSave() {
    await save.mutateAsync();
    if (showKhuVucAssign && khuVucSelected) await saveKhuVuc.mutateAsync();
  }

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
        {isGiamSat && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Khu vực đang phụ trách</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {gsKhuVuc.length === 0 ? (
                <span className="text-[var(--ink-400)] text-xs">— (chưa có khu vực nào)</span>
              ) : (
                gsKhuVuc.map((k) => <Badge key={k.ma} tone="ocean">{k.ten}</Badge>)
              )}
            </div>
            <div className="text-[11px] text-[var(--ink-400)] mt-1">Sửa ở Cài đặt › Khu vực.</div>
          </div>
        )}
        {showKhuVucAssign && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
              Khu vực phụ trách
              <Tooltip
                text={
                  form.la_view
                    ? "Với vai trò View: đây là phạm vi dữ liệu THẬT SỰ được xem (chỉ đơn của KTV thuộc các khu vực này) - chưa chọn khu vực nào thì không thấy đơn nào cả."
                    : "Chỉ để tìm kiếm/thống kê/badge - KHÔNG giới hạn quyền xem/xử lý đơn. Có thể chọn nhiều khu vực, cho phép chồng chéo với người khác."
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {khuVucRows.filter((k) => k.bat_tat).map((k) => (
                <label key={k.ma} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={effectiveKhuVuc.has(k.ma)}
                    onChange={(e) => {
                      const next = new Set(effectiveKhuVuc);
                      if (e.target.checked) next.add(k.ma);
                      else next.delete(k.ma);
                      setKhuVucSelected(next);
                    }}
                  />
                  {k.ten}
                </label>
              ))}
            </div>
          </div>
        )}
        {(form.la_ktv_dvbh || form.la_ve_tinh) && (
          <div className="grid grid-cols-2 gap-3">
            {/* Phase 4 (2026-08-26): giam_sat_quan_ly/tram_cha KHONG con do Admin nhap tay o day nua -
                tu dong tinh tu Khu vuc/"KTV cấp 1 phụ trách" gan trong the "KTV hiện trường" (xem
                lib/khuVucSync.ts). Chi hien READ-ONLY o day de doi chieu nhanh. */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Giám sát quản lý (tự động theo Khu vực)</label>
              <div className="w-full border border-[var(--line)] bg-[var(--surface-100)] rounded-lg px-2.5 py-1.5 text-sm mt-1 text-[var(--ink-600)]">
                {user.giam_sat_quan_ly ? formatPersonDisplay(user.giam_sat_quan_ly, personDir) : "— (chưa gán)"}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Trạm cha (tự động theo KTV cấp 1 phụ trách)</label>
              <div className="w-full border border-[var(--line)] bg-[var(--surface-100)] rounded-lg px-2.5 py-1.5 text-sm mt-1 text-[var(--ink-600)]">
                {user.tram_cha ? formatPersonDisplay(user.tram_cha, personDir) : "— (chưa gán)"}
              </div>
            </div>
            <div className="col-span-2 text-[11px] text-[var(--ink-400)] -mt-2">Sửa ở thẻ "KTV hiện trường" (Khu vực / KTV cấp 1 phụ trách).</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã tài khoản MISA</label>
            <input
              value={form.ma_misa}
              onChange={(e) => setForm({ ...form, ma_misa: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên trên MISA</label>
            <input
              value={form.ten_misa}
              onChange={(e) => setForm({ ...form, ten_misa: e.target.value })}
              className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1"
            />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.bi_khoa} onChange={(e) => setForm({ ...form, bi_khoa: e.target.checked })} />
          Khoá tài khoản
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose}>Huỷ</Btn>
          <Btn size="sm" onClick={handleSave} loading={save.isPending || saveKhuVuc.isPending} disabled={isSelf && !selfEditAck}>Lưu</Btn>
        </div>
      </div>
    </Modal>
  );
}

// "Nhân viên văn phòng" (them 2026-08-26) - the thu 2 trong yeu cau "tach rieng 2 the quan ly", loc
// nguoc lai voi KTV/Ve tinh qua query "nhom=van-phong" (backend/src/routes/users.ts). Dung lai chinh
// EditUserModal o tren (khong nhan doi logic sua/luu).
function VanPhongTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const personDir = usePersonDirectory();
  const [search, setSearch] = useState("");
  const [vaiTro, setVaiTro] = useState("");
  const [khuVuc, setKhuVuc] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data: khuVucData } = useQuery({ queryKey: ["settings-khu-vuc"], queryFn: () => api.get<{ rows: KhuVucRow[] }>("/settings/khu-vuc") });
  const query = buildQuery({ tab: "da-duyet", nhom: "van-phong", search: search || undefined, vai_tro: vaiTro || undefined, khu_vuc: khuVuc || undefined, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users", "van-phong", search, vaiTro, khuVuc, page],
    queryFn: () => api.get<Paged<UserRow>>(`/users${query}`),
  });
  const [editing, setEditing] = useState<UserRow | null>(null);

  // "Chuyển nhóm vai trò" chieu nguoc lai (them 2026-09-05, xem giai thich day du o KtvTab cung file)
  // - tat het co van phong + bat la_ktv_dvbh. KHONG tu mo modal tiep theo nhu chieu KTV->van phong vi
  // chua co ho so ktv_lien_he nao de sua (can Admin tu tao qua the "KTV hiện trường" > "+ Thêm KTV").
  const chuyenSangKtv = useMutation({
    mutationFn: (email: string) => api.post(`/users/${encodeURIComponent(email)}/chuyen-nhom-vai-tro`, { to: "ktv" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      addToast('Đã chuyển sang nhóm KTV hiện trường - qua thẻ "KTV hiện trường" > "+ Thêm KTV" để tạo hồ sơ (nhập đúng email này ở mục "Email đăng nhập")');
    },
  });

  const columns: Column<UserRow>[] = [
    { key: "nguoi_dung", header: "Người dùng", render: (u) => formatPersonDisplay(u.email, personDir) },
    { key: "vai_tro", header: "Vai trò", render: (u) => u.vai_tro ?? "—" },
    { key: "ma_misa", header: "Mã MISA", render: (u) => u.ma_misa ?? "—" },
    { key: "ten_misa", header: "Tên trên MISA", render: (u) => u.ten_misa ?? "—" },
    {
      key: "co_nghiep_vu",
      header: "Cờ nghiệp vụ",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {ROLE_FLAGS.filter((f) => u[f.key]).map((f) => <Badge key={f.key} tone="ocean">{f.label}</Badge>)}
        </div>
      ),
    },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (u) => (
        <>
          <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : "amber"}>{u.trang_thai_duyet}</Badge>
          {!!u.bi_khoa && <Badge tone="coral">Đã khoá</Badge>}
        </>
      ),
    },
    {
      key: "actions",
      header: "",
      mobileHint: "actions",
      render: (u) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => setEditing(u)}>
            Sửa
          </button>
          <button
            className="text-[var(--violet-600)] hover:underline text-xs"
            onClick={() => {
              if (
                window.confirm(
                  `Chuyển tài khoản "${u.email}" sang nhóm KTV hiện trường?\n\nSẽ tắt toàn bộ cờ văn phòng (Kho/Kế toán/TN/TP DVBH/View) và bật cờ KTV DVBH. Bạn cần tạo hồ sơ KTV (mã KTV, tên hiển thị...) riêng ở thẻ "KTV hiện trường" ngay sau đó.`,
                )
              ) {
                chuyenSangKtv.mutate(u.email);
              }
            }}
          >
            Chuyển KTV
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo email/tên…"
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
        />
        <Select
          value={vaiTro}
          onChange={(v) => { setVaiTro(v); setPage(1); }}
          options={[{ value: "", label: "— Mọi vai trò —" }, { value: "Admin", label: "Admin" }, { value: "QC", label: "QC" }, { value: "Giam sat", label: "Giám sát" }]}
          className="w-40"
        />
        <Select
          value={khuVuc}
          onChange={(v) => { setKhuVuc(v); setPage(1); }}
          options={[{ value: "", label: "— Mọi khu vực —" }, ...(khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten }))]}
          className="w-44"
        />
      </div>
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(u) => u.email}
        emptyText="Không có tài khoản nào."
        onRowClick={(u) => setEditing(u)}
      />
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            addToast("Đã lưu");
            await qc.invalidateQueries({ queryKey: ["users"] });
            await qc.invalidateQueries({ queryKey: ["settings-khu-vuc"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// Header dung chung cho ca 3 cho xuat/nhap Excel KTV (tai trang hien tai, tai toan bo, file mau) -
// PHAI khop dung ten cot ma pickKtvField() trong lib/ktvImport.ts nhan dien luc doc lai file.
const KTV_HEADER_LABELS: Record<string, string> = {
  ma_ktv: "Mã KTV",
  ten_hien_thi: "Tên hiển thị",
  sdt: "SĐT",
  vai_tro_ktv: "Vai trò",
  email_dang_nhap: "Email đăng nhập",
  giam_sat_quan_ly: "Email Giám sát quản lý (chỉ tham khảo)",
  khu_vuc_ma: "Khu vực",
  ktv_cap1_phu_trach: "KTV cấp 1 phụ trách (chỉ Vệ tinh)",
  cong_no: "Công nợ",
  han_muc_du_phong: "Hạn mức dự phòng",
  han_muc_du_phong_hien_tai: "Hạn mức dự phòng hiện tại",
  ma_misa: "Mã MISA",
  ten_misa: "Tên trên MISA",
  gmail: "Gmail",
  ghi_chu: "Ghi chú",
  nguoi_cap_nhat: "Người cập nhật",
  ngay_cap_nhat: "Ngày cập nhật",
};

// File mau cho "Nhap danh sach hang loat" - chi liet ke cac cot parseKtvImportFile() thuc su doc
// duoc (lib/ktvImport.ts pickKtvField) - KHONG gom ktv_cap1_phu_trach/nguoi_cap_nhat/ngay_cap_nhat vi
// bulk-import khong nhan may cot nay (ktv_cap1_phu_trach chi sua duoc tay tung dong, xem PATCH
// /:ma/dat-mua-lk). SDT mau ghi san dang co so 0 dau de nguoi dung thay dung dinh dang mong doi.
async function downloadKtvImportTemplate() {
  await exportRowsToExcel(
    [
      {
        ma_ktv: "vidu.ktv01",
        ten_hien_thi: "Nguyễn Văn A",
        sdt: "0912345678",
        vai_tro_ktv: "KTV",
        email_dang_nhap: "nguyenvana@gmail.com",
        gmail: "nguyenvana@gmail.com",
        giam_sat_quan_ly: "",
        khu_vuc_ma: "MB1",
        cong_no: 0,
        han_muc_du_phong: 0,
        han_muc_du_phong_hien_tai: 0,
        ma_misa: "",
        ten_misa: "",
        ghi_chu: "",
      },
    ],
    "mau_import_ktv.xlsx",
    "KTV",
    KTV_HEADER_LABELS,
  );
}

// "KTV hiện trường" (chuyen tu SettingsModule.tsx sang day 2026-08-26) - danh ba KTV/CTV/Trạm/Vệ
// tinh, nay la the QUAN LY TAI KHOAN chinh cho nhom nay (truoc day chi la danh ba chon "nguoi nhan
// hang"). Them tim kiem/loc cap 1-2/khu vuc + phan trang (truoc day tra het khong loc gi).
// mode (them 2026-09-05, phan hoi "đẩy ra menu để các vai trò nhân viên văn phòng có thể xem được
// thông tin (cấp quyền cho kế toán quyền sửa trần công nợ, mã misa, tên misa của KTV)") - export
// component nay de DanhSachKtvModule.tsx dung lai CHINH logic/bang nay cho nhom van phong, khong nhan
// doi ~400 dong. "admin" (mac dinh, dung o UsersModule nay) giu NGUYEN VEN hanh vi cu. "ke-toan": an
// Them/Nhap hang loat/Xoa, modal Sua CHI cho sua Tran cong no/Ma MISA/Ten MISA (cac truong con lai
// disabled de doi chieu), luu qua PATCH /:ma/cong-no-misa rieng (KHONG dung PATCH /:ma/dat-mua-lk).
// "readonly": nhu "ke-toan" nhung khong co truong nao sua duoc, khong co nut Luu.
export type KtvTabMode = "admin" | "ke-toan" | "readonly";

// Sinh "email dang nhap" NOI BO cho KTV khong co Gmail that (them 2026-09-12, phan hoi bug "khách
// hàng lẻ MN không chọn được làm người nhận hàng" - goc re: KH_LE_MN chua tung duoc gan
// email_dang_nhap nen khong co dong users tuong ung, bi INNER JOIN o GET /nguoi-nhan-hang-kha-dung
// loai bo AM THAM, khong co canh bao gi). email nay KHONG dung de dang nhap Google that (khong ai so
// huu hop thu @noreply.local) - chi la 1 gia tri duy nhat de provisionPlaceholderUser() (goi san trong
// PATCH /:ma/dat-mua-lk luc Luu) tao dong users placeholder, du dieu kien lam FK cho
// dat_don_hang.nguoi_nhan_hang. Sinh tu ma_ktv (da la PRIMARY KEY, dam bao duy nhat) thay vi de Admin
// tu nghi 1 dia chi gia tuy y (de nham/trung/quen dat).
function generateInternalEmail(maKtv: string): string {
  const slug = maKtv
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "ktv"}@noreply.local`;
}

export function KtvTab({ mode = "admin" }: { mode?: KtvTabMode } = {}) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const [cap, setCap] = useState("");
  const [khuVuc, setKhuVuc] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data: khuVucData } = useQuery({ queryKey: ["settings-khu-vuc"], queryFn: () => api.get<{ rows: KhuVucRow[] }>("/settings/khu-vuc") });
  const khuVucOptions = (khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten }));
  const query = buildQuery({ search: search || undefined, cap: cap || undefined, khu_vuc_ma: khuVuc || undefined, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings-ktv", search, cap, khuVuc, page],
    queryFn: () => api.get<Paged<KtvLienHeRow>>(`/settings/ktv-lien-he${query}`),
  });
  // Danh sach KTV cap 1 (dung lam options cho "KTV cấp 1 phụ trách" khi sua 1 Ve tinh) - tach rieng
  // KHONG phan trang/loc (can toan bo de tim dung nguoi, danh sach nay thuong khong qua dai).
  const { data: cap1Data } = useQuery({
    queryKey: ["settings-ktv", "cap1"],
    queryFn: () => api.get<{ rows: KtvLienHeRow[] }>("/settings/ktv-lien-he?cap=1"),
  });
  const cap1Options = (cap1Data?.rows ?? []).map((r) => ({ value: r.ma_ktv, label: `${r.ma_ktv} — ${r.ten_hien_thi ?? "?"}` }));

  // "Chọn bổ sung Mã MISA từ danh sách chưa khớp" (them 2026-09-08, phan hoi import tồn kho) - cac ma
  // kho tung import nhung chua tim duoc KTV khop (ma_ktv IS NULL, xem backend GET
  // /ktv-ton-kho/ma-kho-chua-khop) - chi Admin/Ke toan goi duoc (dung nhom sua ma_misa), an o readonly.
  const { data: chuaKhopData } = useQuery({
    queryKey: ["ktv-ton-kho-ma-kho-chua-khop"],
    queryFn: () => api.get<{ rows: MaKhoChuaKhopRow[] }>("/settings/ktv-ton-kho/ma-kho-chua-khop"),
    enabled: mode !== "readonly",
  });
  const chuaKhopOptions = (chuaKhopData?.rows ?? []).map((r) => ({
    value: r.ma_kho,
    label: `${r.ma_kho} — ${r.ten_kho ?? "?"} (${r.so_ma_hang} mặt hàng)`,
  }));

  const [editing, setEditing] = useState<KtvLienHeRow | "new" | null>(null);
  const [form, setForm] = useState({
    ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV" as KtvLienHeRow["vai_tro_ktv"], email_dang_nhap: "",
    khu_vuc_ma: "", ktv_cap1_phu_trach: "", cong_no: "", ma_misa: "", ten_misa: "",
    han_muc_du_phong: "", han_muc_du_phong_hien_tai: "",
  });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkSummary, setBulkSummary] = useState<{ success: number; errorCount: number } | null>(null);
  const [bulkFailDetails, setBulkFailDetails] = useState<{ ma_ktv: string; status: string }[]>([]);
  const [downloadingFull, setDownloadingFull] = useState(false);

  // "Tai toan bo danh sach" - nut export cu ("Tai danh sach (trang hien tai)") chi xuat data.rows cua
  // TRANG dang xem (bi gioi han pageSize=50) - nut nay goi lai API KHONG truyen "page" (backend tra
  // het khong phan trang, xem GET / o settingsKtv.ts) de xuat DUNG toan bo KTV khop bo loc hien tai.
  async function handleDownloadFullList() {
    setDownloadingFull(true);
    try {
      const fullQuery = buildQuery({ search: search || undefined, cap: cap || undefined, khu_vuc_ma: khuVuc || undefined });
      const res = await api.get<{ rows: KtvLienHeRow[] }>(`/settings/ktv-lien-he${fullQuery}`);
      await exportRowsToExcel(
        res.rows.map((r) => ({ ...r, giam_sat_quan_ly: r.giam_sat_quan_ly_hien_tai ?? r.giam_sat_quan_ly })),
        "danh_sach_ktv_full.xlsx",
        "KTV",
        KTV_HEADER_LABELS,
      );
    } catch (err) {
      addToast("Không tải được toàn bộ danh sách: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloadingFull(false);
    }
  }

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
    if (row === "new")
      setForm({
        ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV", email_dang_nhap: "", khu_vuc_ma: "", ktv_cap1_phu_trach: "", cong_no: "", ma_misa: "", ten_misa: "",
        han_muc_du_phong: "", han_muc_du_phong_hien_tai: "",
      });
    else
      setForm({
        ma_ktv: row.ma_ktv,
        ten_hien_thi: row.ten_hien_thi ?? "",
        sdt: row.sdt ?? "",
        vai_tro_ktv: row.vai_tro_ktv ?? "KTV",
        email_dang_nhap: row.email_dang_nhap ?? "",
        khu_vuc_ma: row.khu_vuc_ma ?? "",
        ktv_cap1_phu_trach: row.ktv_cap1_phu_trach ?? "",
        cong_no: row.cong_no != null ? String(row.cong_no) : "",
        ma_misa: row.ma_misa ?? "",
        ten_misa: row.ten_misa ?? "",
        han_muc_du_phong: row.han_muc_du_phong != null ? String(row.han_muc_du_phong) : "",
        han_muc_du_phong_hien_tai: row.han_muc_du_phong_hien_tai != null ? String(row.han_muc_du_phong_hien_tai) : "",
      });
  }

  const onSaveSuccess = async () => {
    addToast("Đã lưu");
    await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
    setEditing(null);
  };
  const onSaveError = () => addToast("Không thể lưu, thử lại sau.");

  const saveAdmin = useMutation({
    mutationFn: async () => {
      await api.post("/settings/ktv-lien-he", { ma_ktv: form.ma_ktv, ten_hien_thi: form.ten_hien_thi, sdt: form.sdt });
      await api.patch(`/settings/ktv-lien-he/${encodeURIComponent(form.ma_ktv)}/dat-mua-lk`, {
        vai_tro_ktv: form.vai_tro_ktv,
        email_dang_nhap: form.email_dang_nhap || null,
        khu_vuc_ma: form.khu_vuc_ma || null,
        ktv_cap1_phu_trach: form.vai_tro_ktv === "Ve tinh" ? form.ktv_cap1_phu_trach || null : null,
        cong_no: form.cong_no !== "" ? Number(form.cong_no) : null,
        ma_misa: form.ma_misa.trim() || null,
        ten_misa: form.ten_misa.trim() || null,
        han_muc_du_phong: form.han_muc_du_phong !== "" ? Number(form.han_muc_du_phong) : null,
        han_muc_du_phong_hien_tai: form.han_muc_du_phong_hien_tai !== "" ? Number(form.han_muc_du_phong_hien_tai) : null,
      });
    },
    onSuccess: onSaveSuccess,
    onError: onSaveError,
  });
  // mode="ke-toan" (them 2026-09-05): CHI goi 1 PATCH rieng voi dung 3 truong duoc uy quyen, khong
  // dung POST tao moi (khong the tao KTV moi tu the nay) va khong dung PATCH /:ma/dat-mua-lk day du.
  // SUA 2026-09-13: them 2 truong Han muc du phong vao cung uy quyen nay (Ke toan cung la nguoi quan
  // ly cac muc tien du tru cho KTV, giong tinh than cong_no/ma_misa/ten_misa da co san).
  const saveKeToan = useMutation({
    mutationFn: () =>
      api.patch(`/settings/ktv-lien-he/${encodeURIComponent(form.ma_ktv)}/cong-no-misa`, {
        cong_no: form.cong_no !== "" ? Number(form.cong_no) : null,
        ma_misa: form.ma_misa.trim() || null,
        ten_misa: form.ten_misa.trim() || null,
        han_muc_du_phong: form.han_muc_du_phong !== "" ? Number(form.han_muc_du_phong) : null,
        han_muc_du_phong_hien_tai: form.han_muc_du_phong_hien_tai !== "" ? Number(form.han_muc_du_phong_hien_tai) : null,
      }),
    onSuccess: onSaveSuccess,
    onError: onSaveError,
  });
  const save = mode === "ke-toan" ? saveKeToan : saveAdmin;

  const remove = useMutation({
    mutationFn: (ma: string) => api.delete(`/settings/ktv-lien-he/${encodeURIComponent(ma)}`),
    onSuccess: async () => {
      addToast("Đã xoá");
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
    },
  });

  // "Chuyển nhóm vai trò" (them 2026-09-05, phan hoi "có trường hợp setup nhầm tài khoản gmail thành
  // ktv, giờ cần chuyển thành tài khoản văn phòng" -> tong quat hoa "chuyển đổi giữa 2 nhóm vai trò").
  // Chi mode="admin", chi ap dung cho dong DA co email_dang_nhap (khong co gi de chuyen neu chua tung
  // gan tai khoan dang nhap). Sau khi goi POST /users/:email/chuyen-nhom-vai-tro (tat co KTV, huy lien
  // ket ktv_lien_he.email_dang_nhap), mo LUON EditUserModal cho dong users tuong ung de Admin chon
  // ngay vai tro van phong cu the (Kho/Ke toan/TN/...) - khong bat phai tu di tim lai o the "Nhân viên
  // văn phòng".
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const chuyenSangVanPhong = useMutation({
    mutationFn: (email: string) => api.post(`/users/${encodeURIComponent(email)}/chuyen-nhom-vai-tro`, { to: "van_phong" }),
    onSuccess: async (_res, email) => {
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      await qc.invalidateQueries({ queryKey: ["users"] });
      addToast("Đã chuyển sang nhóm văn phòng - chọn vai trò cụ thể bên dưới");
      const res = await api.get<{ rows: UserRow[] }>(`/users?tab=da-duyet&search=${encodeURIComponent(email)}`);
      const u = res.rows.find((r) => r.email === email);
      if (u) setEditingUser(u);
    },
  });

  const khuVucTenByMa = useMemo(() => new Map((khuVucData?.rows ?? []).map((k) => [k.ma, k.ten])), [khuVucData]);
  const tenByMaKtv = useMemo(() => new Map((cap1Data?.rows ?? []).map((r) => [r.ma_ktv, r.ten_hien_thi])), [cap1Data]);

  const columns: Column<KtvLienHeRow>[] = [
    { key: "ma_ktv", header: "Mã KTV", render: (r) => <span className="font-mono text-xs">{r.ma_ktv}</span> },
    { key: "ten_hien_thi", header: "Tên hiển thị", render: (r) => r.ten_hien_thi ?? "—" },
    { key: "sdt", header: "SĐT", render: (r) => r.sdt ?? "—" },
    { key: "vai_tro_ktv", header: "Vai trò", render: (r) => r.vai_tro_ktv ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (r) => (r.khu_vuc_ma ? khuVucTenByMa.get(r.khu_vuc_ma) ?? r.khu_vuc_ma : "—") },
    // FIX (ra soat UI 2026-08-27, hang muc #3): an han cot nay khi filter "cap" dang loc dung Cap 1 -
    // field CHI co nghia cho Ve tinh (vai_tro_ktv==='Ve tinh') nen luon rong khi dang xem rieng Cap 1,
    // chiem cho ngang vo ich tren bang 8 cot.
    ...(cap !== "1"
      ? [
          {
            key: "cap1_phu_trach",
            header: "KTV cấp 1 phụ trách",
            render: (r: KtvLienHeRow) => (r.vai_tro_ktv === "Ve tinh" && r.ktv_cap1_phu_trach ? `${r.ktv_cap1_phu_trach} — ${tenByMaKtv.get(r.ktv_cap1_phu_trach) ?? "?"}` : "—"),
          },
        ]
      : []),
    {
      key: "cong_no",
      header: "Trần công nợ",
      render: (r) =>
        r.cong_no != null ? (
          // FIX (ra soat UI 2026-08-27): tooltip truoc day hien nguyen chuoi gio VN "tho" tu DB, khong
          // qua fmtDateTime - dung quy uoc chung "moi cot thoi gian hien theo gio VN qua helper co san"
          // (xem CLAUDE.md/memory feedback_vn_timezone).
          <span title={r.cong_no_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.cong_no_cap_nhat_luc)}` : undefined}>{fmtVND(r.cong_no)}</span>
        ) : (
          "—"
        ),
    },
    // He thong "Han muc du phong KTV" (them 2026-09-13) - 4 cot mirror dung tinh than cot "Trần công
    // nợ" o tren: 2 cot dau nhap tay/import (co tooltip "Cập nhật lúc"), 2 cot sau la GIA TRI TINH
    // TOAN server-side (GET /settings/ktv-lien-he tra kem, xem duPhongKtv.ts), khong sua tay duoc.
    {
      key: "han_muc_du_phong",
      header: "Hạn mức dự phòng",
      render: (r) =>
        r.han_muc_du_phong != null ? (
          <span title={r.han_muc_du_phong_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.han_muc_du_phong_cap_nhat_luc)}` : undefined}>{fmtVND(r.han_muc_du_phong)}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "han_muc_du_phong_hien_tai",
      header: "Hạn mức dự phòng hiện tại",
      render: (r) =>
        r.han_muc_du_phong_hien_tai != null ? (
          <span title={r.han_muc_du_phong_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.han_muc_du_phong_cap_nhat_luc)}` : undefined}>{fmtVND(r.han_muc_du_phong_hien_tai)}</span>
        ) : (
          "—"
        ),
    },
    { key: "han_muc_du_phong_phat_sinh", header: "Hạn mức dự phòng phát sinh", render: (r) => fmtVND(r.han_muc_du_phong_phat_sinh) },
    { key: "moc_du_phong_hien_tai", header: "Mốc dự phòng hiện tại", render: (r) => fmtVND(r.moc_du_phong_hien_tai) },
    // FIX (ra soat UI 2026-08-27, hang muc #1): bo "(mã) Tên" lap lai truoc email - cot "Tên hiển thị"
    // da o ngay dau bang, khong can nhac lai o cot cuoi (giam ~50% do dai dong tren bang 25+ dong).
    { key: "email_dang_nhap", header: "Email đăng nhập", render: (r) => r.email_dang_nhap ?? "—" },
    { key: "ma_misa", header: "Mã MISA", render: (r) => r.ma_misa ?? "—" },
    { key: "ten_misa", header: "Tên trên MISA", render: (r) => r.ten_misa ?? "—" },
    {
      key: "actions",
      header: "",
      mobileHint: "actions",
      render: (r) => (
        // stopPropagation - dong da co onRowClick (bam dong mo Sua, xem duoi) nen 2 nut nay phai tu
        // chan bubble, khong thi bam "Xoá" se vua xoa vua mo modal Sua dong (da bi xoa) cung luc.
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openEdit(r)}>
            {mode === "admin" ? "Sửa" : mode === "ke-toan" ? "Sửa công nợ/MISA" : "Xem"}
          </button>
          {/* FIX (ra soat UI 2026-08-27, hang muc #5): Xoa truoc day khong co xac nhan nao - DELETE
              backend la hard delete, khong chan du KTV con don hang lich su (ktv_lien_he KHONG phai
              FK cua dat_don_hang, chi rieng users.email moi la FK) nen bam nham se am tham tao lai
              dung tinh trang "tai khoan mo coi" da phai sua tay o dau phien lam viec nay. */}
          {mode === "admin" && r.email_dang_nhap && (
            <button
              className="text-[var(--violet-600)] hover:underline text-xs"
              onClick={() => {
                if (
                  window.confirm(
                    `Chuyển tài khoản "${r.email_dang_nhap}" sang nhóm Nhân viên văn phòng?\n\nSẽ tắt cờ KTV DVBH/Vệ tinh và huỷ liên kết với hồ sơ KTV "${r.ma_ktv}" (danh bạ vẫn giữ nguyên, chỉ mất "người đăng nhập"). Bạn cần chọn vai trò văn phòng cụ thể (Kho/Kế toán/TN/...) ngay sau đó.`,
                  )
                ) {
                  chuyenSangVanPhong.mutate(r.email_dang_nhap!);
                }
              }}
            >
              Chuyển văn phòng
            </button>
          )}
          {mode === "admin" && (
            <button
              className="text-[var(--coral-500)] hover:underline text-xs"
              onClick={() => {
                if (window.confirm(`Xoá KTV "${r.ma_ktv}" (${r.ten_hien_thi ?? "chưa đặt tên"})?\n\nĐơn hàng cũ của người này sẽ KHÔNG bị xoá, nhưng sẽ mất liên kết danh bạ (mã KTV/khu vực/tên hiển thị) - có thể gây khó tra cứu sau này.`)) {
                  remove.mutate(r.ma_ktv);
                }
              }}
            >
              Xoá
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Danh bạ + tài khoản KTV/CTV/Trạm/Vệ tinh - dùng để chọn "người nhận hàng" khi tạo đơn, đồng thời là nơi gán Khu vực/KTV cấp 1 phụ trách/Trần công nợ.
        <Tooltip text={`Ghép "Email đăng nhập" để hệ thống tự cấp tài khoản (đã duyệt sẵn) khi người đó đăng nhập Google lần đầu. "KTV cấp 1 phụ trách" chỉ áp dụng cho Vệ tinh. Trần công nợ nhập tay/import Excel định kỳ, không đồng bộ tự động.`} />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {mode === "admin" && <Btn size="sm" onClick={() => openEdit("new")}>+ Thêm KTV</Btn>}
        {mode === "admin" && (
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
        )}
        <Btn
          variant="ghost"
          size="sm"
          onClick={() =>
            exportRowsToExcel(
              (data?.rows ?? []).map((r) => ({ ...r, giam_sat_quan_ly: r.giam_sat_quan_ly_hien_tai ?? r.giam_sat_quan_ly })),
              "danh_sach_ktv.xlsx",
              "KTV",
              KTV_HEADER_LABELS,
            )
          }
        >
          ⬇ Tải danh sách (trang hiện tại)
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => void handleDownloadFullList()} disabled={downloadingFull} loading={downloadingFull}>
          ⬇ Tải toàn bộ danh sách
        </Btn>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo mã/tên/SĐT/email…"
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-56"
        />
        <Select value={cap} onChange={(v) => { setCap(v); setPage(1); }} options={[{ value: "", label: "— Mọi cấp —" }, { value: "1", label: "Cấp 1 (KTV/CTV/Trạm)" }, { value: "2", label: "Cấp 2 (Vệ tinh)" }]} className="w-52" />
        <Select value={khuVuc} onChange={(v) => { setKhuVuc(v); setPage(1); }} options={[{ value: "", label: "— Mọi khu vực —" }, ...khuVucOptions]} className="w-44" />
      </div>
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.ma_ktv}
        emptyText="Không có KTV nào."
        onRowClick={(r) => openEdit(r)}
      />
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing === "new" ? "Thêm KTV" : mode === "ke-toan" ? "Sửa công nợ / MISA" : mode === "readonly" ? "Chi tiết KTV" : "Sửa KTV"}
          width="max-w-md"
        >
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã KTV</label>
              <input value={form.ma_ktv} disabled={editing !== "new" || mode !== "admin"} onChange={(e) => setForm({ ...form, ma_ktv: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên hiển thị</label>
              <input disabled={mode !== "admin"} value={form.ten_hien_thi} onChange={(e) => setForm({ ...form, ten_hien_thi: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Số điện thoại</label>
              <input disabled={mode !== "admin"} value={form.sdt} onChange={(e) => setForm({ ...form, sdt: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Vai trò</label>
              <Select
                disabled={mode !== "admin"}
                value={form.vai_tro_ktv ?? "KTV"}
                onChange={(v) => setForm({ ...form, vai_tro_ktv: v as KtvLienHeRow["vai_tro_ktv"], ktv_cap1_phu_trach: v === "Ve tinh" ? form.ktv_cap1_phu_trach : "" })}
                options={[
                  { value: "KTV", label: "KTV" }, { value: "CTV", label: "CTV" }, { value: "Tram", label: "Trạm" }, { value: "Ve tinh", label: "Vệ tinh" },
                ]}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Khu vực</label>
              <Select disabled={mode !== "admin"} value={form.khu_vuc_ma} onChange={(v) => setForm({ ...form, khu_vuc_ma: v })} options={[{ value: "", label: "— Chưa gán —" }, ...khuVucOptions]} />
            </div>
            {form.vai_tro_ktv === "Ve tinh" && (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">KTV cấp 1 phụ trách</label>
                <Select
                  disabled={mode !== "admin"}
                  value={form.ktv_cap1_phu_trach}
                  onChange={(v) => setForm({ ...form, ktv_cap1_phu_trach: v })}
                  options={[{ value: "", label: "— Chưa gán —" }, ...cap1Options.filter((o) => o.value !== form.ma_ktv)]}
                />
              </div>
            )}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Trần công nợ
                <Tooltip text="Nhập tay hoặc import Excel định kỳ - không có đồng bộ tự động." />
              </label>
              <input
                type="number"
                disabled={mode === "readonly"}
                value={form.cong_no}
                onChange={(e) => setForm({ ...form, cong_no: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60"
              />
            </div>
            {/* He thong "Han muc du phong KTV" (them 2026-09-13) - mirror dung cap input Tran cong no
                o tren, du dieu kien cho ca mode="admin" (PATCH /:ma/dat-mua-lk) lan "ke-toan" (PATCH
                /:ma/cong-no-misa) vi ca 2 route deu da duoc mo rong nhan 2 truong nay. */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Hạn mức dự phòng
                <Tooltip text="Nhập tay hoặc import Excel định kỳ - trần được cấp cho KTV mua dự trữ theo giá dự phòng." />
              </label>
              <input
                type="number"
                disabled={mode === "readonly"}
                value={form.han_muc_du_phong}
                onChange={(e) => setForm({ ...form, han_muc_du_phong: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Hạn mức dự phòng hiện tại
                <Tooltip text="Nhập tay hoặc import Excel định kỳ - số dư còn lại theo lần cập nhật gần nhất (không tự tính)." />
              </label>
              <input
                type="number"
                disabled={mode === "readonly"}
                value={form.han_muc_du_phong_hien_tai}
                onChange={(e) => setForm({ ...form, han_muc_du_phong_hien_tai: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Email đăng nhập (Google)
                <Tooltip text="Bắt buộc phải có giá trị thì KTV mới chọn được làm 'Người nhận hàng' (dat_don_hang.nguoi_nhan_hang là khoá ngoại thật tới users.email) - KTV chưa gán email sẽ biến mất khỏi danh sách đó mà không có cảnh báo gì. Nếu KTV không có Gmail thật (vd đầu mối 'Khách hàng lẻ'), dùng nút bên dưới để tự tạo 1 mã đăng nhập nội bộ, không dùng để đăng nhập được." />
              </label>
              <input disabled={mode !== "admin"} value={form.email_dang_nhap} onChange={(e) => setForm({ ...form, email_dang_nhap: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
              {mode === "admin" && !form.email_dang_nhap.trim() && form.ma_ktv.trim() && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, email_dang_nhap: generateInternalEmail(form.ma_ktv) })}
                  className="focus-ring mt-1 text-[11px] font-semibold text-[var(--ocean-700)] underline underline-offset-2"
                >
                  Không có Gmail thật? Tự tạo mã đăng nhập nội bộ
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                  Mã tài khoản MISA
                  <Tooltip text={`Gõ tay trực tiếp, hoặc chọn từ danh sách "mã kho" từng import từ MISA nhưng chưa khớp được KTV nào bên dưới - chọn xong bấm Lưu sẽ khớp lại NGAY toàn bộ tồn kho của mã đó cho KTV này, không cần đợi import lại.`} />
                </label>
                <input disabled={mode === "readonly"} value={form.ma_misa} onChange={(e) => setForm({ ...form, ma_misa: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
                {mode !== "readonly" && chuaKhopOptions.length > 0 && (
                  <Select
                    value=""
                    onChange={(v) => {
                      if (!v) return;
                      const picked = chuaKhopData?.rows.find((r) => r.ma_kho === v);
                      setForm({ ...form, ma_misa: v, ten_misa: form.ten_misa.trim() ? form.ten_misa : picked?.ten_kho ?? form.ten_misa });
                    }}
                    options={[{ value: "", label: "— hoặc chọn mã kho chưa khớp KTV —" }, ...chuaKhopOptions]}
                    className="mt-1"
                  />
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên trên MISA</label>
                <input disabled={mode === "readonly"} value={form.ten_misa} onChange={(e) => setForm({ ...form, ten_misa: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60" />
              </div>
            </div>
            {editing !== "new" && (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Giám sát quản lý (tự động theo Khu vực)</label>
                <div className="w-full border border-[var(--line)] bg-[var(--surface-100)] rounded-lg px-2.5 py-1.5 text-sm mt-1 text-[var(--ink-600)]">
                  {editing?.giam_sat_quan_ly_hien_tai ?? "— (chưa gán)"}
                </div>
                <div className="text-[11px] text-[var(--ink-400)] mt-1">Đổi Khu vực ở trên để đổi Giám sát quản lý.</div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>{mode === "readonly" ? "Đóng" : "Huỷ"}</Btn>
              {mode !== "readonly" && (
                <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ma_ktv.trim() || save.isPending} loading={save.isPending}>Lưu</Btn>
              )}
            </div>
          </div>
        </Modal>
      )}

      <Modal open={bulkOpen} onClose={() => { if (!bulkRunning) setBulkOpen(false); }} title="Nhập danh sách KTV hàng loạt">
        <div className="space-y-3">
          <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
            File Excel có ít nhất cột <span className="font-mono">Mã KTV</span>.
            <Tooltip text={`Các cột khác (Tên hiển thị, SĐT, Ghi chú, Vai trò, Gmail, Email đăng nhập, Email Giám sát quản lý, Khu vực, Công nợ, Mã MISA, Tên trên MISA) là tuỳ chọn - có thể chỉ đưa vào file đúng cột nào muốn cập nhật (vd chỉ "Mã KTV" + "Tên hiển thị"), cột không có trong file sẽ giữ nguyên giá trị cũ, không bị xoá trắng. Mã đã tồn tại sẽ được cập nhật đè theo đúng các cột có mặt, mã chưa có sẽ được thêm mới. Nếu có "Email đăng nhập", hệ thống tự cấp tài khoản (đã duyệt sẵn) cho email đó — giống hệt khi ghép thủ công 1 dòng.`} />
          </div>
          {!bulkRunning && !bulkSummary && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => void downloadKtvImportTemplate()}>
                ⬇ Tải file mẫu
              </Btn>
              <FileButton accept=".xlsx,.xls" onFileSelected={(f) => void handleBulkImportKtv(f)}>
                ⬆ Chọn file Excel
              </FileButton>
            </>
          )}
          {bulkRunning && (
            <div className="text-sm">
              Đang xử lý... {bulkProcessed}/{bulkTotal} dòng
              <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--ocean-800)] transition-all"
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
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={async () => {
            addToast("Đã lưu");
            await qc.invalidateQueries({ queryKey: ["users"] });
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

function PhuTrachGsTab() {
  const addToast = useToast();
  const personDir = usePersonDirectory();
  // FIX (phan hoi 2026-09-05, audit AUD-001): truoc day goi /users?tab=da-duyet KHONG loc nhom, keo
  // theo ca tai khoan KTV/Ve tinh (co the rat nhieu, xem CLAUDE.md - vai tro se >250 KTV) chi de loc
  // client-side xuong con TN/Kho/Ke toan/Giam sat. Them nhom=van-phong (loai KTV/Ve tinh ngay tu SQL)
  // + pageSize=200 (cap toi da cua endpoint) - man hinh nay la danh sach gan Giam sat phu trach, chi
  // can bao trum nhan vien van phong, khong can UI phan trang (so luong nho, on dinh).
  const { data: usersData } = useQuery({
    queryKey: ["users", "van-phong-lookup"],
    queryFn: () => api.get<Paged<UserRow>>(`/users${buildQuery({ tab: "da-duyet", nhom: "van-phong", page: 1, pageSize: 200 })}`),
  });
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
              <tr className="text-left text-[var(--ink-400)] text-[10.5px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-b border-[var(--line)]">
                <th className="px-3 py-2">Người phụ trách</th>
                <th className="px-3 py-2">Vai trò</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tnKhoKeToan.map((u) => (
                <tr
                  key={u.email}
                  onClick={() => openFor(u.email)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFor(u.email); } }}
                  className="cursor-pointer focus-ring border-b border-[var(--line)] last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-2">{formatPersonDisplay(u.email, personDir)}</td>
                  <td className="px-3 py-2">
                    {[u.la_tac_nghiep && "TN", u.la_kho && "Kho", u.la_ke_toan && "Kế toán"].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={(e) => { e.stopPropagation(); openFor(u.email); }}>
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

// The "Lịch sử đăng nhập" (bo sung theo audit "Ma trận kiểm soát hệ thống" 2026-08-27, muc A1) - bang
// login_log da duoc ghi day du moi lan dang nhap that (routes/auth.ts, GET /users/login-log co san)
// nhung truoc day khong co man nao hien thi - chi doc/tra cuu (khong sua/xoa gi), chi Admin vao duoc
// module nay nen khong can gate rieng.
function LoginLogTab() {
  const personDir = usePersonDirectory();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const query = buildQuery({ email: search.trim() || undefined, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["login-log", search, page],
    queryFn: () => api.get<Paged<LoginLogRow>>(`/users/login-log${query}`),
  });

  const columns: Column<LoginLogRow>[] = [
    { key: "email", header: "Người dùng", render: (r) => formatPersonDisplay(r.email, personDir) },
    { key: "thoi_gian", header: "Thời gian", render: (r) => fmtDateTime(r.thoi_gian) },
    { key: "ip", header: "IP", render: (r) => r.ip ?? "—" },
    { key: "user_agent", header: "Trình duyệt/Thiết bị", render: (r) => <span className="text-xs text-[var(--ink-500)] line-clamp-1" title={r.user_agent ?? ""}>{r.user_agent ?? "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--ink-500)] flex items-center gap-1.5">
        Nhật ký mỗi lần đăng nhập Google thành công (bảo mật nội bộ - tra cứu ai đăng nhập lúc nào từ đâu).
        <Tooltip text={`Để trống ô tìm kiếm sẽ hiện đăng nhập của MỌI người trong 90 ngày gần nhất. Gõ đúng email để xem toàn bộ lịch sử của riêng người đó (không giới hạn 90 ngày).`} />
      </div>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Lọc theo đúng email…"
        className="focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        rowKey={(r) => r.id}
        emptyText="Không có lượt đăng nhập nào."
      />
    </div>
  );
}
