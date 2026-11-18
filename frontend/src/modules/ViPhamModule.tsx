import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { LocCotButton, useLocCot, type LocCotCfg } from "../components/ui/LocCot";
import { describeApiError } from "./datMuaLinhKien/helpers";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import {
  ChiTietViPham, HopViPham, MaDoiTuong, NHAN_LOAI, NHAN_TT, NutViPham, TONE_TT, conLai, gioTre, lamMoiViPham, ngayGio, tenPt, type ViPhamRow,
} from "./viPham/ViPhamUi";
import { t } from "../i18n";

// "Quá hạn & vi phạm" (v1.517; v1.518 nguoi phu trach cu the, ly do, bao khong dung, tong hop). Backend lib/viPham.ts + routes/viPham.ts.
// Doi tac ngoai doc cung du lieu qua GET /api/partner/v1/vi-pham.

interface BuocCfg {
  ma: string;
  ten: string;
  loai: string | null;
  ten_bo_phan: string;
  so_gio: number;
  gio_giai_trinh: number;
  tinh_cuoi_tuan: number;
  bat_tat: number;
  cap_nhat_luc: string | null;
  cap_nhat_boi: string | null;
}

export function ViPhamModule({ moTab }: { moTab?: { tab: string; nonce: number } | null }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const isAdmin = user?.vai_tro === "Admin";
  const qc = useQueryClient();
  const [tab, setTab] = useState(moTab?.tab || "can_toi");
  const [loai, setLoai] = useState<"" | "dat_hang" | "tra_hang">("");
  const [q, setQ] = useState("");
  const [qGui, setQGui] = useState("");
  const [page, setPage] = useState(1);
  const [chiTiet, setChiTiet] = useState<ViPhamRow | null>(null);
  const [hop, setHop] = useState<ViPhamRow | null>(null);
  const [locBoPhan, setLocBoPhan] = useState<string | undefined>();
  const [locNguoi, setLocNguoi] = useState<string | undefined>();
  const locCot = useLocCot(() => setPage(1));
  const dir = usePersonDirectory();
  const ten = (e: string) => formatPersonDisplay(e, dir);

  useEffect(() => {
    if (moTab?.tab) { setTab(moTab.tab); setPage(1); }
  }, [moTab?.nonce, moTab?.tab]);
  useEffect(() => {
    const h = setTimeout(() => { setQGui(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const dem = useQuery({ queryKey: ["vi-pham-dem"], queryFn: () => api.get<Record<string, number>>("/vi-pham/dem") });
  const buoc = useQuery({ queryKey: ["vi-pham-buoc"], queryFn: () => api.get<{ buoc: BuocCfg[]; lan_quet: string | null; bo_phan: Record<string, string> }>("/vi-pham/buoc") });
  const params = { tab, loai: loai || undefined, q: qGui || undefined, bo_phan: locBoPhan, nguoi: locNguoi };
  const ds = useQuery({
    queryKey: ["vi-pham", params, locCot.queryParams, page],
    queryFn: () => api.get<{ rows: ViPhamRow[]; total: number }>(`/vi-pham${buildQuery({ ...params, ...locCot.queryParams, page, pageSize: 50 })}`),
    enabled: tab !== "cau_hinh" && tab !== "tong_hop",
  });

  const nhanBuoc = useMemo(() => new Map((buoc.data?.buoc ?? []).map((b) => [b.ma, b.ten])), [buoc.data]);
  const locCfg: LocCotCfg = {
    ...locCot,
    endpoint: "/vi-pham/gia-tri-loc",
    params,
    tieuDe: {
      doi_tuong_id: t("Đơn / phiếu"), loai: t("Loại"), buoc: t("Bước"), bo_phan: t("Bộ phận"), khu_vuc_ma: t("Khu vực"),
      nguoi_nhan_hang: t("Người nhận hàng"), nguoi_phu_trach: t("Người phải giải trình"), moc_vao: t("Vào bước"), han: t("Hạn"),
      han_giai_trinh: t("Hạn giải trình"), ket_thuc_luc: t("Rời bước"), nguoi_xu_ly: t("Người xử lý"), trang_thai: t("Trạng thái"), ly_do: t("Lý do"),
    },
    nhan: {
      loai: (v) => t(NHAN_LOAI[v] ?? v),
      buoc: (v) => t(nhanBuoc.get(v) ?? v),
      trang_thai: (v) => t(NHAN_TT[v] ?? v),
      bo_phan: (v) => t(buoc.data?.bo_phan[v] ?? v),
      nguoi_nhan_hang: ten,
      nguoi_xu_ly: ten,
      nguoi_phu_trach: ten,
    },
  };
  const loc = (cot: string) => <LocCotButton cfg={locCfg} cot={cot} />;

  const cot: Column<ViPhamRow>[] = [
    { key: "ma", header: t("Đơn / phiếu"), filter: loc("doi_tuong_id"), render: (r) => <MaDoiTuong r={r} />, mobile: "title" },
    { key: "buoc", header: t("Bước quá hạn"), filter: loc("buoc"), sortKey: "buoc", render: (r) => t(r.ten_buoc), mobile: "sub" },
    { key: "bo_phan", header: t("Bộ phận"), filter: loc("bo_phan"), sortKey: "bo_phan", render: (r) => t(r.ten_bo_phan), mobile: "meta" },
    {
      key: "phu_trach",
      header: t("Người phải giải trình"),
      filter: loc("nguoi_phu_trach"),
      render: (r) => (
        <span className={`block max-w-[220px] truncate ${r.la_cua_toi ? "font-semibold" : ""}`} title={tenPt(r.nguoi_phu_trach)}>
          {r.la_cua_toi ? `★ ${t("Tôi")}${r.nguoi_phu_trach.length > 1 ? ` +${r.nguoi_phu_trach.length - 1}` : ""}` : tenPt(r.nguoi_phu_trach)}
        </span>
      ),
      mobile: "meta",
    },
    { key: "trang_thai", header: t("Trạng thái"), filter: loc("trang_thai"), sortKey: "trang_thai", render: (r) => <Badge tone={TONE_TT[r.trang_thai]}>{t(NHAN_TT[r.trang_thai])}</Badge>, mobile: "badge" },
    {
      key: "han_gt",
      header: t("Hạn giải trình"),
      filter: loc("han_giai_trinh"),
      sortKey: "han_giai_trinh",
      render: (r) =>
        r.trang_thai === "Cho giai trinh" ? (
          <span className="text-[var(--color-warning-strong)] font-semibold">{ngayGio(r.han_giai_trinh)} · {conLai(r.han_giai_trinh) ?? t("đã quá")}</span>
        ) : (
          "—"
        ),
      mobile: "meta",
    },
    {
      key: "tre",
      header: t("Trễ"),
      sortKey: "so_gio_tre",
      render: (r) => <span className={r.dang_cho ? "text-[var(--color-danger)] font-semibold" : ""}>{gioTre(r.so_gio_tre)}{r.dang_cho ? ` · ${t("đang chờ")}` : ""}</span>,
    },
    { key: "loai", header: t("Loại"), filter: loc("loai"), sortKey: "loai", render: (r) => t(NHAN_LOAI[r.loai]) },
    { key: "khu_vuc", header: t("Khu vực"), filter: loc("khu_vuc_ma"), sortKey: "khu_vuc_ma", render: (r) => r.khu_vuc_ma ?? "—" },
    { key: "moc_vao", header: t("Vào bước"), filter: loc("moc_vao"), sortKey: "moc_vao", render: (r) => ngayGio(r.moc_vao) },
    { key: "han", header: t("Hạn (SLA)"), filter: loc("han"), sortKey: "han", render: (r) => `${ngayGio(r.han)} · ${r.so_gio_sla}h` },
    {
      key: "giai_trinh",
      header: t("Giải trình"),
      filter: loc("ly_do"),
      render: (r) =>
        r.giai_trinh ? (
          <span className="block max-w-[260px] truncate" title={`${r.ly_do ?? ""} — ${r.giai_trinh}`}>{r.ly_do ? <b>{r.ly_do}: </b> : null}{r.giai_trinh}</span>
        ) : (
          "—"
        ),
    },
    { key: "nguoi_nhan", header: t("Người nhận hàng"), filter: loc("nguoi_nhan_hang"), sortKey: "nguoi_nhan_hang", render: (r) => r.nguoi_nhan_hang_ten ?? r.nguoi_nhan_hang ?? "—" },
    {
      key: "xu_ly",
      header: t("Người xử lý bước"),
      filter: loc("nguoi_xu_ly"),
      sortKey: "nguoi_xu_ly",
      render: (r) => (r.ket_thuc_luc ? `${r.nguoi_xu_ly_ten ?? r.nguoi_xu_ly ?? t("Hệ thống")} · ${ngayGio(r.ket_thuc_luc)}` : "—"),
    },
    { key: "tt", header: "", mobileHint: "actions", render: (r) => <NutViPham r={r} nho onMo={() => setHop(r)} /> },
  ];

  const d = dem.data ?? {};
  const tabs = [
    { key: "can_toi", label: "Cần tôi giải trình", count: d.can_toi },
    { key: "cua_toi", label: "Của tôi" },
    { key: "cho", label: "Chờ giải trình" },
    { key: "gan_the", label: "Gắn thẻ vi phạm" },
    { key: "da_giai_trinh", label: "Đã giải trình" },
    { key: "dang_cho", label: "Đang quá hạn" },
    { key: "tat_ca", label: "Tất cả" },
    { key: "tong_hop", label: "Tổng hợp theo dõi" },
    ...(isAdmin ? [{ key: "cau_hinh", label: "Cấu hình SLA" }] : []),
  ];
  const doiTab = (k: string) => { setTab(k); setPage(1); setLocBoPhan(undefined); setLocNguoi(undefined); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-[var(--color-text-secondary)] max-w-3xl">
          {t("Mỗi bước có hạn xử lý (SLA). Quá hạn → người phụ trách giải trình; hết hạn giải trình mà chưa giải trình → hệ thống gắn thẻ vi phạm.")}
          {buoc.data?.lan_quet && ` ${t("Lần quét gần nhất: {a}", { a: ngayGio(buoc.data.lan_quet) })}.`}
        </p>
        <div className="flex gap-2 text-xs">
          <button className="kpi-card px-3 py-2 text-left" onClick={() => doiTab("can_toi")}>{t("Cần tôi giải trình")}: <b className="text-[var(--color-warning-strong)]">{d.can_toi ?? 0}</b></button>
          <button className="kpi-card px-3 py-2 text-left" onClick={() => doiTab("gan_the")}>{t("Gắn thẻ")}: <b className="text-[var(--color-danger)]">{d.gan_the ?? 0}</b></button>
          <button className="kpi-card px-3 py-2 text-left" onClick={() => doiTab("cho")}>{t("Chờ giải trình")}: <b>{d.cho ?? 0}</b></button>
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={doiTab} />
      {tab === "cau_hinh" ? (
        <CauHinhSla ds={buoc.data?.buoc ?? []} onDoi={() => { qc.invalidateQueries({ queryKey: ["vi-pham-buoc"] }); lamMoiViPham(qc); }} />
      ) : tab === "tong_hop" ? (
        <TongHop tenBp={buoc.data?.bo_phan ?? {}} onMo={(bp, nguoi) => { setTab("tat_ca"); setPage(1); setLocBoPhan(bp); setLocNguoi(nguoi); }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["", "dat_hang", "tra_hang"] as const).map((k) => (
              <button key={k || "all"} className={`filter-tab ${loai === k ? "active" : ""}`} onClick={() => { setLoai(k); setPage(1); }}>
                {k ? t(NHAN_LOAI[k]) : t("Tất cả")}
              </button>
            ))}
            <input className="o-tim min-w-[240px]" placeholder={t("Tìm mã đơn, phiếu, mã YCSC, Lada…")} value={q} onChange={(e) => setQ(e.target.value)} />
            {(locBoPhan || locNguoi) && (
              <Btn size="sm" variant="ghost" onClick={() => { setLocBoPhan(undefined); setLocNguoi(undefined); }}>
                ✕ {locNguoi ? ten(locNguoi) : t(buoc.data?.bo_phan[locBoPhan!] ?? locBoPhan!)}
              </Btn>
            )}
            {Object.keys(locCot.loc).length > 0 && <Btn size="sm" variant="ghost" onClick={locCot.xoaHet}>✕ {t("Xoá lọc cột")}</Btn>}
            <span className="ml-auto text-sm text-[var(--color-text-secondary)]">{t("{n} dòng", { n: ds.data?.total ?? 0 })}</span>
          </div>
          <PaginatedTable
            columns={cot}
            rows={ds.data?.rows ?? []}
            isLoading={ds.isLoading}
            isError={ds.isError}
            onRetry={() => ds.refetch()}
            page={page}
            pageSize={50}
            total={ds.data?.total ?? 0}
            onPageChange={setPage}
            rowKey={(r) => r.id}
            onRowClick={setChiTiet}
            rowClassName={(r) => (r.la_cua_toi && r.trang_thai === "Cho giai trinh" ? "border-l-4 border-l-[var(--color-warning)]" : "")}
            sortBy={locCot.sapXep?.cot}
            sortDir={locCot.sapXep?.dir}
            onSortChange={(cs, cd) => locCot.setSapXep({ cot: cs, dir: cd })}
            storageKey="vi-pham-v2"
            emptyText={tab === "can_toi" ? t("Không có ca quá hạn nào cần bạn giải trình.") : t("Không có dữ liệu.")}
          />
        </>
      )}
      {chiTiet && <ChiTietViPham r={chiTiet} onClose={() => setChiTiet(null)} />}
      {hop && <HopViPham r={hop} onClose={() => setHop(null)} />}
    </div>
  );
}

interface TongHopData {
  bo_phan: { bo_phan: string; ten_bo_phan: string; cho: number; da_giai_trinh: number; gan_the: number; dang_cho: number; tong: number }[];
  nguoi: { email: string; ten: string | null; ma_nhan_su: string | null; cho: number; gan_the: number; da_giai_trinh: number; han_som_nhat: string | null; bo_phan: string }[];
  chua_co_nguoi_phu_trach: number;
}

/** Tong hop ton theo bo phan + theo nguoi - bam dong = mo danh sach da loc. */
function TongHop({ onMo, tenBp }: { onMo: (boPhan?: string, nguoi?: string) => void; tenBp: Record<string, string> }) {
  const q = useQuery({ queryKey: ["vi-pham-tong-hop"], queryFn: () => api.get<TongHopData>("/vi-pham/tong-hop") });
  const d = q.data;
  if (!d) return <p className="text-sm">{t("Đang tải…")}</p>;
  const So = ({ n, mau }: { n: number; mau?: string }) => <span className={n ? `font-semibold ${mau ?? ""}` : "text-[var(--color-text-faint)]"}>{n}</span>;
  return (
    <div className="space-y-4">
      {d.chua_co_nguoi_phu_trach > 0 && (
        <p className="text-sm rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-2">
          ⚠ {t("{n} ca chưa xác định được người phải giải trình (bộ phận chưa có ai / khu vực chưa có GS) — cần gán khu vực cho nhân sự ở Quản lý người dùng.", { n: d.chua_co_nguoi_phu_trach })}
        </p>
      )}
      <div>
        <h3 className="font-semibold mb-1">{t("Theo bộ phận")}</h3>
        <div className="overflow-x-auto">
          <table className="tbl w-full [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-[var(--color-surface-hover)]">
            <thead className="tbl-head">
              <tr><th>{t("Bộ phận")}</th><th>{t("Chờ giải trình")}</th><th>{t("Gắn thẻ vi phạm")}</th><th>{t("Đã giải trình")}</th><th>{t("Đang quá hạn")}</th><th>{t("Tổng")}</th></tr>
            </thead>
            <tbody>
              {d.bo_phan.map((r) => (
                <tr key={r.bo_phan} className="cursor-pointer" onClick={() => onMo(r.bo_phan)}>
                  <td className="font-semibold">{t(r.ten_bo_phan)}</td>
                  <td><So n={r.cho} mau="text-[var(--color-warning-strong)]" /></td>
                  <td><So n={r.gan_the} mau="text-[var(--color-danger)]" /></td>
                  <td><So n={r.da_giai_trinh} /></td>
                  <td><So n={r.dang_cho} /></td>
                  <td><So n={r.tong} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-1">{t("Theo người phải giải trình")}</h3>
        <div className="overflow-x-auto">
          <table className="tbl w-full [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-[var(--color-surface-hover)]">
            <thead className="tbl-head">
              <tr><th>{t("Người")}</th><th>{t("Mã nhân sự")}</th><th>{t("Bộ phận")}</th><th>{t("Chờ giải trình")}</th><th>{t("Hạn sớm nhất")}</th><th>{t("Gắn thẻ vi phạm")}</th><th>{t("Đã tự giải trình")}</th></tr>
            </thead>
            <tbody>
              {d.nguoi.map((r) => (
                <tr key={r.email} className="cursor-pointer" onClick={() => onMo(undefined, r.email)}>
                  <td className="font-semibold">{r.ten ?? r.email}</td>
                  <td>{r.ma_nhan_su ?? "—"}</td>
                  <td>{(r.bo_phan ?? "").split(",").map((b) => t(tenBp[b] ?? b)).join(", ")}</td>
                  <td><So n={r.cho} mau="text-[var(--color-warning-strong)]" /></td>
                  <td>{r.han_som_nhat ? ngayGio(r.han_som_nhat) : "—"}</td>
                  <td><So n={r.gan_the} mau="text-[var(--color-danger)]" /></td>
                  <td><So n={r.da_giai_trinh} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CauHinhSla({ ds, onDoi }: { ds: BuocCfg[]; onDoi: () => void }) {
  const addToast = useToast();
  const [sua, setSua] = useState<Record<string, BuocCfg>>({});
  const quet = useMutation({
    mutationFn: () => api.post<{ ung_vien: number; ghi_moi: number; gan_the: number }>("/vi-pham/quet", {}),
    onSuccess: (r) => { addToast(t("Đã quét: {a} ca mới, {b} gắn thẻ", { a: r.ghi_moi, b: r.gan_the })); onDoi(); },
    onError: (e) => addToast(describeApiError(e)),
  });
  const luu = useMutation({
    mutationFn: (b: BuocCfg) => api.put(`/vi-pham/buoc/${b.ma}`, { so_gio: b.so_gio, gio_giai_trinh: b.gio_giai_trinh, tinh_cuoi_tuan: !!b.tinh_cuoi_tuan, bat_tat: !!b.bat_tat }),
    onSuccess: (_r, b) => { addToast(t("Đã lưu {a}", { a: t(b.ten) })); setSua((s) => { const n = { ...s }; delete n[b.ma]; return n; }); onDoi(); },
    onError: (e) => addToast(describeApiError(e)),
  });
  const gt = (b: BuocCfg) => sua[b.ma] ?? b;
  const doi = (b: BuocCfg, p: Partial<BuocCfg>) => setSua((s) => ({ ...s, [b.ma]: { ...gt(b), ...p } }));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[var(--color-text-secondary)] flex-1">
          {t("Hạn tính từ lúc đơn / phiếu vào bước. Không tính cuối tuần: hạn rơi vào T7/CN thì dời sang thứ Hai. Đổi cấu hình chỉ áp cho ca ghi nhận sau đó. Hệ thống tự quét mỗi giờ.")}
        </p>
        <Btn variant="ghost" loading={quet.isPending} onClick={() => quet.mutate()}>{t("Quét ngay")}</Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-[var(--color-surface-hover)]">
          <thead className="tbl-head">
            <tr>
              <th>{t("Bước")}</th><th>{t("Bộ phận")}</th><th>{t("SLA (giờ)")}</th><th>{t("Hạn giải trình (giờ)")}</th>
              <th>{t("Tính cuối tuần")}</th><th>{t("Bật")}</th><th>{t("Cập nhật")}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {ds.map((b) => {
              const v = gt(b);
              return (
                <tr key={b.ma}>
                  <td className="font-semibold">{t(b.ten)}</td>
                  <td>{t(b.ten_bo_phan)}</td>
                  <td><input type="number" min={1} max={2160} className="w-20 rounded border border-[var(--color-border)] px-2 py-1" value={v.so_gio} onChange={(e) => doi(b, { so_gio: Number(e.target.value) })} /></td>
                  <td><input type="number" min={1} max={720} className="w-20 rounded border border-[var(--color-border)] px-2 py-1" value={v.gio_giai_trinh} onChange={(e) => doi(b, { gio_giai_trinh: Number(e.target.value) })} /></td>
                  <td><ToggleSwitch checked={!!v.tinh_cuoi_tuan} onChange={() => doi(b, { tinh_cuoi_tuan: v.tinh_cuoi_tuan ? 0 : 1 })} /></td>
                  <td><ToggleSwitch checked={!!v.bat_tat} onChange={() => doi(b, { bat_tat: v.bat_tat ? 0 : 1 })} /></td>
                  <td className="text-xs text-[var(--color-text-secondary)]">{b.cap_nhat_luc ? `${ngayGio(b.cap_nhat_luc)} · ${b.cap_nhat_boi}` : "—"}</td>
                  <td>{sua[b.ma] && <Btn size="sm" loading={luu.isPending} onClick={() => luu.mutate(v)}>{t("Lưu")}</Btn>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
