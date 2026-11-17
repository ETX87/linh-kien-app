import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useToast } from "../components/ui/Toast";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { LocCotButton, useLocCot, type LocCotCfg } from "../components/ui/LocCot";
import { MaDonLink, MaPhieuLink } from "./datMuaLinhKien/MaLienKet";
import { describeApiError } from "./datMuaLinhKien/helpers";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import { t } from "../i18n";

// "Quá hạn & vi phạm" (2026-11-17, v1.517, migration 0125). Bo phan giai trinh ca qua han SLA cua minh; het han giai trinh he thong tu gan
// the. Admin cau hinh SLA tung buoc, go the, quet ngay. Doi tac ngoai doc cung du lieu qua GET /api/partner/v1/vi-pham (backend lib/viPham.ts).

interface ViPhamRow {
  id: number;
  buoc: string;
  ten_buoc: string;
  loai: "dat_hang" | "tra_hang";
  bo_phan: string;
  ten_bo_phan: string;
  doi_tuong: "don" | "ticket" | "phieu";
  doi_tuong_id: string;
  dat_don_hang_id: string | null;
  phieu_xuat_kho_id: string | null;
  khu_vuc_ma: string | null;
  nguoi_nhan_hang: string | null;
  nguoi_nhan_hang_ten: string | null;
  moc_vao: string;
  so_gio_sla: number;
  han: string;
  so_gio_tre: number;
  dang_cho: boolean;
  ket_thuc_luc: string | null;
  trang_thai_sau: string | null;
  nguoi_xu_ly: string | null;
  nguoi_xu_ly_ten: string | null;
  trang_thai: "Cho giai trinh" | "Da giai trinh" | "Gan the" | "Da go the";
  han_giai_trinh: string;
  giai_trinh: string | null;
  nguoi_giai_trinh_ten: string | null;
  nguoi_giai_trinh: string | null;
  giai_trinh_luc: string | null;
  giai_trinh_tu_dong: boolean;
  gan_the_luc: string | null;
  go_the_ly_do: string | null;
  go_the_boi: string | null;
  go_the_luc: string | null;
  ma_yeu_cau_su_co: string | null;
  ma_lada: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  don_ids: string[];
  duoc_giai_trinh: boolean;
  duoc_go_the: boolean;
}

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

const NHAN_TT: Record<string, string> = {
  "Cho giai trinh": "Chờ giải trình",
  "Da giai trinh": "Đã giải trình",
  "Gan the": "Gắn thẻ vi phạm",
  "Da go the": "Đã gỡ thẻ",
};
const TONE_TT: Record<string, BadgeTone> = { "Cho giai trinh": "amber", "Da giai trinh": "teal", "Gan the": "coral", "Da go the": "gray" };
const NHAN_LOAI: Record<string, string> = { dat_hang: "Đặt hàng", tra_hang: "Trả hàng" };

/** "YYYY-MM-DD HH:MM:SS" (gio VN) -> "dd/mm HH:MM" - cat chuoi, khong qua Date (tranh lech mui gio). */
function ngayGio(s: string | null | undefined): string {
  if (!s) return "—";
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
}
function gioTre(h: number): string {
  if (h < 24) return t("{n} giờ", { n: h });
  const d = Math.floor(h / 24);
  const r = Math.round(h - d * 24);
  return r ? t("{d} ngày {h} giờ", { d, h: r }) : t("{d} ngày", { d });
}

function MaDoiTuong({ r }: { r: ViPhamRow }) {
  if (r.doi_tuong === "phieu") return <MaPhieuLink id={r.phieu_xuat_kho_id} />;
  if (r.doi_tuong === "ticket")
    return (
      <span className="whitespace-nowrap">
        <span className="font-semibold">{r.doi_tuong_id}</span>
        {r.dat_don_hang_id && (
          <span className="text-[var(--color-text-muted)]">
            {" · "}
            <MaDonLink id={r.dat_don_hang_id} />
          </span>
        )}
      </span>
    );
  return r.dat_don_hang_id ? <MaDonLink id={r.dat_don_hang_id} /> : <>{r.doi_tuong_id}</>;
}

export function ViPhamModule() {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const isAdmin = user?.vai_tro === "Admin";
  const qc = useQueryClient();
  const addToast = useToast();
  const [tab, setTab] = useState("can_toi");
  const [loai, setLoai] = useState<"" | "dat_hang" | "tra_hang">("");
  const [q, setQ] = useState("");
  const [qGui, setQGui] = useState("");
  const [page, setPage] = useState(1);
  const [chiTiet, setChiTiet] = useState<ViPhamRow | null>(null);
  const [giaiTrinh, setGiaiTrinh] = useState<ViPhamRow | null>(null);
  const [goThe, setGoThe] = useState<ViPhamRow | null>(null);
  const locCot = useLocCot(() => setPage(1));
  const dir = usePersonDirectory();
  const ten = (e: string) => formatPersonDisplay(e, dir);

  useEffect(() => {
    const h = setTimeout(() => { setQGui(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const dem = useQuery({ queryKey: ["vi-pham-dem"], queryFn: () => api.get<Record<string, number>>("/vi-pham/dem") });
  const buoc = useQuery({ queryKey: ["vi-pham-buoc"], queryFn: () => api.get<{ buoc: BuocCfg[]; lan_quet: string | null; bo_phan: Record<string, string> }>("/vi-pham/buoc") });
  const params = { tab, loai: loai || undefined, q: qGui || undefined };
  const ds = useQuery({
    queryKey: ["vi-pham", params, locCot.queryParams, page],
    queryFn: () => api.get<{ rows: ViPhamRow[]; total: number }>(`/vi-pham${buildQuery({ ...params, ...locCot.queryParams, page, pageSize: 50 })}`),
    enabled: tab !== "cau_hinh",
  });
  const lamMoi = () => {
    qc.invalidateQueries({ queryKey: ["vi-pham"] });
    qc.invalidateQueries({ queryKey: ["vi-pham-dem"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  };

  const nhanBuoc = useMemo(() => new Map((buoc.data?.buoc ?? []).map((b) => [b.ma, b.ten])), [buoc.data]);
  const locCfg: LocCotCfg = {
    ...locCot,
    endpoint: "/vi-pham/gia-tri-loc",
    params,
    tieuDe: {
      doi_tuong_id: t("Đơn / phiếu"),
      loai: t("Loại"),
      buoc: t("Bước"),
      bo_phan: t("Bộ phận"),
      khu_vuc_ma: t("Khu vực"),
      nguoi_nhan_hang: t("Người nhận hàng"),
      moc_vao: t("Vào bước"),
      han: t("Hạn"),
      ket_thuc_luc: t("Rời bước"),
      nguoi_xu_ly: t("Người xử lý"),
      trang_thai: t("Trạng thái"),
    },
    nhan: {
      loai: (v) => t(NHAN_LOAI[v] ?? v),
      buoc: (v) => t(nhanBuoc.get(v) ?? v),
      trang_thai: (v) => t(NHAN_TT[v] ?? v),
      bo_phan: (v) => t(buoc.data?.bo_phan[v] ?? v),
      nguoi_nhan_hang: ten,
      nguoi_xu_ly: ten,
    },
  };
  const loc = (cot: string) => <LocCotButton cfg={locCfg} cot={cot} />;

  const cot: Column<ViPhamRow>[] = [
    { key: "ma", header: t("Đơn / phiếu"), filter: loc("doi_tuong_id"), render: (r) => <MaDoiTuong r={r} />, mobile: "title" },
    { key: "loai", header: t("Loại"), filter: loc("loai"), sortKey: "loai", render: (r) => t(NHAN_LOAI[r.loai]), mobile: "meta" },
    { key: "buoc", header: t("Bước quá hạn"), filter: loc("buoc"), sortKey: "buoc", render: (r) => t(r.ten_buoc), mobile: "sub" },
    { key: "bo_phan", header: t("Bộ phận"), filter: loc("bo_phan"), sortKey: "bo_phan", render: (r) => t(r.ten_bo_phan), mobile: "meta" },
    { key: "khu_vuc", header: t("Khu vực"), filter: loc("khu_vuc_ma"), sortKey: "khu_vuc_ma", render: (r) => r.khu_vuc_ma ?? "—" },
    { key: "nguoi_nhan", header: t("Người nhận hàng"), filter: loc("nguoi_nhan_hang"), sortKey: "nguoi_nhan_hang", render: (r) => r.nguoi_nhan_hang_ten ?? r.nguoi_nhan_hang ?? "—" },
    { key: "moc_vao", header: t("Vào bước"), filter: loc("moc_vao"), sortKey: "moc_vao", render: (r) => ngayGio(r.moc_vao) },
    { key: "han", header: t("Hạn (SLA)"), filter: loc("han"), sortKey: "han", render: (r) => `${ngayGio(r.han)} · ${r.so_gio_sla}h` },
    {
      key: "tre",
      header: t("Trễ"),
      sortKey: "so_gio_tre",
      render: (r) => <span className={`font-semibold ${r.dang_cho ? "text-[var(--color-danger)]" : ""}`}>{gioTre(r.so_gio_tre)}{r.dang_cho ? ` · ${t("đang chờ")}` : ""}</span>,
      mobile: "meta",
    },
    {
      key: "xu_ly",
      header: t("Người xử lý"),
      filter: loc("nguoi_xu_ly"),
      sortKey: "nguoi_xu_ly",
      render: (r) => (r.ket_thuc_luc ? `${r.nguoi_xu_ly_ten ?? r.nguoi_xu_ly ?? t("Hệ thống")} · ${ngayGio(r.ket_thuc_luc)}` : "—"),
    },
    { key: "trang_thai", header: t("Trạng thái"), filter: loc("trang_thai"), sortKey: "trang_thai", render: (r) => <Badge tone={TONE_TT[r.trang_thai]}>{t(NHAN_TT[r.trang_thai])}</Badge>, mobile: "badge" },
    {
      key: "giai_trinh",
      header: t("Giải trình"),
      render: (r) =>
        r.giai_trinh ? (
          <span className="block max-w-[280px] truncate" title={r.giai_trinh}>{r.giai_trinh}</span>
        ) : r.trang_thai === "Cho giai trinh" ? (
          <span className="text-[var(--color-warning)]">{t("Hạn giải trình {a}", { a: ngayGio(r.han_giai_trinh) })}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "tt",
      header: "",
      mobileHint: "actions",
      render: (r) => (
        <div className="flex gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
          {r.duoc_giai_trinh && <Btn size="sm" onClick={() => setGiaiTrinh(r)}>{t("Giải trình")}</Btn>}
          {r.duoc_go_the && r.trang_thai === "Gan the" && <Btn size="sm" variant="ghost" onClick={() => setGoThe(r)}>{t("Gỡ thẻ")}</Btn>}
        </div>
      ),
    },
  ];

  const d = dem.data ?? {};
  const tabs = [
    { key: "can_toi", label: "Cần tôi giải trình", count: d.can_toi },
    { key: "cho", label: "Chờ giải trình" },
    { key: "gan_the", label: "Gắn thẻ vi phạm" },
    { key: "da_giai_trinh", label: "Đã giải trình" },
    { key: "da_go", label: "Đã gỡ thẻ" },
    { key: "dang_cho", label: "Đang quá hạn" },
    { key: "tat_ca", label: "Tất cả" },
    ...(isAdmin ? [{ key: "cau_hinh", label: "Cấu hình SLA" }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("Mỗi bước có hạn xử lý (SLA). Quá hạn → bộ phận giải trình; hết hạn giải trình mà chưa giải trình → hệ thống gắn thẻ vi phạm.")}
            {buoc.data?.lan_quet && ` ${t("Lần quét gần nhất: {a}", { a: ngayGio(buoc.data.lan_quet) })}.`}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="kpi-card px-3 py-2">{t("Chờ giải trình")}: <b>{d.cho ?? 0}</b></span>
          <span className="kpi-card px-3 py-2">{t("Gắn thẻ")}: <b className="text-[var(--color-danger)]">{d.gan_the ?? 0}</b></span>
          <span className="kpi-card px-3 py-2">{t("Đang quá hạn")}: <b>{d.dang_cho ?? 0}</b></span>
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      {tab === "cau_hinh" ? (
        <CauHinhSla ds={buoc.data?.buoc ?? []} onDoi={() => { qc.invalidateQueries({ queryKey: ["vi-pham-buoc"] }); lamMoi(); }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["", "dat_hang", "tra_hang"] as const).map((k) => (
              <button key={k || "all"} className={`filter-tab ${loai === k ? "active" : ""}`} onClick={() => { setLoai(k); setPage(1); }}>
                {k ? t(NHAN_LOAI[k]) : t("Tất cả")}
              </button>
            ))}
            <input className="o-tim min-w-[240px]" placeholder={t("Tìm mã đơn, phiếu, mã YCSC, Lada…")} value={q} onChange={(e) => setQ(e.target.value)} />
            {Object.keys(locCot.loc).length > 0 && (
              <Btn size="sm" variant="ghost" onClick={locCot.xoaHet}>✕ {t("Xoá lọc cột")}</Btn>
            )}
            <span className="ml-auto text-sm text-[var(--color-text-muted)]">{t("{n} dòng", { n: ds.data?.total ?? 0 })}</span>
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
            sortBy={locCot.sapXep?.cot}
            sortDir={locCot.sapXep?.dir}
            onSortChange={(cs, cd) => locCot.setSapXep({ cot: cs, dir: cd })}
            storageKey="vi-pham-v1"
            emptyText={tab === "can_toi" ? t("Không có ca quá hạn nào cần bạn giải trình.") : t("Không có dữ liệu.")}
          />
        </>
      )}
      {chiTiet && (
        <ChiTietViPham
          r={chiTiet}
          onClose={() => setChiTiet(null)}
          onGiaiTrinh={() => { setGiaiTrinh(chiTiet); setChiTiet(null); }}
          onGoThe={() => { setGoThe(chiTiet); setChiTiet(null); }}
        />
      )}
      {giaiTrinh && (
        <HopNhap
          tieuDe={t("Giải trình quá hạn — {a}", { a: giaiTrinh.doi_tuong_id })}
          moTa={`${t(giaiTrinh.ten_buoc)} · ${t("trễ {a}", { a: gioTre(giaiTrinh.so_gio_tre) })}`}
          nhan={t("Nội dung giải trình")}
          toiThieu={5}
          onClose={() => setGiaiTrinh(null)}
          onGui={async (nd) => {
            await api.post(`/vi-pham/${giaiTrinh.id}/giai-trinh`, { noi_dung: nd });
            addToast(t("Đã ghi giải trình"));
            setGiaiTrinh(null);
            lamMoi();
          }}
        />
      )}
      {goThe && (
        <HopNhap
          tieuDe={t("Gỡ thẻ vi phạm — {a}", { a: goThe.doi_tuong_id })}
          moTa={t("Thẻ gỡ vẫn lưu lịch sử và đối tác vẫn nhận được trạng thái \"Đã gỡ thẻ\".")}
          nhan={t("Lý do gỡ")}
          toiThieu={3}
          onClose={() => setGoThe(null)}
          onGui={async (nd) => {
            await api.post(`/vi-pham/${goThe.id}/go-the`, { ly_do: nd });
            addToast(t("Đã gỡ thẻ"));
            setGoThe(null);
            lamMoi();
          }}
        />
      )}
    </div>
  );
}

/** Chi tiet: luong ngang (Vao buoc → Han → Roi buoc → Giai trinh / Gan the) + "Xem chi tiet" xo toan bo thong tin. */
function ChiTietViPham({ r, onClose, onGiaiTrinh, onGoThe }: { r: ViPhamRow; onClose: () => void; onGiaiTrinh: () => void; onGoThe: () => void }) {
  const [mo, setMo] = useState(false);
  type Moc = { nhan: string; luc: string | null; kieu: "xong" | "dang" | "tre" | "chua" | "do" };
  const moc: Moc[] = [
    { nhan: t("Vào bước"), luc: r.moc_vao, kieu: "xong" },
    { nhan: t("Hạn {n}h", { n: r.so_gio_sla }), luc: r.han, kieu: "tre" },
    { nhan: r.dang_cho ? t("Đang chờ xử lý") : t("Rời bước"), luc: r.ket_thuc_luc, kieu: r.dang_cho ? "dang" : "xong" },
    r.trang_thai === "Cho giai trinh"
      ? { nhan: t("Chờ giải trình"), luc: r.han_giai_trinh, kieu: "dang" }
      : r.trang_thai === "Da giai trinh"
        ? { nhan: t("Đã giải trình"), luc: r.giai_trinh_luc, kieu: "xong" }
        : r.trang_thai === "Gan the"
          ? { nhan: t("Gắn thẻ vi phạm"), luc: r.gan_the_luc, kieu: "do" }
          : { nhan: t("Đã gỡ thẻ"), luc: r.go_the_luc, kieu: "xong" },
  ];
  const mau: Record<Moc["kieu"], string> = {
    xong: "var(--color-success)",
    dang: "var(--color-warning)",
    tre: "var(--color-danger)",
    chua: "var(--color-border)",
    do: "var(--color-danger)",
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("Quá hạn — {a}", { a: r.doi_tuong_id })}
      width="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          {r.duoc_go_the && r.trang_thai === "Gan the" && <Btn variant="ghost" onClick={onGoThe}>{t("Gỡ thẻ")}</Btn>}
          {r.duoc_giai_trinh && <Btn onClick={onGiaiTrinh}>{t("Giải trình")}</Btn>}
        </div>
      }
    >
      <div className="text-sm mb-3">
        <b>{t(r.ten_buoc)}</b> · {t(r.ten_bo_phan)} · {t("trễ {a}", { a: gioTre(r.so_gio_tre) })}{" "}
        <Badge tone={TONE_TT[r.trang_thai]}>{t(NHAN_TT[r.trang_thai])}</Badge>
      </div>
      <div className="relative flex justify-between px-2 pt-2 pb-1">
        <div className="absolute left-6 right-6 top-[15px] h-[2px] bg-[var(--color-border)]" />
        {moc.map((m, i) => (
          <div key={i} className="relative flex flex-col items-center text-center w-1/4" title={m.luc ?? ""}>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ background: mau[m.kieu] }} />
            <span className="mt-1 text-xs font-semibold">{m.nhan}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">{ngayGio(m.luc)}</span>
          </div>
        ))}
      </div>
      {r.giai_trinh && (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
          <div className="text-xs text-[var(--color-text-muted)] mb-1">
            {t("Giải trình")} · {r.nguoi_giai_trinh_ten ?? r.nguoi_giai_trinh} · {ngayGio(r.giai_trinh_luc)}
            {r.giai_trinh_tu_dong && ` · ${t("lấy từ lý do chậm đã nhập")}`}
          </div>
          {r.giai_trinh}
        </div>
      )}
      <button className="mt-3 text-sm text-[var(--color-primary)] font-semibold" onClick={() => setMo((x) => !x)}>
        {mo ? `▴ ${t("Thu gọn")}` : `▾ ${t("Xem chi tiết")}`}
      </button>
      {mo && (
        <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
          <dt className="text-[var(--color-text-muted)]">{t("Đơn / phiếu")}</dt>
          <dd><MaDoiTuong r={r} />{r.doi_tuong === "phieu" && r.don_ids.length > 0 && <span className="text-[var(--color-text-muted)]"> · {t("{n} đơn", { n: r.don_ids.length })}</span>}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Loại")}</dt><dd>{t(NHAN_LOAI[r.loai])}</dd>
          {r.ma_lk && (<><dt className="text-[var(--color-text-muted)]">{t("Linh kiện")}</dt><dd>{r.ma_lk} · {r.ten_lk}</dd></>)}
          {(r.ma_yeu_cau_su_co || r.ma_lada) && (<><dt className="text-[var(--color-text-muted)]">{t("Mã YCSC / Lada")}</dt><dd>{[r.ma_yeu_cau_su_co, r.ma_lada].filter(Boolean).join(" · ")}</dd></>)}
          <dt className="text-[var(--color-text-muted)]">{t("Khu vực")}</dt><dd>{r.khu_vuc_ma ?? "—"}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Người nhận hàng")}</dt><dd>{r.nguoi_nhan_hang_ten ?? r.nguoi_nhan_hang ?? "—"}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Vào bước")}</dt><dd>{r.moc_vao}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Hạn")}</dt><dd>{r.han} ({r.so_gio_sla}h)</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Rời bước")}</dt>
          <dd>{r.ket_thuc_luc ? `${r.ket_thuc_luc} · ${r.nguoi_xu_ly_ten ?? r.nguoi_xu_ly ?? t("Hệ thống")} · ${r.trang_thai_sau ?? ""}` : t("Đang chờ")}</dd>
          <dt className="text-[var(--color-text-muted)]">{t("Hạn giải trình")}</dt><dd>{r.han_giai_trinh}</dd>
          {r.gan_the_luc && (<><dt className="text-[var(--color-text-muted)]">{t("Gắn thẻ lúc")}</dt><dd>{r.gan_the_luc}</dd></>)}
          {r.go_the_luc && (<><dt className="text-[var(--color-text-muted)]">{t("Gỡ thẻ")}</dt><dd>{r.go_the_luc} · {r.go_the_boi} · {r.go_the_ly_do}</dd></>)}
        </dl>
      )}
    </Modal>
  );
}

function HopNhap({ tieuDe, moTa, nhan, toiThieu, onClose, onGui }: {
  tieuDe: string; moTa: string; nhan: string; toiThieu: number; onClose: () => void; onGui: (nd: string) => Promise<void>;
}) {
  const [nd, setNd] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const gui = useMutation({ mutationFn: () => onGui(nd.trim()), onError: (e) => setLoi(describeApiError(e)) });
  return (
    <Modal
      open
      onClose={onClose}
      title={tieuDe}
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>{t("Huỷ")}</Btn>
          <Btn loading={gui.isPending} disabled={nd.trim().length < toiThieu} onClick={() => { setLoi(null); gui.mutate(); }}>{t("Gửi")}</Btn>
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-muted)] mb-2">{moTa}</p>
      <label className="text-sm font-semibold">{nhan} *</label>
      <textarea className="mt-1 w-full rounded-lg border border-[var(--color-border)] p-2 text-sm min-h-[110px]" value={nd} maxLength={2000} onChange={(e) => setNd(e.target.value)} autoFocus />
      {loi && <p className="text-sm text-[var(--color-danger)] mt-1">{loi}</p>}
    </Modal>
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
        <p className="text-sm text-[var(--color-text-muted)] flex-1">
          {t("Hạn tính từ lúc đơn / phiếu vào bước. Không tính cuối tuần: hạn rơi vào T7/CN thì dời sang thứ Hai. Đổi cấu hình chỉ áp cho ca ghi nhận sau đó. Hệ thống tự quét mỗi giờ.")}
        </p>
        <Btn variant="ghost" loading={quet.isPending} onClick={() => quet.mutate()}>{t("Quét ngay")}</Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
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
                  <td className="text-xs text-[var(--color-text-muted)]">{b.cap_nhat_luc ? `${ngayGio(b.cap_nhat_luc)} · ${b.cap_nhat_boi}` : "—"}</td>
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
