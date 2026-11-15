import { useEffect, useMemo, useState } from "react";
import { NHOM_LK_LABEL, NHOM_LK_LIST, type NhomLk } from "../lib/nhomLk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery, ApiError } from "../api/client";
import { Btn } from "../components/ui/Btn";
import { FileButton } from "../components/ui/FileButton";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { KvRow } from "../components/ui/KvRow";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { Tooltip } from "../components/ui/Tooltip";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { useAuth } from "../auth/AuthContext";
import { formatPersonDisplay, usePersonDirectory } from "../lib/personDisplay";
import { exportRowsToExcel } from "../lib/exportExcel";
import { parseKtvImportFile, type BulkImportKtvChunkResult } from "../lib/ktvImport";
import { fmtVND, fmtDateTime } from "../types";
import type { UserRow, KtvLienHeRow, KhuVucRow, Paged, LoginLogRow, MaKhoChuaKhopRow, EtxNhanSuRow, EtxNhanSuSyncStatus } from "../types";
import { Money } from "../components/ui/Money";
import { ImportCongNoMisaModal } from "./ImportCongNoMisaModal";

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
  { key: "la_mua_hang", label: "Mua hàng" },
  { key: "la_nv_sua_chua", label: "NV sửa chữa" },
];

// Nhan hien thi co dau cho users.trang_thai_duyet (gia tri DB khong dau) - truoc day in tho "Da duyet".
const TRANG_THAI_DUYET_LABEL: Record<string, string> = { "Cho duyet": "Chờ duyệt", "Da duyet": "Đã duyệt", "Tu choi": "Từ chối" };

export function UsersModule({ pendingKtvSearch }: { pendingKtvSearch?: { value: string; nonce: number } | null } = {}) {
  const [tab, setTab] = useState("cho-duyet");
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  // Deep link tu vi-pham-app (xem App.tsx) - nhay thang sang tab "KTV hien truong" moi lan nonce doi
  // (ke ca khi tab nay da mo san tu truoc, vd Admin bam 2 lan lien tiep 2 email khac nhau).
  useEffect(() => {
    if (pendingKtvSearch) setTab("ktv");
  }, [pendingKtvSearch]);
  return (
    <div className="anim-in space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "cho-duyet", label: "Chờ duyệt" },
          // Them 2026-09-28 - TOAN BO tai khoan da xu ly duyet, ke ca tai khoan khong hien o the nao (co KTV/Ve
          // tinh nhung chua lien ket danh ba KTV), vd phamgiang3104@gmail.com.
          { key: "da-duyet", label: "Người dùng đã duyệt" },
          { key: "ktv", label: "KTV hiện trường" },
          { key: "van-phong", label: "Nhân viên văn phòng" },
          { key: "phu-trach-gs", label: "Giám sát phụ trách" },
          { key: "login-log", label: "Lịch sử đăng nhập" },
          // Du lieu nhan su nhay cam hon KTV hien truong - chi Admin thay tab nay (khac cac tab con
          // lai, mo cho ca QC/Giam sat truy cap module Users).
          ...(isAdmin ? [{ key: "etx-nhan-su", label: "ETX nhân sự" }] : []),
        ]}
      />
      {tab === "cho-duyet" && <UserListTab key="cho-duyet" tabValue="cho-duyet" />}
      {tab === "da-duyet" && <UserListTab key="da-duyet" tabValue="da-duyet" />}
      {tab === "ktv" && <KtvTab initialSearch={pendingKtvSearch} />}
      {tab === "van-phong" && <VanPhongTab />}
      {tab === "phu-trach-gs" && <PhuTrachGsTab />}
      {tab === "login-log" && <LoginLogTab />}
      {tab === "etx-nhan-su" && isAdmin && <EtxNhanSuTab />}
    </div>
  );
}

// "Gắn mã KTV" (2026-10-01, phan hoi "tài khoản chuyển từ nhân viên văn phòng sang KTV ... đã set KTV nhưng vẫn báo chưa
// set"): co KTV DVBH/Ve tinh CHI la co quyen - tai khoan chi thuoc the "KTV hiện trường" khi 1 ma KTV trong danh ba co Email
// dang nhap = Gmail nay. "Chuyển sang văn phòng" go lien ket, "Chuyển KTV" chi bat co -> tai khoan lo lung "Chưa thuộc thẻ nào".
// Modal nay chon 1 ma KTV co san roi gan Gmail qua PATCH /settings/ktv-lien-he/:ma/dat-mua-lk (cung duong voi sua "Email đăng
// nhập" o the KTV - tu cap users + dong bo GS/Tram/khu vuc don cu).
function goiYTimMaKtv(u: Pick<UserRow, "ten" | "ten_misa" | "email">): string {
  const ten = (u.ten_misa || u.ten || "").trim();
  if (!ten) return u.email.split("@")[0];
  const sauGachCuoi = ten.split(/\s+-\s+|-/).pop()?.trim();
  return sauGachCuoi || ten;
}

function GanMaKtvModal({ user, onClose, onDone, vanPhong = false }: { user: UserRow; onClose: () => void; onDone: () => void; vanPhong?: boolean }) {
  const addToast = useToast();
  const [search, setSearch] = useState(() => goiYTimMaKtv(user));
  const [chiChuaCoTk, setChiChuaCoTk] = useState(true);
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isLoading } = useQuery({
    queryKey: ["gan-ma-ktv", debounced],
    queryFn: () => api.get<Paged<KtvLienHeRow>>(`/settings/ktv-lien-he${buildQuery({ search: debounced || undefined, page: 1, pageSize: 30 })}`),
    enabled: debounced.length >= 2,
  });
  const rows = (data?.rows ?? []).filter((r) => !chiChuaCoTk || !r.email_dang_nhap || r.email_dang_nhap === user.email);
  const gan = useMutation({
    mutationFn: (ma: string) => api.patch(`/settings/ktv-lien-he/${encodeURIComponent(ma)}/dat-mua-lk`, { email_dang_nhap: user.email }),
    onSuccess: (_r, ma) => {
      addToast(vanPhong ? `Đã gắn mã ${ma} cho ${user.email} — đặt hộ được, tài khoản vẫn ở thẻ "Nhân viên văn phòng"` : `Đã gắn mã ${ma} cho ${user.email} — tài khoản hiện ở thẻ "KTV hiện trường"`);
      onDone();
    },
    onError: (err) => addToast("Không gắn được: " + (err instanceof Error ? err.message : String(err))),
  });
  return (
    <Modal open onClose={onClose} title={`Gắn mã KTV cho ${user.email}`} width="max-w-2xl">
      <div className="space-y-3 text-sm">
        {vanPhong ? (
          <div className="text-xs text-[var(--ink-500)]">
            Gắn 1 mã KTV có sẵn cho Gmail này để TN/GS đặt hộ được (người nhận hàng). Vai trò và cờ văn phòng giữ nguyên. Mã cần có Mã MISA.
          </div>
        ) : (
        <div className="text-xs text-[var(--ink-500)]">
          Cờ "KTV DVBH" chỉ là quyền. Tài khoản chỉ thuộc thẻ "KTV hiện trường" khi có 1 mã KTV trong danh bạ dùng Gmail này làm Email đăng nhập. Chọn mã của người này
          (chưa có mã thì tạo ở thẻ "KTV hiện trường" › "+ Thêm KTV", nhập Email đăng nhập = Gmail này).
        </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã KTV / tên…"
            className="o-tim focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-[var(--ink-600)]">
            <input type="checkbox" checked={chiChuaCoTk} onChange={(e) => setChiChuaCoTk(e.target.checked)} />
            Chỉ mã chưa gắn tài khoản
          </label>
        </div>
        <div className="max-h-[50vh] overflow-auto border border-[var(--line)] rounded-lg">
          {debounced.length < 2 ? (
            <div className="p-3 text-[var(--ink-400)]">Gõ ít nhất 2 ký tự để tìm.</div>
          ) : isLoading ? (
            <div className="p-3 text-[var(--ink-400)]">Đang tìm…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-[var(--ink-400)]">Không có mã phù hợp{chiChuaCoTk ? " (thử bỏ \"Chỉ mã chưa gắn tài khoản\")" : ""}.</div>
          ) : (
            <table className="tbl w-full">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ma_ktv}>
                    <td className="font-mono text-xs whitespace-nowrap">{r.ma_ktv}</td>
                    <td className="truncate max-w-[260px]" title={r.ten_hien_thi ?? ""}>{r.ten_hien_thi ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs">{r.khu_vuc_ma ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs">
                      {r.email_dang_nhap ? <span className="text-[var(--color-warning)]" title={r.email_dang_nhap}>Đang gắn: {r.email_dang_nhap}</span> : <span className="text-[var(--ink-400)]">Chưa gắn</span>}
                    </td>
                    <td className="text-right">
                      <Btn
                        size="sm"
                        variant="ghost"
                        loading={gan.isPending && gan.variables === r.ma_ktv}
                        disabled={gan.isPending || r.email_dang_nhap === user.email}
                        onClick={() => {
                          if (r.email_dang_nhap && !window.confirm(`Mã ${r.ma_ktv} đang gắn với ${r.email_dang_nhap}. Đổi sang ${user.email}?\n\nTài khoản cũ sẽ không còn thuộc mã này.`)) return;
                          gan.mutate(r.ma_ktv);
                        }}
                      >
                        {r.email_dang_nhap === user.email ? "Đã gắn" : "Gắn"}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end">
          <Btn variant="ghost" size="sm" onClick={onClose}>Đóng</Btn>
        </div>
      </div>
    </Modal>
  );
}

function UserListTab({ tabValue }: { tabValue: "cho-duyet" | "da-duyet" }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [chiKhongThuocThe, setChiKhongThuocThe] = useState(false);
  const pageSize = 50;
  const nhom = tabValue === "da-duyet" && chiKhongThuocThe ? "khong-thuoc-the" : undefined;
  const query = buildQuery({ tab: tabValue, search: search || undefined, nhom, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users", tabValue, search, nhom ?? "", page],
    queryFn: () => api.get<Paged<UserRow>>(`/users${query}`),
  });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [ganMa, setGanMa] = useState<UserRow | null>(null);
  const personDir = usePersonDirectory();

  // FIX (phan hoi 2026-09-05, audit AUD-001): endpoint /users gio LUON phan trang (khong con nhanh
  // tra het khi thieu page) - chuyen sang PaginatedTable giong VanPhongTab, thay vi <table> tu tay
  // khong co phan trang nhu truoc.
  const columns: Column<UserRow>[] = [
    // Quy uoc "Ten (email)" toan he thong (phan hoi 2026-08-25, hang muc #16).
    { key: "nguoi_dung", mobile: "title", header: "Người dùng", render: (u) => formatPersonDisplay(u.email, personDir) },
    // Ma nhan su NS-xxxx (2026-10-22, migration 0096).
    { key: "ma_nhan_su", mobile: "meta", header: "Mã nhân sự", render: (u) => (u.ma_nhan_su ? <span className="font-mono text-xs">{u.ma_nhan_su}</span> : "—") },
    { key: "vai_tro", mobile: "meta", header: "Vai trò", render: (u) => u.vai_tro ?? "—" },
    ...(tabValue === "da-duyet"
      ? [{
          key: "the", mobile: "meta" as const,
          header: "Hiện ở thẻ",
          render: (u: UserRow) =>
            !(u.la_ktv_dvbh || u.la_ve_tinh) ? (
              <span className="whitespace-nowrap">Nhân viên văn phòng</span>
            ) : u.co_ktv_lien_he ? (
              <span className="whitespace-nowrap">KTV hiện trường</span>
            ) : (
              <span className="flex items-center gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <span title="Có cờ KTV DVBH/Vệ tinh nhưng chưa mã KTV nào trong danh bạ dùng Gmail này làm Email đăng nhập.">
                  <Badge tone="amber">Chưa thuộc thẻ nào</Badge>
                </span>
                <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => setGanMa(u)}>
                  Gắn mã KTV
                </button>
              </span>
            ),
        }]
      : []),
    {
      key: "co_nghiep_vu", mobile: "meta",
      header: "Cờ nghiệp vụ",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {ROLE_FLAGS.filter((f) => u[f.key]).map((f) => <Badge key={f.key} tone="ocean">{f.label}</Badge>)}
        </div>
      ),
    },
    {
      key: "trang_thai", mobile: "badge",
      header: "Trạng thái",
      render: (u) => (
        <>
          <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : u.trang_thai_duyet === "Cho duyet" ? "amber" : "coral"}>
            {TRANG_THAI_DUYET_LABEL[u.trang_thai_duyet ?? ""] ?? u.trang_thai_duyet}
          </Badge>
          {!!u.bi_khoa && <Badge tone="coral">Đã khoá</Badge>}
        </>
      ),
    },
    {
      key: "actions", mobile: "hide",
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
        {tabValue === "cho-duyet"
          ? 'Tài khoản Gmail đăng nhập lần đầu, chưa xác định thuộc nhóm nào - Admin tự quyết định: tick cờ KTV DVBH/Vệ tinh (đẩy sang thẻ "KTV hiện trường") hoặc tick cờ/vai trò nhân viên văn phòng (đẩy sang thẻ "Nhân viên văn phòng") rồi bấm Duyệt.'
          : 'Toàn bộ tài khoản đã được xử lý duyệt (gồm cả tài khoản bị từ chối/khoá). Tài khoản "Chưa thuộc thẻ nào" có cờ KTV DVBH/Vệ tinh nhưng chưa có trong danh bạ KTV nên không hiện ở thẻ "KTV hiện trường".'}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo email/tên…"
          className="o-tim focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        {tabValue === "da-duyet" && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--ink-600)]">
            <input type="checkbox" checked={chiKhongThuocThe} onChange={(e) => { setChiKhongThuocThe(e.target.checked); setPage(1); }} />
            Chỉ tài khoản chưa thuộc thẻ nào
          </label>
        )}
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
            setEditing(null);
          }}
        />
      )}
      {ganMa && (
        <GanMaKtvModal
          user={ganMa}
          onClose={() => setGanMa(null)}
          onDone={async () => {
            setGanMa(null);
            await qc.invalidateQueries({ queryKey: ["users"] });
            await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
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
  const addToastSua = useToast();
  // Thu hoi moi phien dang nhap cua tai khoan (mat may, nghi lo tai khoan) - backend POST /users/:email/dang-xuat-moi-thiet-bi.
  const dangXuatMoiThietBi = useMutation({
    mutationFn: () => api.post(`/users/${encodeURIComponent(user.email)}/dang-xuat-moi-thiet-bi`),
    onSuccess: () => addToastSua(`Đã đăng xuất ${user.email} trên mọi thiết bị`),
    onError: (err) => addToastSua("Không đăng xuất được: " + (err instanceof ApiError && err.detail ? err.detail : err instanceof Error ? err.message : String(err))),
  });
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
    la_mua_hang: !!user.la_mua_hang,
    la_nv_sua_chua: !!user.la_nv_sua_chua,
    quan_ly_danh_muc_lk: !!user.quan_ly_danh_muc_lk,
    xem_danh_muc_lk: !!user.xem_danh_muc_lk,
    khu_vuc_dat_hang: user.khu_vuc_dat_hang ?? "",
    kho_nhom_lk: (user.kho_nhom_lk ?? "") as "" | NhomLk,
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
        la_mua_hang: form.la_mua_hang,
        la_nv_sua_chua: form.la_nv_sua_chua,
        quan_ly_danh_muc_lk: form.quan_ly_danh_muc_lk,
        xem_danh_muc_lk: form.xem_danh_muc_lk,
        // KTV/Ve tinh: khu vuc lay tu danh ba KTV -> khong gui (giu nguyen).
        ...(form.la_ktv_dvbh || form.la_ve_tinh ? {} : { khu_vuc_dat_hang: form.khu_vuc_dat_hang || null }),
        // Nhom LK Kho xu ly thieu hang (2026-10-16, migration 0088) - bo co Kho thi xoa luon.
        kho_nhom_lk: form.la_kho ? form.kho_nhom_lk || null : null,
      }),
    onSuccess: onSaved,
  });

  // Khu vuc phu trach (them 2026-08-26) - TN/Kho/Ke toan: bang user_khu_vuc, nhieu-nhieu, duoc phep
  // chong cheo, CHI phuc vu tim kiem/thong ke/badge - xem GET/PUT /api/users/:email/khu-vuc. View
  // (them sau, xac nhan nguoi dung "view thấy theo khu vực được set"): CUNG bang nay nhung Khu vuc o
  // day THAT SU gioi han du lieu View thay duoc (xem khuVucViewEmailInSql() trong scopeDatMua.ts) -
  // chua gan Khu vuc nao = View khong thay don nao ca. GS gan khu vuc qua khu_vuc.gs_email (Settings >
  // Khu vực), o day chi hien READ-ONLY.
  const isGiamSat = form.vai_tro === "Giam sat";
  // GS (2026-11-01): khu vuc tich o day = khu vuc GS PHU trach (user_khu_vuc), quyen nhu GS chinh - xem laGsCuaKhuVuc backend.
  const showKhuVucAssign = form.la_kho || form.la_ke_toan || form.la_tac_nghiep || form.la_view || isGiamSat;
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
        {/* Khu vuc dat hang (2026-09-30, migration 0055) - moi tai khoan KHONG phai KTV: don/PXK nguoi nay tao hoac
            nhan hang (khi nguoi nhan khong phai KTV) thuoc khu vuc nay, THANG khu vuc GS dang phu trach. Doi = tinh lai
            khu vuc cua ca don/PXK cu (trigger). */}
        {!(form.la_ktv_dvbh || form.la_ve_tinh) && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
              Khu vực đặt hàng
              <Tooltip text="Đơn/phiếu xuất người này đặt hoặc nhận hàng được xếp vào khu vực này (ưu tiên hơn khu vực đang phụ trách). Đổi khu vực sẽ cập nhật lại cả đơn/phiếu cũ. Để trống: theo khu vực phụ trách, không có thì 'Chưa có khu vực'." />
            </label>
            <Select
              value={form.khu_vuc_dat_hang}
              onChange={(v) => setForm({ ...form, khu_vuc_dat_hang: v })}
              options={[
                { value: "", label: "— Không chọn —" },
                ...khuVucRows
                  .filter((k) => k.ma !== "CHUA_CO" && (k.bat_tat || k.ma === form.khu_vuc_dat_hang))
                  .map((k) => ({ value: k.ma, label: k.ten })),
              ]}
            />
          </div>
        )}
        {/* Nhom LK Kho xu ly thieu hang (2026-10-16, migration 0088, backend lib/nhomLk.ts): Kho THUAN chi thay / dem viec /
            nhan thong bao ticket thieu hang cua LK thuoc nhom duoc chon. Kiem TN/Ke toan/Admin thi khong loc. */}
        {form.la_kho && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
              Xử lý thiếu hàng cho nhóm LK
              <Tooltip text="Kho chỉ thấy danh sách thiếu hàng, số việc cần làm và thông báo ticket mới của linh kiện thuộc nhóm được chọn. Để 'Cả hai nhóm' = thấy toàn bộ như trước." />
            </label>
            <Select
              value={form.kho_nhom_lk}
              onChange={(v) => setForm({ ...form, kho_nhom_lk: v as "" | NhomLk })}
              options={[{ value: "", label: "Cả hai nhóm" }, ...NHOM_LK_LIST.map((v) => ({ value: v, label: `Chỉ ${NHOM_LK_LABEL[v]}` }))]}
            />
            {form.kho_nhom_lk && (form.la_tac_nghiep || form.la_ke_toan || form.vai_tro === "Admin") && (
              <div className="mt-1 text-[11px] text-[var(--color-warning-strong)]">
                Tài khoản này kiêm Tác nghiệp / Kế toán / Admin nên vẫn thấy cả hai nhóm — lựa chọn chỉ có tác dụng với tài khoản chỉ làm Kho.
              </div>
            )}
          </div>
        )}
        {showKhuVucAssign && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
              {isGiamSat ? "Khu vực phụ trách (Giám sát KTV)" : "Khu vực phụ trách"}
              <Tooltip
                text={
                  isGiamSat
                    ? "Giám sát phụ trách TẤT CẢ KTV thuộc các khu vực được tích: xem, đặt hàng hộ, hủy hộ, duyệt đơn vượt trần (mã EO), xác nhận chuyển tiền hộ — như Giám sát chính. Khu vực đã có GS chính vẫn tích thêm được (thành GS phụ). GS chính của khu vực đổi ở Cài đặt › Khu vực."
                    : form.la_view
                    ? "Với vai trò View: đây là phạm vi dữ liệu THẬT SỰ được xem (đơn / phiếu / công nợ / quỹ thuộc các khu vực này). Không chọn khu vực nào = xem TẤT CẢ khu vực."
                    : "Chỉ để tìm kiếm/thống kê/badge - KHÔNG giới hạn quyền xem/xử lý đơn. Có thể chọn nhiều khu vực, cho phép chồng chéo với người khác."
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {khuVucRows.filter((k) => k.bat_tat).map((k) => {
                // GS (2026-11-01): khu vuc ma chinh nguoi nay la GS chinh -> luon tich, khoa (doi o Cai dat › Khu vuc);
                // khu vuc khac -> tich = GS phu. Hien ten GS chinh dang co cua khu vuc de Admin biet.
                const laChinh = isGiamSat && k.gs_email === user.email;
                const gsChinhKhac = isGiamSat && !laChinh && k.gs_email ? k.gs_ten || k.gs_email : null;
                return (
                  <label key={k.ma} className="flex items-start gap-2" title={gsChinhKhac ? `GS chính: ${gsChinhKhac}` : undefined}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={laChinh || effectiveKhuVuc.has(k.ma)}
                      disabled={laChinh}
                      onChange={(e) => {
                        const next = new Set(effectiveKhuVuc);
                        if (e.target.checked) next.add(k.ma);
                        else next.delete(k.ma);
                        setKhuVucSelected(next);
                      }}
                    />
                    <span className="min-w-0">
                      {k.ten}
                      {laChinh && <span className="ml-1"><Badge tone="ocean">GS chính</Badge></span>}
                      {!laChinh && isGiamSat && effectiveKhuVuc.has(k.ma) && <span className="ml-1"><Badge tone="teal">GS phụ</Badge></span>}
                      {gsChinhKhac && <span className="block text-[10px] text-[var(--ink-400)] truncate">GS chính: {gsChinhKhac}</span>}
                    </span>
                  </label>
                );
              })}
              {/* Chon/bo nhanh MOI khu vuc dang bat (2026-09-30) - chi la chon hang loat, khu vuc them sau KHONG tu cong vao */}
              {(() => {
                const dangBat = khuVucRows.filter((k) => k.bat_tat);
                const tatCa = dangBat.length > 0 && dangBat.every((k) => effectiveKhuVuc.has(k.ma));
                return (
                  <label className="flex items-center gap-2 font-semibold text-[var(--color-primary)]">
                    <input
                      type="checkbox"
                      checked={tatCa}
                      disabled={dangBat.length === 0}
                      onChange={(e) => setKhuVucSelected(e.target.checked ? new Set(dangBat.map((k) => k.ma)) : new Set())}
                    />
                    Tất cả khu vực
                  </label>
                );
              })()}
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
        {/* Ma/Ten MISA (2026-10-19, "2 cái này bản chất là 1"): nguon DUY NHAT la ma KTV (ktv_lien_he) - file MISA, ton kho, cong no,
            chan dat hang deu doc tu do. Form tai khoan chi HIEN (doc tu ma KTV gan Gmail), sua o the "KTV hiện trường" hoac "Mã nhận
            hàng" (tai khoan van phong chua co ma). Cot users.ma_misa/ten_misa cu giu nguyen, khong con dung. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã tài khoản MISA</label>
            <div className="w-full border border-[var(--line)] bg-[var(--surface-100)] rounded-lg px-2.5 py-1.5 text-sm mt-1 text-[var(--ink-600)]">
              {user.ktv_ma_misa?.trim() || "— (chưa có)"}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên trên MISA</label>
            <div className="w-full border border-[var(--line)] bg-[var(--surface-100)] rounded-lg px-2.5 py-1.5 text-sm mt-1 text-[var(--ink-600)] truncate" title={user.ktv_ten_misa ?? ""}>
              {user.ktv_ten_misa?.trim() || "— (chưa có)"}
            </div>
          </div>
          <div className="col-span-2 text-[11px] text-[var(--ink-400)] -mt-2">
            {user.ma_ktv_gan
              ? `Lấy từ mã KTV ${user.ma_ktv_gan.split(",").join(", ")} — sửa ở thẻ "KTV hiện trường".`
              : `Tài khoản chưa có mã KTV — tạo "Mã nhận hàng" ở thẻ "Nhân viên văn phòng" để khai Mã MISA.`}
          </div>
        </div>
        <MaNhanSuField email={user.email} value={user.ma_nhan_su} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.bi_khoa} onChange={(e) => setForm({ ...form, bi_khoa: e.target.checked })} />
          Khoá tài khoản
        </label>
        {!isSelf && (
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-secondary)]">
            <span>Mất máy / lộ tài khoản: buộc đăng nhập lại trên mọi thiết bị.</span>
            <Btn
              variant="ghost"
              size="sm"
              loading={dangXuatMoiThietBi.isPending}
              onClick={() => {
                if (window.confirm(`Đăng xuất ${user.email} trên MỌI thiết bị?`)) dangXuatMoiThietBi.mutate();
              }}
            >
              Đăng xuất mọi thiết bị
            </Btn>
          </div>
        )}
        <LichSuQuyen email={user.email} />
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
// "Mã nhận hàng" cho tai khoan VAN PHONG (2026-10-14, phan hoi "vai trò đó vẫn là gs, thêm trực tiếp ở mục quản lý nhân viên văn
// phòng"): TN dat ho cho GS bi NGUOI_NHAN_HANG_KHONG_HOP_LE vi nguoi nhan phai la KTV hoac Gmail gan 1 ma KTV. Tao ma moi (POST
// /settings/ktv-lien-he/tao-cho-van-phong - khong bat co KTV, tai khoan o lai the nay) hoac chon ma co san (GanMaKtvModal), go lien
// ket = PATCH email_dang_nhap null.
function MaNhanHangVanPhongModal({ user, khuVucRows, onClose, onDone }: { user: UserRow; khuVucRows: KhuVucRow[]; onClose: () => void; onDone: () => void }) {
  const addToast = useToast();
  const maGan = (user.ma_ktv_gan ?? "").split(",").filter(Boolean);
  const khuVucMacDinh = user.khu_vuc_dat_hang || khuVucRows.find((k) => k.gs_email === user.email)?.ma || "";
  const [form, setForm] = useState({
    // Co Ma MISA thi goi y ma = Ma MISA (cung quy uoc migration 0085 cho GS) + ten = Ten MISA.
    ma_ktv: user.ma_misa?.trim().toUpperCase() || user.email.split("@")[0],
    ten_hien_thi: user.ten_misa?.trim() || user.ten || "",
    khu_vuc_ma: khuVucMacDinh,
    ma_misa: user.ma_misa ?? "",
    ten_misa: user.ten_misa ?? "",
  });
  const [loi, setLoi] = useState("");
  const [chonCoSan, setChonCoSan] = useState(false);
  const loiApi = (err: unknown) => (err instanceof ApiError ? err.detail || err.code || err.message : String(err));
  const tao = useMutation({
    mutationFn: () => api.post<{ ok: true; ma_ktv: string }>("/settings/ktv-lien-he/tao-cho-van-phong", { email: user.email, ...form }),
    onSuccess: (r) => {
      addToast(`Đã tạo mã ${r.ma_ktv} cho ${user.email} — TN/GS đặt hộ được cho người này`);
      onDone();
    },
    onError: (err) => setLoi(loiApi(err)),
  });
  const go = useMutation({
    mutationFn: (ma: string) => api.patch(`/settings/ktv-lien-he/${encodeURIComponent(ma)}/dat-mua-lk`, { email_dang_nhap: null }),
    onSuccess: (_r, ma) => {
      addToast(`Đã gỡ mã ${ma} khỏi ${user.email}`);
      onDone();
    },
    onError: (err) => setLoi(loiApi(err)),
  });
  if (chonCoSan) return <GanMaKtvModal user={user} vanPhong onClose={() => setChonCoSan(false)} onDone={onDone} />;
  const thieu = !form.ma_ktv.trim() || !form.khu_vuc_ma || !form.ma_misa.trim();
  const o = (key: keyof typeof form, label: string, batBuoc = false, placeholder = "") => (
    <label className="block">
      <span className="block text-xs font-semibold text-[var(--ink-600)] mb-1">
        {label}
        {batBuoc && " *"}
      </span>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setLoi("");
        }}
        className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
    </label>
  );
  return (
    <Modal open onClose={onClose} title={`Mã nhận hàng — ${user.email}`} width="max-w-xl">
      <div className="space-y-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">
          Người nhận hàng khi TN/GS đặt hộ phải có mã KTV. Mã này chỉ dùng để nhận hàng — vai trò ({user.vai_tro ?? "—"}) và cờ văn phòng giữ
          nguyên, tài khoản vẫn ở thẻ "Nhân viên văn phòng". Đơn người này nhận tính theo Khu vực của mã.
        </div>
        {maGan.length > 0 ? (
          <div className="space-y-2">
            {maGan.map((ma) => (
              <div key={ma} className="flex items-center justify-between gap-2 border border-[var(--line)] rounded-lg px-3 py-2">
                <span>
                  Đang gắn mã <span className="font-mono font-semibold">{ma}</span>
                </span>
                <Btn
                  size="sm"
                  variant="ghost"
                  loading={go.isPending && go.variables === ma}
                  disabled={go.isPending}
                  onClick={() => {
                    if (window.confirm(`Gỡ mã ${ma} khỏi ${user.email}?\n\nSau khi gỡ, TN/GS không đặt hộ cho người này được nữa. Mã vẫn còn trong danh bạ KTV.`)) go.mutate(ma);
                  }}
                >
                  Gỡ mã
                </Btn>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {o("ma_ktv", "Mã KTV", true)}
              {o("ten_hien_thi", "Tên hiển thị", false, user.email)}
              <label className="block">
                <span className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Khu vực *</span>
                <Select
                  value={form.khu_vuc_ma}
                  onChange={(v) => {
                    setForm({ ...form, khu_vuc_ma: v });
                    setLoi("");
                  }}
                  options={[
                    { value: "", label: "— Chọn khu vực —" },
                    ...khuVucRows.filter((k) => k.ma !== "CHUA_CO" && (k.bat_tat || k.ma === form.khu_vuc_ma)).map((k) => ({ value: k.ma, label: k.ten })),
                  ]}
                />
              </label>
              {o("ma_misa", "Mã MISA", true)}
              {o("ten_misa", "Tên trên MISA")}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setChonCoSan(true)}>
                Chọn mã có sẵn…
              </Btn>
              <Btn variant="primary" size="sm" loading={tao.isPending} disabled={thieu || tao.isPending} onClick={() => tao.mutate()}>
                Tạo mã nhận hàng
              </Btn>
            </div>
          </>
        )}
        {loi && <div className="text-xs font-semibold text-[var(--coral-700)]">{loi}</div>}
        <div className="flex justify-end">
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

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
  // SUA 2026-10-01: chuyen xong MO NGAY buoc "Gắn mã KTV" (truoc chi bao toast -> de quen, tai khoan lo lung "Chưa thuộc thẻ nào").
  const [ganMa, setGanMa] = useState<UserRow | null>(null);
  const [maNhanHang, setMaNhanHang] = useState<UserRow | null>(null);
  const chuyenSangKtv = useMutation({
    mutationFn: (u: UserRow) => api.post(`/users/${encodeURIComponent(u.email)}/chuyen-nhom-vai-tro`, { to: "ktv" }),
    onSuccess: async (_r, u) => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      addToast("Đã chuyển sang nhóm KTV — chọn mã KTV của người này để hoàn tất");
      setGanMa(u);
    },
  });

  const columns: Column<UserRow>[] = [
    { key: "nguoi_dung", mobile: "title", header: "Người dùng", render: (u) => formatPersonDisplay(u.email, personDir) },
    // Ma nhan su NS-xxxx (2026-10-22, migration 0096).
    { key: "ma_nhan_su", mobile: "meta", header: "Mã nhân sự", render: (u) => (u.ma_nhan_su ? <span className="font-mono text-xs">{u.ma_nhan_su}</span> : "—") },
    { key: "vai_tro", mobile: "meta", header: "Vai trò", render: (u) => u.vai_tro ?? "—" },
    {
      key: "khu_vuc_dat_hang", mobile: "meta", header: "Khu vực đặt hàng",
      render: (u) => (u.khu_vuc_dat_hang ? khuVucData?.rows.find((k) => k.ma === u.khu_vuc_dat_hang)?.ten ?? u.khu_vuc_dat_hang : "—"),
    },
    {
      // Khu vuc gan qua user_khu_vuc (2026-10-02): GS = khu vuc xem them, View = pham vi xem, TN/Kho/Ke toan = loc mac dinh.
      key: "khu_vuc_gan", mobile: "meta", header: "Khu vực được xem",
      render: (u) => {
        const ds = (u.khu_vuc_gan ?? "").split(",").filter(Boolean);
        if (ds.length === 0) return "—";
        const ten = ds.map((ma) => khuVucData?.rows.find((k) => k.ma === ma)?.ten ?? ma);
        return <span title={ten.join(", ")}>{ten.length > 3 ? `${ten.slice(0, 3).join(", ")} +${ten.length - 3}` : ten.join(", ")}</span>;
      },
    },
    {
      // Nhom LK Kho xu ly thieu hang (2026-10-16, migration 0088) - chi co y nghia voi tai khoan Kho.
      key: "kho_nhom_lk", mobile: "meta", header: "Kho xử lý nhóm LK",
      render: (u) => (!u.la_kho ? "—" : u.kho_nhom_lk === "karofi" || u.kho_nhom_lk === "b2b" ? NHOM_LK_LABEL[u.kho_nhom_lk] : "Cả hai nhóm"),
    },
    // Ma/Ten MISA lay tu ma KTV gan tai khoan (2026-10-19 gop ve 1 nguon).
    { key: "ma_misa", header: "Mã MISA", render: (u) => u.ktv_ma_misa ?? "—" },
    { key: "ten_misa", header: "Tên trên MISA", render: (u) => u.ktv_ten_misa ?? "—" },
    {
      key: "ma_ktv_gan", mobile: "meta", header: "Mã nhận hàng",
      // Co Ma MISA ma chua co ma nhan hang (2026-10-16): ton kho/cong no MISA cua nguoi nay KHONG khop duoc (import khop theo ma KTV).
      render: (u) =>
        u.ma_ktv_gan ? (
          <span className="font-mono text-xs">{u.ma_ktv_gan.split(",").join(", ")}</span>
        ) : u.ma_misa?.trim() ? (
          <span className="text-xs text-[var(--color-warning)]" title="Có Mã MISA nhưng chưa có mã nhận hàng — tồn kho/công nợ trên file MISA của người này chưa được quản lý. Bấm Mã nhận hàng để tạo.">
            ⚠ Chưa có — tồn kho chưa quản lý
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "co_nghiep_vu", mobile: "meta",
      header: "Cờ nghiệp vụ",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {ROLE_FLAGS.filter((f) => u[f.key]).map((f) => <Badge key={f.key} tone="ocean">{f.label}</Badge>)}
        </div>
      ),
    },
    {
      key: "trang_thai", mobile: "badge",
      header: "Trạng thái",
      render: (u) => (
        <>
          <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : "amber"}>{TRANG_THAI_DUYET_LABEL[u.trang_thai_duyet ?? ""] ?? u.trang_thai_duyet}</Badge>
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
          <button className="text-[var(--ocean-600)] hover:underline text-xs whitespace-nowrap" onClick={() => setMaNhanHang(u)}>
            Mã nhận hàng
          </button>
          <button
            className="text-[var(--violet-600)] hover:underline text-xs"
            onClick={() => {
              if (
                window.confirm(
                  `Chuyển tài khoản "${u.email}" sang nhóm KTV hiện trường?\n\nSẽ tắt toàn bộ cờ văn phòng (Kho/Kế toán/TN/TP DVBH/View) và bật cờ KTV DVBH. Bước tiếp theo: chọn mã KTV của người này để gắn Gmail (chưa có mã thì tạo ở thẻ "KTV hiện trường").`,
                )
              ) {
                chuyenSangKtv.mutate(u);
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
          className="o-tim focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-full sm:w-64"
        />
        <Select
          value={vaiTro}
          onChange={(v) => { setVaiTro(v); setPage(1); }}
          options={[{ value: "", label: "— Mọi vai trò —" }, { value: "Admin", label: "Admin" }, { value: "QC", label: "QC" }, { value: "Giam sat", label: "Giám sát" }]}
          className="min-w-0 flex-1 sm:flex-none sm:w-40"
        />
        <Select
          value={khuVuc}
          onChange={(v) => { setKhuVuc(v); setPage(1); }}
          options={[{ value: "", label: "— Mọi khu vực —" }, ...(khuVucData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten }))]}
          className="min-w-0 flex-1 sm:flex-none sm:w-44"
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
      {ganMa && (
        <GanMaKtvModal
          user={ganMa}
          onClose={() => setGanMa(null)}
          onDone={async () => {
            setGanMa(null);
            await qc.invalidateQueries({ queryKey: ["users"] });
            await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
          }}
        />
      )}
      {maNhanHang && (
        <MaNhanHangVanPhongModal
          user={maNhanHang}
          khuVucRows={khuVucData?.rows ?? []}
          onClose={() => setMaNhanHang(null)}
          onDone={async () => {
            setMaNhanHang(null);
            await qc.invalidateQueries({ queryKey: ["users"] });
            await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
            await qc.invalidateQueries({ queryKey: ["nguoi-directory"] });
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
// "tn" (2026-09-30, "cho phép tn sửa mã misa + tên misa của ktv"): nhu "ke-toan" nhung CHI sua Ma/Ten MISA (cong no/
// han muc disabled, backend cung bo qua), khong co nut Import.
export type KtvTabMode = "admin" | "ke-toan" | "tn" | "readonly";

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

// Doi ma KTV / sua ten (2026-10-08, POST /settings/ktv-lien-he/:ma/doi-ma, chi Admin) - ma tu tao tu ETX (= Ma NV) can doi sang ma
// dung. Ma moi chua co -> doi ten ma; ma moi DA co trong danh ba -> server tra CAN_XAC_NHAN_GOP, hoi lai roi gop. Ma cu bi XOA HAN.
// GMAIL DANG NHAP PHU (chot 2026-10-19, v1.367, migration 0091) - KTV co nhieu Gmail hay dang nhap nham: Admin gan Gmail con
// lai lam Gmail phu, dang nhap bang Gmail phu = vao dung tai khoan nay (cung don, quy, thong bao).
const GMAIL_PHU_LOI: Record<string, string> = {
  EMAIL_KHONG_HOP_LE: "Gmail không hợp lệ",
  TRUNG_EMAIL_CHINH: "Trùng Email đăng nhập chính",
  DA_LA_GMAIL_PHU: "Gmail này đã là Gmail phụ của tài khoản khác",
  LA_EMAIL_CHINH_CO_GMAIL_PHU: "Gmail này đang là tài khoản chính có Gmail phụ khác",
  LA_EMAIL_DANG_NHAP_KTV: "Gmail này đang là Email đăng nhập của 1 mã KTV đang bật — tắt mã đó hoặc gỡ Email đăng nhập trước",
  GMAIL_PHU_DA_CO_DU_LIEU: "Gmail này đã có đơn / phiếu xuất / quỹ riêng — chưa hỗ trợ gộp dữ liệu",
  CHUA_CO_TAI_KHOAN: "Mã KTV chưa có Email đăng nhập / tài khoản — lưu Email đăng nhập trước",
};

// MÃ NHÂN SỰ (2026-10-22, backend lib/maNhanSu.ts + PATCH /users/:email/ma-nhan-su) - "tất cả các danh sách người dùng ktv, văn phòng đều
// có thêm cột mã nhân sự ... mã nhân sự là mã dạng NS-xxxx". Luu theo TAI KHOAN (Gmail); tu dien tu danh ba ETX khi tao/duyet tai khoan.
// O nhap + nut Luu rieng (khong gop vao nut Luu cua form) - dung chung form tai khoan van phong lan form KTV (theo Email dang nhap).
function MaNhanSuField({ email, value, onSaved }: { email: string | null | undefined; value: string | null | undefined; onSaved?: () => void }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const [daLuu, setDaLuu] = useState<string | null>(value ?? null); // gia tri dang luu (form mo tu ban chup cu cua dong)
  const [ma, setMa] = useState(value ?? "");
  useEffect(() => { setMa(value ?? ""); setDaLuu(value ?? null); }, [value]);
  const luu = useMutation({
    mutationFn: () => api.patch<{ ma_nhan_su: string | null }>(`/users/${encodeURIComponent(email ?? "")}/ma-nhan-su`, { ma_nhan_su: ma.trim() || null }),
    onSuccess: (r) => {
      addToast(r.ma_nhan_su ? `Đã lưu mã nhân sự ${r.ma_nhan_su}` : "Đã xoá mã nhân sự");
      setDaLuu(r.ma_nhan_su);
      setMa(r.ma_nhan_su ?? "");
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["settings-ktv"] });
      onSaved?.();
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : null;
      const body = err instanceof ApiError ? (err.body as { email?: string } | undefined) : undefined;
      addToast(
        code === "INVALID_MA_NHAN_SU" ? "Mã nhân sự phải dạng NS-xxxx (vd NS-0123)"
        : code === "MA_NHAN_SU_DA_DUNG" ? `Mã này đã thuộc tài khoản ${body?.email ?? "khác"}`
        : "Không lưu được: " + (err instanceof Error ? err.message : String(err)),
      );
    },
  });
  const doi = (ma.trim().toUpperCase() || null) !== daLuu;
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã nhân sự</label>
      {email ? (
        <div className="mt-1 flex gap-2">
          <input value={ma} onChange={(e) => setMa(e.target.value)} placeholder="NS-xxxx"
            className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm font-mono uppercase" />
          <Btn size="sm" variant="subtle" disabled={!doi} loading={luu.isPending} onClick={() => luu.mutate()}>Lưu mã</Btn>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-[var(--ink-400)]">Chưa có Email đăng nhập — gắn Gmail trước rồi mới điền được mã nhân sự.</div>
      )}
      <div className="mt-0.5 text-[11px] text-[var(--ink-400)]">Tự điền từ danh bạ ETX nhân sự khi tạo / duyệt tài khoản; sửa tay khi cần.</div>
    </div>
  );
}

function GmailPhuSection({ row, onChanged }: { row: KtvLienHeRow; onChanged: () => void }) {
  const addToast = useToast();
  const [ds, setDs] = useState<string[]>(() => (row.gmail_phu ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const [moi, setMoi] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const url = `/settings/ktv-lien-he/${encodeURIComponent(row.ma_ktv)}/gmail-phu`;
  const baoLoi = (err: unknown) => {
    const ma = err instanceof ApiError ? err.code : undefined;
    const chiTiet = err instanceof ApiError ? (err.body as { chi_tiet?: string | null } | undefined)?.chi_tiet : null;
    setLoi(ma && GMAIL_PHU_LOI[ma] ? GMAIL_PHU_LOI[ma] + (chiTiet && ma !== "GMAIL_PHU_DA_CO_DU_LIEU" ? ` (${chiTiet})` : "") : "Không lưu được: " + (err instanceof Error ? err.message : String(err)));
  };
  const them = useMutation({
    mutationFn: (email: string) => api.post(url, { email }),
    onSuccess: (_r, email) => {
      setDs((d) => [...d, email.trim().toLowerCase()]);
      setMoi("");
      setLoi(null);
      addToast("Đã thêm Gmail phụ — đăng nhập bằng Gmail này sẽ vào tài khoản này");
      onChanged();
    },
    onError: baoLoi,
  });
  const go = useMutation({
    mutationFn: (email: string) => api.delete(`${url}?email=${encodeURIComponent(email)}`),
    onSuccess: (_r, email) => {
      setDs((d) => d.filter((x) => x !== email));
      setLoi(null);
      onChanged();
    },
    onError: baoLoi,
  });
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
        Gmail đăng nhập phụ
        <Tooltip text="KTV có nhiều Gmail và hay đăng nhập nhầm: thêm Gmail còn lại vào đây. Đăng nhập Google bằng Gmail phụ sẽ vào ĐÚNG tài khoản này (cùng đơn hàng, phiếu xuất, quỹ, thông báo). Gmail phụ không được có đơn / phiếu riêng." />
      </label>
      {ds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {ds.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--color-surface-soft)] px-2 py-0.5 text-xs">
              {e}
              <button
                type="button"
                className="focus-ring text-[var(--ink-400)] hover:text-[var(--color-danger)]"
                title="Gỡ Gmail phụ"
                disabled={go.isPending}
                onClick={() => {
                  if (confirm(`Gỡ Gmail phụ ${e}?`)) go.mutate(e);
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-2">
        <input
          value={moi}
          placeholder="vd: tenkhac@gmail.com"
          onChange={(e) => setMoi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && moi.trim()) {
              e.preventDefault();
              them.mutate(moi.trim());
            }
          }}
          className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <Btn variant="ghost" size="sm" className="shrink-0" disabled={!moi.trim() || them.isPending} onClick={() => them.mutate(moi.trim())}>
          {them.isPending ? "Đang thêm…" : "+ Thêm"}
        </Btn>
      </div>
      {loi && <div className="mt-1 text-[11px] text-[var(--color-danger-strong)]">{loi}</div>}
    </div>
  );
}

function DoiMaKtvModal({ row, onClose, onDone }: { row: KtvLienHeRow; onClose: () => void; onDone: (maMoi: string) => void }) {
  const [maMoi, setMaMoi] = useState(row.ma_ktv);
  const [ten, setTen] = useState(row.ten_hien_thi ?? "");
  const [gop, setGop] = useState<{ ma: string; thongTin: string } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const doiTen = ten.trim() !== (row.ten_hien_thi ?? "").trim();
  const luu = useMutation({
    mutationFn: (xacNhanGop: boolean) =>
      api.post<{ ok: true; ma_ktv: string }>(`/settings/ktv-lien-he/${encodeURIComponent(row.ma_ktv)}/doi-ma`, {
        ma_moi: maMoi.trim(),
        // Chi gui ten khi nguoi dung sua - gop vao ma co san ma khong sua ten thi giu ten cua ma co san.
        ten_hien_thi: doiTen ? ten.trim() : undefined,
        xac_nhan_gop: xacNhanGop || undefined,
      }),
    onSuccess: (r) => onDone(r.ma_ktv),
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CAN_XAC_NHAN_GOP") {
        setGop({ ma: maMoi.trim(), thongTin: err.detail ?? "" });
        setLoi(null);
        return;
      }
      const ma = err instanceof ApiError ? err.code : undefined;
      setLoi(
        err instanceof ApiError && err.detail
          ? err.detail
          : ma === "KHONG_CO_THAY_DOI"
            ? "Chưa thay đổi mã hoặc tên"
            : ma === "THIEU_MA_MOI"
              ? "Cần nhập mã KTV mới"
              : "Không lưu được: " + (err instanceof Error ? err.message : String(err)),
      );
    },
  });
  const thayDoi = maMoi.trim() !== row.ma_ktv || doiTen;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đổi mã / tên KTV — ${row.ma_ktv}`}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Huỷ</Btn>
          {gop ? (
            <Btn onClick={() => luu.mutate(true)} disabled={luu.isPending}>
              {luu.isPending ? "Đang gộp…" : `Gộp vào mã ${gop.ma}`}
            </Btn>
          ) : (
            <Btn onClick={() => luu.mutate(false)} disabled={!thayDoi || !maMoi.trim() || luu.isPending}>
              {luu.isPending ? "Đang lưu…" : "Lưu"}
            </Btn>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã KTV mới</label>
          <input
            autoFocus
            value={maMoi}
            onChange={(e) => { setMaMoi(e.target.value); setGop(null); setLoi(null); }}
            className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Tên hiển thị</label>
          <input value={ten} onChange={(e) => { setTen(e.target.value); setLoi(null); }} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
        </div>
        {maMoi.trim() !== row.ma_ktv && !gop && (
          <div className="text-xs text-[var(--ink-500)]">
            Mã <b>{row.ma_ktv}</b> sẽ được đổi thành <b>{maMoi.trim() || "…"}</b> — giữ nguyên Gmail đăng nhập, khu vực, MISA, công nợ, tồn kho, liên kết ETX. Đơn
            hàng/phiếu cũ không đổi (lưu theo Gmail). Mã cũ bị xoá khỏi danh bạ; các hệ DVBH/kho vận chỉ nhận cập nhật nên bên đó vẫn còn dòng mã cũ.
          </div>
        )}
        {gop && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-text-body)] space-y-1">
            <div className="font-bold">Mã {gop.ma} đã có trong danh bạ — gộp mã {row.ma_ktv} vào mã này?</div>
            <div>{gop.thongTin}</div>
            <div>
              Mã {gop.ma} nhận Gmail đăng nhập + trạng thái bật/tắt của {row.ma_ktv}; thông tin khác giữ của mã {gop.ma}, ô nào trống thì lấy từ {row.ma_ktv}.
              Tồn kho, liên kết ETX, Vệ tinh, công nợ 0 đồng chuyển sang {gop.ma}. Mã {row.ma_ktv} bị xoá hẳn.
            </div>
          </div>
        )}
        {loi && <div className="text-xs font-medium text-[var(--color-danger)]">{loi}</div>}
      </div>
    </Modal>
  );
}

export function KtvTab({ mode = "admin", initialSearch }: { mode?: KtvTabMode; initialSearch?: { value: string; nonce: number } | null } = {}) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  // Deep link tu vi-pham-app (xem UsersModule() + App.tsx) - dien san o tim kiem theo email/ma_ktv
  // truyen vao. Khoa theo "nonce" (khong phai "value") de trigger lai duoc ngay ca khi gia tri giong
  // het lan truoc (vd Admin bam lai cung 1 nut "Gan lai KTV" lan thu 2 sau khi da tu go xoa o tim kiem).
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch?.nonce]);
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
  // Xac nhan khu vuc khi BO SUNG Ma MISA (2026-10-16, migration 0087) - xem canXacNhanKv.
  const [xacNhanKv, setXacNhanKv] = useState(false);
  const [form, setForm] = useState({
    ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV" as KtvLienHeRow["vai_tro_ktv"], email_dang_nhap: "",
    khu_vuc_ma: "", ktv_cap1_phu_trach: "", cong_no: "", ma_misa: "", ten_misa: "",
    han_muc_du_phong: "", han_muc_du_phong_hien_tai: "", khong_tran: false,
  });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importCongNoOpen, setImportCongNoOpen] = useState(false);
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
        const res = await api.post<BulkImportKtvChunkResult>("/settings/ktv-lien-he/bulk-import", { rows: rows.slice(offset, offset + 25), offset, total: rows.length } /* chi gui lo dang xu ly (2026-10-03) */);
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

  const [doiMa, setDoiMa] = useState<KtvLienHeRow | null>(null);
  // Dang BO SUNG Ma MISA (truoc trong) cho KTV khu vuc chua tung chon tay -> bat buoc xac nhan/chon lai khu vuc (backend
  // kiemTraXacNhanKhuVuc, 409 CAN_XAC_NHAN_KHU_VUC). Tao moi: chua co gi -> cung phai chon khu vuc.
  const canXacNhanKv =
    mode !== "readonly" && !!editing && !!form.ma_misa.trim() &&
    (editing === "new" || (!(editing.ma_misa ?? "").trim() && !editing.khu_vuc_xac_nhan_luc));
  function openEdit(row: KtvLienHeRow | "new") {
    setEditing(row);
    setXacNhanKv(false);
    if (row === "new")
      setForm({
        ma_ktv: "", ten_hien_thi: "", sdt: "", vai_tro_ktv: "KTV", email_dang_nhap: "", khu_vuc_ma: "", ktv_cap1_phu_trach: "", cong_no: "", ma_misa: "", ten_misa: "",
        han_muc_du_phong: "", han_muc_du_phong_hien_tai: "", khong_tran: false,
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
        khong_tran: !!row.khong_tran_cong_no,
      });
  }
  // "Không có trần công nợ" (migration 0117) - Kế toán / TN / Admin, lưu qua PATCH riêng khi giá trị đổi.
  const duocSuaKhongTran = mode === "admin" || mode === "ke-toan" || mode === "tn";
  const luuKhongTran = async () => {
    if (!duocSuaKhongTran || editing === "new" || !editing) return;
    if (!!editing.khong_tran_cong_no === form.khong_tran) return;
    await api.patch(`/settings/ktv-lien-he/${encodeURIComponent(form.ma_ktv)}/khong-tran-cong-no`, { khong_tran: form.khong_tran });
  };

  const onSaveSuccess = async () => {
    addToast("Đã lưu");
    await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
    setEditing(null);
  };
  // detail = thong bao cu the tu backend (vd EMAIL_DA_GAN_MA_KHAC "Gmail này đang là email đăng nhập của mã KTV …").
  const onSaveError = (err: unknown) => addToast(err instanceof ApiError && err.detail ? err.detail : "Không thể lưu, thử lại sau.");

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
        xac_nhan_khu_vuc: canXacNhanKv && xacNhanKv,
      });
      await luuKhongTran();
    },
    onSuccess: onSaveSuccess,
    onError: onSaveError,
  });
  // mode="ke-toan" (them 2026-09-05): CHI goi 1 PATCH rieng voi dung 3 truong duoc uy quyen, khong
  // dung POST tao moi (khong the tao KTV moi tu the nay) va khong dung PATCH /:ma/dat-mua-lk day du.
  // SUA 2026-09-13: them 2 truong Han muc du phong vao cung uy quyen nay (Ke toan cung la nguoi quan
  // ly cac muc tien du tru cho KTV, giong tinh than cong_no/ma_misa/ten_misa da co san).
  const saveKeToan = useMutation({
    mutationFn: async () => {
      await api.patch(`/settings/ktv-lien-he/${encodeURIComponent(form.ma_ktv)}/cong-no-misa`, {
        ma_misa: form.ma_misa.trim() || null,
        ten_misa: form.ten_misa.trim() || null,
        ...(canXacNhanKv ? { khu_vuc_ma: form.khu_vuc_ma || null, xac_nhan_khu_vuc: true } : {}),
        ...(mode === "tn"
          ? {}
          : {
              cong_no: form.cong_no !== "" ? Number(form.cong_no) : null,
              han_muc_du_phong: form.han_muc_du_phong !== "" ? Number(form.han_muc_du_phong) : null,
              han_muc_du_phong_hien_tai: form.han_muc_du_phong_hien_tai !== "" ? Number(form.han_muc_du_phong_hien_tai) : null,
            }),
      });
      await luuKhongTran();
    },
    onSuccess: onSaveSuccess,
    onError: onSaveError,
  });
  const save = mode === "ke-toan" || mode === "tn" ? saveKeToan : saveAdmin;

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

  const batTat = useMutation({
    mutationFn: ({ ma, bat }: { ma: string; bat: boolean }) =>
      api.patch<{ ok: true; ma_khac_dang_bat: string | null }>(`/settings/ktv-lien-he/${encodeURIComponent(ma)}/bat-tat`, { bat }),
    onSuccess: async (res, { ma, bat }) => {
      addToast(
        bat
          ? `Đã bật mã ${ma}`
          : res.ma_khac_dang_bat
            ? `Đã tắt mã ${ma} — Gmail vẫn đăng nhập được vì mã ${res.ma_khac_dang_bat} (cùng Gmail) đang bật`
            : `Đã tắt mã ${ma} — không đăng nhập, không tạo đơn, không chọn làm người nhận hàng được`,
      );
      await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
    },
    onError: (err) => addToast("Không đổi được: " + (err instanceof Error ? err.message : String(err))),
  });

  const khuVucTenByMa = useMemo(() => new Map((khuVucData?.rows ?? []).map((k) => [k.ma, k.ten])), [khuVucData]);
  const tenByMaKtv = useMemo(() => new Map((cap1Data?.rows ?? []).map((r) => [r.ma_ktv, r.ten_hien_thi])), [cap1Data]);

  const columns: Column<KtvLienHeRow>[] = [
    { key: "ma_ktv", mobile: "sub", header: "Mã KTV", render: (r) => <span className="font-mono text-xs">{r.ma_ktv}</span> },
    // Ma nhan su NS-xxxx cua tai khoan (Email dang nhap) - 2026-10-22, migration 0096.
    { key: "ma_nhan_su", mobile: "meta", header: "Mã nhân sự", render: (r) => (r.ma_nhan_su ? <span className="font-mono text-xs">{r.ma_nhan_su}</span> : "—") },
    { key: "ten_hien_thi", mobile: "title", header: "Tên hiển thị", render: (r) => r.ten_hien_thi ?? "—" },
    { key: "sdt", mobile: "sub", header: "SĐT", render: (r) => r.sdt ?? "—" },
    { key: "vai_tro_ktv", mobile: "badge", header: "Vai trò", render: (r) => r.vai_tro_ktv ?? "—" },
    {
      key: "tk_bat_tat", mobile: "meta",
      header: "Tài khoản",
      render: (r) => {
        if (!r.tk_email) return <span className="text-[var(--color-text-faint)]">Chưa có</span>;
        // Bat/tat THEO MA (migration 0060): ma tat rieng (ngung_hoat_dong) hoac ca Gmail bi khoa (tk_bi_khoa).
        const bat = !r.ngung_hoat_dong && !r.tk_bi_khoa;
        return (
          <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} title={r.ma_cung_gmail ? `Gmail dùng chung với mã: ${r.ma_cung_gmail}` : undefined}>
            {mode === "admin" && (
              <ToggleSwitch
                checked={bat}
                onChange={() => {
                  if (batTat.isPending) return;
                  if (bat && !window.confirm(`Tắt mã ${r.ma_ktv} (${r.ten_hien_thi ?? r.email_dang_nhap})?

Mã này sẽ không hiện trong danh sách chọn người nhận hàng. ${
                    r.ma_cung_gmail
                      ? `Gmail ${r.email_dang_nhap} còn dùng cho mã ${r.ma_cung_gmail} — nếu mã đó còn bật thì người này VẪN đăng nhập và nhận hàng qua mã đó.`
                      : "Người này sẽ không đăng nhập được và không tạo đơn được."
                  } Đơn cũ giữ nguyên.`)) return;
                  batTat.mutate({ ma: r.ma_ktv, bat: !bat });
                }}
              />
            )}
            <Badge tone={bat ? "teal" : "coral"}>{bat ? "Đang bật" : "Đã tắt"}</Badge>
          </span>
        );
      },
    },
    {
      key: "khu_vuc", mobile: "meta", header: "Khu vực",
      render: (r) => (
        <span>
          {r.khu_vuc_ma ? khuVucTenByMa.get(r.khu_vuc_ma) ?? r.khu_vuc_ma : "—"}
          {!r.khu_vuc_xac_nhan_luc && <span className="ml-1 text-[11px] text-[var(--color-warning)]" title="Khu vực chưa được chọn tay lần nào (tự gán / trống) — sẽ phải xác nhận khi bổ sung Mã MISA">· chưa xác nhận</span>}
        </span>
      ),
    },
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
      key: "cong_no", mobile: "meta",
      header: "Trần công nợ",
      render: (r) =>
        r.khong_tran_cong_no ? (
          <span title={r.khong_tran_cong_no_luc ? `Bật lúc ${fmtDateTime(r.khong_tran_cong_no_luc)}${r.khong_tran_cong_no_boi ? ` · ${r.khong_tran_cong_no_boi}` : ""}` : undefined}>
            <Badge tone="teal">Không có trần</Badge>
          </span>
        ) : r.cong_no != null ? (
          // FIX (ra soat UI 2026-08-27): tooltip truoc day hien nguyen chuoi gio VN "tho" tu DB, khong
          // qua fmtDateTime - dung quy uoc chung "moi cot thoi gian hien theo gio VN qua helper co san"
          // (xem CLAUDE.md/memory feedback_vn_timezone).
          <span title={r.cong_no_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.cong_no_cap_nhat_luc)}` : undefined}><Money>{fmtVND(r.cong_no)}</Money></span>
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
          <span title={r.han_muc_du_phong_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.han_muc_du_phong_cap_nhat_luc)}` : undefined}><Money>{fmtVND(r.han_muc_du_phong)}</Money></span>
        ) : (
          "—"
        ),
    },
    {
      key: "han_muc_du_phong_hien_tai",
      header: "Hạn mức dự phòng hiện tại",
      render: (r) =>
        r.han_muc_du_phong_hien_tai != null ? (
          <span title={r.han_muc_du_phong_cap_nhat_luc ? `Cập nhật lúc ${fmtDateTime(r.han_muc_du_phong_cap_nhat_luc)}` : undefined}><Money>{fmtVND(r.han_muc_du_phong_hien_tai)}</Money></span>
        ) : (
          "—"
        ),
    },
    { key: "han_muc_du_phong_phat_sinh", header: "Hạn mức dự phòng phát sinh", render: (r) => <Money>{fmtVND(r.han_muc_du_phong_phat_sinh)}</Money> },
    // Tra lai han muc khi ke toan chot phieu TRẢ HÀNG DỮ TRỮ (sau moc) - cong vao "Moc du phong hien tai" (2026-10-26).
    { key: "han_muc_du_phong_tra_hang", header: "Trả hàng dự trữ đã chốt", render: (r) => <Money>{fmtVND(r.han_muc_du_phong_tra_hang ?? 0)}</Money> },
    { key: "moc_du_phong_hien_tai", header: "Mốc dự phòng hiện tại", render: (r) => <Money>{fmtVND(r.moc_du_phong_hien_tai)}</Money> },
    // FIX (ra soat UI 2026-08-27, hang muc #1): bo "(mã) Tên" lap lai truoc email - cot "Tên hiển thị"
    // da o ngay dau bang, khong can nhac lai o cot cuoi (giam ~50% do dai dong tren bang 25+ dong).
    {
      key: "email_dang_nhap",
      header: "Email đăng nhập",
      render: (r) =>
        r.email_dang_nhap ? (
          <span title={r.gmail_phu ? `Gmail đăng nhập phụ: ${r.gmail_phu}` : undefined}>
            {r.email_dang_nhap}
            {r.gmail_phu && <span className="ml-1 text-[11px] text-[var(--ink-400)]">+{r.gmail_phu.split(",").length} Gmail phụ</span>}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "ma_misa", header: "Mã MISA", render: (r) => r.ma_misa ?? "—" },
    { key: "ten_misa", header: "Tên trên MISA", render: (r) => r.ten_misa ?? "—" },
    {
      key: "actions",
      header: "",
      mobileHint: "actions",
      // Mobile: che do khong phai admin chi co 1 nut trung voi bam the (mo cung form) -> bo cho gon the.
      mobile: mode === "admin" ? undefined : ("hide" as const),
      render: (r) => (
        // stopPropagation - dong da co onRowClick (bam dong mo Sua, xem duoi) nen 2 nut nay phai tu
        // chan bubble, khong thi bam "Xoá" se vua xoa vua mo modal Sua dong (da bi xoa) cung luc.
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button className="text-[var(--ocean-600)] hover:underline text-xs" onClick={() => openEdit(r)}>
            {mode === "admin" ? "Sửa" : mode === "ke-toan" ? "Sửa công nợ/MISA" : mode === "tn" ? "Sửa MISA" : "Xem"}
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
        {/* Ke toan (+ Admin): import tran cong no/han muc du phong theo Ma MISA (2026-09-29, ImportCongNoMisaModal). */}
        {(mode === "ke-toan" || mode === "admin") && (
          <Btn variant={mode === "ke-toan" ? "primary" : "ghost"} size="sm" onClick={() => setImportCongNoOpen(true)}>
            📥 Import công nợ / MISA
          </Btn>
        )}
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
          <span className="sm:hidden">⬇ Trang này</span>
          <span className="hidden sm:inline">⬇ Tải danh sách (trang hiện tại)</span>
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => void handleDownloadFullList()} disabled={downloadingFull} loading={downloadingFull}>
          <span className="sm:hidden">⬇ Toàn bộ</span>
          <span className="hidden sm:inline">⬇ Tải toàn bộ danh sách</span>
        </Btn>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo mã/tên/SĐT/email…"
          className="o-tim focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-full sm:w-56"
        />
        <Select value={cap} onChange={(v) => { setCap(v); setPage(1); }} options={[{ value: "", label: "— Mọi cấp —" }, { value: "1", label: "Cấp 1 (KTV/CTV/Trạm)" }, { value: "2", label: "Cấp 2 (Vệ tinh)" }]} className="min-w-0 flex-1 sm:flex-none sm:w-52" />
        <Select value={khuVuc} onChange={(v) => { setKhuVuc(v); setPage(1); }} options={[{ value: "", label: "— Mọi khu vực —" }, ...khuVucOptions]} className="min-w-0 flex-1 sm:flex-none sm:w-44" />
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
          title={editing === "new" ? "Thêm KTV" : mode === "ke-toan" ? "Sửa công nợ / MISA" : mode === "tn" ? "Sửa mã / tên MISA" : mode === "readonly" ? "Chi tiết KTV" : "Sửa KTV"}
          width="max-w-md"
        >
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)]">Mã KTV</label>
              <div className="flex items-center gap-2 mt-1">
                <input value={form.ma_ktv} disabled={editing !== "new" || mode !== "admin"} onChange={(e) => setForm({ ...form, ma_ktv: e.target.value })} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-60" />
                {editing !== "new" && mode === "admin" && (
                  <Btn variant="ghost" size="sm" className="shrink-0" onClick={() => setDoiMa(editing)}>
                    Đổi mã / tên
                  </Btn>
                )}
              </div>
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
                disabled={mode === "readonly" || mode === "tn"}
                value={form.cong_no}
                onChange={(e) => setForm({ ...form, cong_no: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60"
              />
              {editing !== "new" && (
                <label className="flex items-start gap-2 mt-2 text-[12.5px] text-[var(--ink-700)] cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={!duocSuaKhongTran}
                    checked={form.khong_tran}
                    onChange={(e) => setForm({ ...form, khong_tran: e.target.checked })}
                  />
                  <span>
                    KTV không có trần công nợ
                    <span className="block text-[11.5px] text-[var(--ink-400)]">Đơn công nợ của KTV này không xét trần — không phải chờ duyệt vượt trần.</span>
                  </span>
                </label>
              )}
            </div>
            {/* He thong "Han muc du phong KTV" (them 2026-09-13) - mirror dung cap input Tran cong no
                o tren, du dieu kien cho ca mode="admin" (PATCH /:ma/dat-mua-lk) lan "ke-toan" (PATCH
                /:ma/cong-no-misa) vi ca 2 route deu da duoc mo rong nhan 2 truong nay. */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Hạn mức dự phòng
                <Tooltip text="Lấy từ tab &quot;Hạn mức dự trữ&quot; (theo Mã MISA) - không sửa ở đây." />
              </label>
              <input
                type="number"
                disabled
                value={form.han_muc_du_phong}
                onChange={(e) => setForm({ ...form, han_muc_du_phong: e.target.value })}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-400)] flex items-center gap-1.5">
                Hạn mức dự phòng hiện tại
                <Tooltip text="Lấy từ tab &quot;Hạn mức dự trữ&quot; (theo Mã MISA) - không sửa ở đây." />
              </label>
              <input
                type="number"
                disabled
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
            {editing !== "new" && mode === "admin" && editing.email_dang_nhap && (
              <GmailPhuSection key={editing.ma_ktv} row={editing} onChanged={() => qc.invalidateQueries({ queryKey: ["settings-ktv"] })} />
            )}
            {editing !== "new" && mode === "admin" && (
              <MaNhanSuField email={editing.email_dang_nhap} value={editing.ma_nhan_su} />
            )}
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
            {canXacNhanKv && (
              <div className="rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning-soft)] px-3 py-2.5 space-y-2">
                <div className="text-xs font-semibold text-[var(--color-warning)]">
                  ⚠ Khu vực của KTV này chưa được chọn tay lần nào{editing !== "new" && editing?.khu_vuc_ma ? ` (hiện: ${khuVucTenByMa.get(editing.khu_vuc_ma) ?? editing.khu_vuc_ma} — do hệ thống tự gán)` : " (đang trống)"}.
                  Xác nhận hoặc chọn lại khu vực chính xác trước khi lưu Mã MISA.
                </div>
                <Select value={form.khu_vuc_ma} onChange={(v) => setForm({ ...form, khu_vuc_ma: v })} options={[{ value: "", label: "— Chọn khu vực —" }, ...khuVucOptions]} />
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={xacNhanKv} onChange={(e) => setXacNhanKv(e.target.checked)} />
                  Tôi xác nhận đây là khu vực đúng của KTV
                </label>
              </div>
            )}
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
                <Btn size="sm" onClick={() => save.mutate()} disabled={!form.ma_ktv.trim() || save.isPending || (canXacNhanKv && (!xacNhanKv || !form.khu_vuc_ma))} loading={save.isPending}>Lưu</Btn>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ImportCongNoMisaModal open={importCongNoOpen} onClose={() => setImportCongNoOpen(false)} addToast={addToast} />
      {doiMa && (
        <DoiMaKtvModal
          row={doiMa}
          onClose={() => setDoiMa(null)}
          onDone={async (maMoi) => {
            setDoiMa(null);
            setEditing(null);
            addToast(`Đã đổi sang mã ${maMoi}`);
            await qc.invalidateQueries({ queryKey: ["settings-ktv"] });
          }}
        />
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
                    <div key={i}>
                      {d.ma_ktv}: {d.status.startsWith("email_da_gan_ma_khac:") ? `Email đăng nhập đã gắn mã KTV ${d.status.slice(21)} (1 Gmail chỉ 1 mã)` : d.status === "can_xac_nhan_khu_vuc" ? "Khu vực KTV chưa xác nhận — thêm cột Khu vực vào file hoặc sửa tay KTV để xác nhận khu vực khi bổ sung Mã MISA" : d.status}
                    </div>
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
          <table className="tbl w-full">
            <thead>
              <tr className="tbl-head">
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
    { key: "email", mobile: "title", header: "Người dùng", render: (r) => formatPersonDisplay(r.email, personDir) },
    { key: "thoi_gian", mobile: "sub", header: "Thời gian", render: (r) => fmtDateTime(r.thoi_gian) },
    { key: "ip", mobile: "meta", header: "IP", render: (r) => r.ip ?? "—" },
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

// Danh ba "ETX nhan su" (them 2026-09-17, xem CLAUDE.md + backend/src/lib/etxNhanSuSync.ts) - dong bo
// PULL 1 chieu tu he ETX ngoai, Admin-only. Card trang thai dong bo mo phong dung khuon
// DongBoGia88Tab() (SettingsModule.tsx). "Mã KTV" la cot duy nhat Admin sua truc tiep tai day (sua
// inline trong bang, khong can Modal rieng vi chi co 1 truong) - dung de he thong tu khoa/mo khoa tai
// khoan lien ket khi trang_thai_lam_viec doi (xem cascade o backend).
function EtxNhanSuTab() {
  const qc = useQueryClient();
  const addToast = useToast();
  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("");
  const [taiKhoan, setTaiKhoan] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const query = buildQuery({ search: search || undefined, trang_thai: trangThai || undefined, tai_khoan: taiKhoan || undefined, page, pageSize });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["etx-nhan-su", search, trangThai, taiKhoan, page],
    queryFn: () => api.get<Paged<EtxNhanSuRow>>(`/etx-nhan-su${query}`),
  });

  const { data: syncStatus, isLoading: syncLoading } = useQuery({
    queryKey: ["etx-nhan-su-sync-status"],
    queryFn: () => api.get<EtxNhanSuSyncStatus>("/etx-nhan-su/sync-status"),
    refetchInterval: 60_000,
  });
  const runSync = useMutation({
    mutationFn: () => api.post<EtxNhanSuSyncStatus>("/etx-nhan-su/sync/run", {}),
    onSuccess: async (res) => {
      if (res.last_status === "error") addToast(`Đồng bộ lỗi: ${res.last_error}`);
      else addToast(`Đã đồng bộ xong, ${res.changed_count} dòng thay đổi, tự tạo ${res.ktv_tu_tao ?? 0} KTV`);
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su-sync-status"] });
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su"] });
    },
    onError: (err) => addToast("Không thể đồng bộ: " + (err instanceof Error ? err.message : String(err))),
  });

  const saveMaKtv = useMutation({
    mutationFn: ({ maNhanSu, maKtv }: { maNhanSu: string; maKtv: string | null }) =>
      api.patch(`/etx-nhan-su/${encodeURIComponent(maNhanSu)}/ma-ktv`, { ma_ktv: maKtv }),
    onSuccess: async () => {
      addToast("Đã lưu Mã KTV");
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su"] });
    },
    onError: (err) => addToast("Không lưu được: " + (err instanceof Error ? err.message : String(err))),
  });

  const taoTaiKhoan = useMutation({
    mutationFn: (maNhanSu: string) => api.post<{ ma_ktv: string; email: string }>(`/etx-nhan-su/${encodeURIComponent(maNhanSu)}/tao-tai-khoan`, {}),
    onSuccess: async (res) => {
      addToast(`Đã tạo tài khoản ${res.email} (Mã KTV ${res.ma_ktv})`);
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("Không tạo được: " + (TAO_TK_LOI[msg] ?? msg));
    },
  });
  // "⬇ Tải danh sách" (2026-10-22, "thêm nút tải ở danh sách ETX"): MOI dong theo bo loc dang chon (tim / trang thai / tai khoan) - tai
  // lan luot tung trang 200 dong (gioi han pageSize cua GET /etx-nhan-su) roi xuat 1 file Excel.
  const [dangTai, setDangTai] = useState(false);
  async function taiDanhSach() {
    setDangTai(true);
    try {
      const tatCa: EtxNhanSuRow[] = [];
      for (let p = 1; p <= 100; p++) {
        const res = await api.get<Paged<EtxNhanSuRow>>(
          `/etx-nhan-su${buildQuery({ search: search || undefined, trang_thai: trangThai || undefined, tai_khoan: taiKhoan || undefined, page: p, pageSize: 200 })}`,
        );
        tatCa.push(...res.rows);
        if (!res.rows.length || tatCa.length >= res.total) break;
      }
      const quanLy = (v: string | null) => {
        try {
          const a = JSON.parse(v ?? "[]") as { maNhanSu?: string; hoTen?: string; gmail?: string }[];
          return Array.isArray(a) ? a.map((x) => [x.maNhanSu, x.hoTen, x.gmail].filter(Boolean).join(" ")).join("; ") : "";
        } catch {
          return v ?? "";
        }
      };
      await exportRowsToExcel(
        tatCa.map((r) => ({
          ma_nhan_su: r.ma_nhan_su, ho_ten: r.ho_ten, chuc_danh: r.chuc_danh ?? "", ma_chuc_danh: r.ma_chuc_danh ?? "", gmail: r.gmail ?? "",
          trang_thai: r.trang_thai_lam_viec === "on" ? "Đang làm" : "Đã nghỉ",
          tai_khoan: (TK_TRANG_THAI[r.tk_trang_thai] ?? TK_TRANG_THAI.chua_tao).label,
          lada: [r.tai_khoan_lada_ma, r.tai_khoan_lada_ten].filter(Boolean).join(" - "),
          ma_ktv: r.ma_ktv ?? "", lien_ket: r.lien_ket_email ? `${r.lien_ket_email}${r.lien_ket_bi_khoa ? " (đã khoá)" : ""}` : "",
          quan_ly: quanLy(r.quan_ly_truc_tiep), cap_nhat: r.updated_at,
        })),
        "etx-nhan-su.xlsx", "ETX nhân sự",
        { ma_nhan_su: "Mã NV", ho_ten: "Họ tên", chuc_danh: "Chức danh", ma_chuc_danh: "Mã chức danh", gmail: "Gmail", trang_thai: "Trạng thái",
          tai_khoan: "Tài khoản đặt hàng", lada: "Tài khoản Lada", ma_ktv: "Mã KTV", lien_ket: "Tài khoản liên kết",
          quan_ly: "Quản lý trực tiếp", cap_nhat: "Cập nhật lúc" },
      );
      addToast(`Đã tải ${tatCa.length} nhân sự`);
    } catch (err) {
      addToast("Không tải được: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDangTai(false);
    }
  }

  const xacNhanTao = (r: EtxNhanSuRow) => {
    if (
      window.confirm(
        `Tạo tài khoản đặt hàng cho ${r.ho_ten} (${r.ma_nhan_su})?

` +
          `- Đăng nhập bằng: ${r.gmail}
- Thêm vào danh bạ KTV với mã ${r.ma_nhan_su} (chưa có khu vực — gán sau ở thẻ "KTV hiện trường")
- Kích hoạt tài khoản ngay` +
          (r.trang_thai_lam_viec === "on" ? "" : `

⚠ Nhân sự này đang "Đã nghỉ" trên ETX — tài khoản vẫn được mở. Nếu ETX chuyển lại "Đang làm" rồi "Đã nghỉ", tài khoản sẽ tự khoá.`),
      )
    )
      taoTaiKhoan.mutate(r.ma_nhan_su);
  };

  const columns: Column<EtxNhanSuRow>[] = [
    { key: "ma_nhan_su", mobile: "sub", header: "Mã NV", render: (r) => r.ma_nhan_su },
    { key: "ho_ten", mobile: "title", header: "Họ tên", render: (r) => r.ho_ten },
    { key: "chuc_danh", mobile: "sub", header: "Chức danh", render: (r) => r.chuc_danh ?? "—" },
    {
      key: "trang_thai_lam_viec", mobile: "badge",
      header: "Trạng thái",
      render: (r) => (r.trang_thai_lam_viec === "on" ? <Badge tone="teal">Đang làm</Badge> : <Badge tone="coral">Đã nghỉ</Badge>),
    },
    {
      key: "tk_trang_thai", mobile: "meta",
      header: "Tài khoản đặt hàng",
      render: (r) => {
        const tt = TK_TRANG_THAI[r.tk_trang_thai] ?? TK_TRANG_THAI.chua_tao;
        const coNut = ["chua_tao", "cho_duyet", "tu_choi"].includes(r.tk_trang_thai); // ca nhan su "Đã nghỉ" (2026-10-15)
        return (
          <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Badge tone={tt.tone}>{tt.label}</Badge>
            {coNut && (
              <Btn size="sm" variant="subtle" onClick={() => xacNhanTao(r)} loading={taoTaiKhoan.isPending && taoTaiKhoan.variables === r.ma_nhan_su}>
                Tạo tài khoản
              </Btn>
            )}
          </span>
        );
      },
    },
    { key: "gmail", header: "Gmail", render: (r) => r.gmail ?? "—" },
    { key: "tai_khoan_lada_ten", header: "Tài khoản Lada", render: (r) => r.tai_khoan_lada_ten ?? "—" },
    {
      key: "ma_ktv", mobile: "meta",
      header: "Mã KTV",
      render: (r) => <MaKtvCell row={r} onSave={(maKtv) => saveMaKtv.mutate({ maNhanSu: r.ma_nhan_su, maKtv })} />,
    },
    {
      key: "lien_ket", mobile: "meta",
      header: "Tài khoản liên kết",
      render: (r) =>
        r.lien_ket_email ? (
          <span className="flex items-center gap-1.5">
            {r.lien_ket_email}
            {r.lien_ket_bi_khoa ? <Badge tone="coral">Đã khoá</Badge> : <Badge tone="teal">Đang mở</Badge>}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-4">
        <div className="text-xs text-[var(--ink-500)]">
          Kéo danh bạ nhân sự từ hệ ETX về. Cột "Tài khoản đặt hàng" cho biết nhân sự đã có tài khoản trên app chưa — bấm "Tạo tài khoản" để tạo thủ công. Gán
          "Mã KTV" để liên kết với danh sách "KTV hiện trường" — khi trạng thái làm việc chuyển
          ON/OFF, tài khoản liên kết tự động mở/khoá. Tự động chạy 1 lần/7 ngày, hoặc bấm "Đồng bộ
          ngay" khi cần gấp.
        </div>
        <div className="border border-[var(--line)] rounded-xl bg-[var(--surface)] p-4">
          {syncLoading ? (
            <div className="text-sm text-[var(--ink-400)]">Đang tải…</div>
          ) : (
            <>
              <KvRow label="Lần đồng bộ gần nhất">{syncStatus?.last_run_at ? fmtDateTime(syncStatus.last_run_at) : "— (chưa từng)"}</KvRow>
              <KvRow label="Trạng thái">
                {syncStatus?.last_status === "error" ? <Badge tone="coral">Lỗi</Badge> : syncStatus?.last_status === "ok" ? <Badge tone="teal">OK</Badge> : "—"}
              </KvRow>
              <KvRow label="Số dòng thay đổi lần gần nhất">{syncStatus?.changed_count ?? 0}</KvRow>
              <KvRow label="KTV tự tạo lần gần nhất">
                {syncStatus?.ktv_tu_tao ?? 0}
                {(syncStatus?.tk_tu_duyet ?? 0) > 0 && <span className="text-[var(--ink-400)]"> (trong đó {syncStatus?.tk_tu_duyet} tài khoản đang chờ duyệt được duyệt luôn)</span>}
              </KvRow>
              <div className="text-[11px] text-[var(--ink-400)] mb-1">
                Mỗi lần đồng bộ: nhân sự đang làm việc, chức danh có CTV / KTV / Kỹ thuật viên, có Gmail và chưa có trong danh bạ KTV sẽ được tự tạo
                KTV (mã = Mã NV, tên "(Mã NV) Chức danh - Họ tên", chưa có khu vực) và kích hoạt tài khoản ngay.
              </div>
              {syncStatus?.last_status === "error" && syncStatus.last_error && (
                <KvRow label="Chi tiết lỗi"><span className="text-[var(--coral-600)]">{syncStatus.last_error}</span></KvRow>
              )}
              <div className="mt-3">
                <Btn size="sm" onClick={() => runSync.mutate()} loading={runSync.isPending}>
                  🔄 Đồng bộ ngay
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo mã NV/tên/gmail/Mã KTV…"
          className="o-tim focus-ring w-full max-w-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <Select
          value={trangThai}
          onChange={(v) => { setTrangThai(v); setPage(1); }}
          options={[{ value: "", label: "Tất cả trạng thái" }, { value: "on", label: "Đang làm" }, { value: "off", label: "Đã nghỉ" }]}
        />
        <Select
          value={taiKhoan}
          onChange={(v) => { setTaiKhoan(v); setPage(1); }}
          options={[{ value: "", label: "Tài khoản: Tất cả" }, ...Object.entries(TK_TRANG_THAI).map(([value, t]) => ({ value, label: t.label }))]}
        />
        <Btn variant="ghost" className="sm:ml-auto" onClick={() => void taiDanhSach()} loading={dangTai} disabled={!data?.total}>
          ⬇ Tải danh sách{data?.total ? ` (${data.total})` : ""}
        </Btn>
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
        rowKey={(r) => r.ma_nhan_su}
        emptyText="Chưa có dữ liệu — bấm 'Đồng bộ ngay' để kéo về."
      />
    </div>
  );
}

const TK_TRANG_THAI: Record<EtxNhanSuRow["tk_trang_thai"], { label: string; tone: BadgeTone }> = {
  da_tao: { label: "Đã tạo", tone: "teal" },
  chua_tao: { label: "Chưa tạo", tone: "amber" },
  cho_duyet: { label: "Chờ duyệt", tone: "amber" },
  tu_choi: { label: "Đã từ chối", tone: "violet" },
  van_phong: { label: "TK văn phòng", tone: "ocean" },
  khong_gmail: { label: "Thiếu Gmail", tone: "gray" },
};
const TAO_TK_LOI: Record<string, string> = {
  THIEU_GMAIL: "chưa có Gmail hợp lệ trên ETX",
  MA_KTV_CUA_NGUOI_KHAC: "Mã NV đã là Mã KTV của người khác (email đăng nhập khác) — kiểm tra ở thẻ KTV hiện trường",
  LA_GMAIL_PHU: "Gmail này đang là Gmail đăng nhập phụ của tài khoản khác — gỡ Gmail phụ trước nếu muốn tạo tài khoản riêng",
  NOT_FOUND: "không tìm thấy nhân sự",
};

function MaKtvCell({ row, onSave }: { row: EtxNhanSuRow; onSave: (maKtv: string | null) => void }) {
  const [value, setValue] = useState(row.ma_ktv ?? "");
  const dirty = value.trim() !== (row.ma_ktv ?? "");
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(value.trim() || null); }}
        placeholder="Chưa gán"
        className="focus-ring w-28 border border-[var(--line)] rounded-lg px-2 py-1 text-sm"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => onSave(value.trim() || null)}
          className="text-xs px-2 py-1 rounded-lg bg-[var(--brand)] text-white"
        >
          Lưu
        </button>
      )}
    </div>
  );
}


// Lich su thay doi quyen / khoa / duyet / Gmail phu (migration 0110, ra soat bao mat 2026-11-09) - xo xuong, tai luc mo.
const NHAN_QUYEN: Record<string, string> = {
  vai_tro: "Vai trò", trang_thai_duyet: "Duyệt", bi_khoa: "Khoá", la_ktv_dvbh: "KTV DVBH", la_ve_tinh: "Vệ tinh", la_kho: "Kho",
  la_ke_toan: "Kế toán", la_tac_nghiep: "Tác nghiệp", la_tp_dvbh: "TBP", la_view: "View", la_mua_hang: "Mua hàng", la_nv_sua_chua: "NV sửa chữa",
  quan_ly_danh_muc_lk: "Quản lý danh mục LK", xem_danh_muc_lk: "Xem danh mục LK", gmail_phu: "Gmail phụ",
};
const HANH_DONG_QUYEN: Record<string, string> = { sua: "Sửa quyền", tao: "Tạo tài khoản", them_gmail_phu: "Thêm Gmail phụ", go_gmail_phu: "Gỡ Gmail phụ" };

function moTaThayDoiQuyen(truoc: string | null, sau: string | null): string {
  const a = (truoc ? JSON.parse(truoc) : {}) as Record<string, unknown>;
  const b = (sau ? JSON.parse(sau) : {}) as Record<string, unknown>;
  const gt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : v === 1 ? "bật" : v === 0 ? "tắt" : String(v));
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !truoc || !sau || a[k] !== b[k]);
  return keys
    .filter((k) => truoc || b[k] !== 0)
    .map((k) => `${NHAN_QUYEN[k] ?? k}: ${truoc ? `${gt(a[k])} → ` : ""}${gt(b[k])}`)
    .join(" · ");
}

function LichSuQuyen({ email }: { email: string }) {
  const [mo, setMo] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["users-quyen-log", email],
    queryFn: () =>
      api.get<{ rows: { id: number; hanh_dong: string; truoc: string | null; sau: string | null; nguoi_thuc_hien: string; luc: string }[] }>(
        `/users/${encodeURIComponent(email)}/quyen-log`,
      ),
    enabled: mo,
    staleTime: 0,
  });
  return (
    <div className="text-[12px]">
      <button type="button" className="font-semibold text-[var(--color-link)]" onClick={() => setMo((v) => !v)}>
        {mo ? "▴ Ẩn lịch sử thay đổi quyền" : "▾ Lịch sử thay đổi quyền"}
      </button>
      {mo && (
        <div className="mt-1 max-h-48 overflow-y-auto border border-[var(--color-border)] rounded-lg p-2 space-y-1">
          {isLoading && <div className="text-[var(--color-text-secondary)]">Đang tải…</div>}
          {data && data.rows.length === 0 && <div className="text-[var(--color-text-secondary)]">Chưa có thay đổi nào được ghi (ghi từ 09/11/2026).</div>}
          {data?.rows.map((r) => (
            <div key={r.id}>
              <span className="text-[var(--color-text-secondary)]">{fmtDateTime(r.luc)}</span> ·{" "}
              <b>{HANH_DONG_QUYEN[r.hanh_dong] ?? r.hanh_dong}</b> · {moTaThayDoiQuyen(r.truoc, r.sau)} ·{" "}
              <span className="text-[var(--color-text-secondary)]">bởi {r.nguoi_thuc_hien === "he_thong" ? "hệ thống" : r.nguoi_thuc_hien}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
