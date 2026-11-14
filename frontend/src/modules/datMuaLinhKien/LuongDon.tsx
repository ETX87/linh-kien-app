import { useState } from "react";
import { Badge, type Tone } from "../../components/x/Badge";
import { fmtDateTime } from "../../types";
import { t, dichSau } from "../../i18n";
import { DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL } from "./constants";
import { trangThaiLabel } from "./helpers";
import type { DonHangLogRow } from "./types";

// LUONG QUY TRINH CUA 1 DON + TEN TRANG THAI THEO BUOC (chot 2026-11-14, v1.494):
//  - "trong giao diện đơn hàng, thêm 1 luồng mô tả luồng quy trình của đơn hàng đó đang ở đâu, khi KTV click xem 1 đơn hàng họ có thể
//    nhanh chóng hình dung ra đơn của mình đang ở đâu"
//  - "Thay đổi tên trạng thái 1 đơn hàng theo đúng các bước trong luồng quy trình đó. ví dụ TN duyệt => giờ hầu như không còn vai trò tác
//    nghiệp nữa => thay thế vào đó là trạng thái hiện tại của đơn trong phiếu"
// 1 NGUON DUY NHAT `viTriDon()` suy ra buoc hien tai tu: trang thai don (trang_thai_hien_tai) + buoc cua PHIEU chua don (ma
// trang_thai_pxk / thanh_toan - backend lib/trangThaiDonPxk.ts, cung ma voi cot danh sach). Luong ngang (`LuongDon`) va nhan trang thai
// (`TrangThaiDonBadge` - danh sach, the mobile, chi tiet) cung doc ham nay nen khong bao gio lech nhau. Doi luong o backend
// (tuDongDuyet.ts / trangThaiDonPxk.ts) thi sua bang o day. Kieu dang = PxkMiniPipeline (PipelineFlow.tsx): node tron + duong noi.

type DonVao = {
  trang_thai?: string | null;
  trang_thai_hien_tai?: string | null;
  loai_don?: string | null;
  trang_thai_pxk?: string | null;
  thanh_toan?: string | null;
  ngay_tao?: string | null;
  nguon_ngoai?: string | null;
  logs?: DonHangLogRow[];
};

type KhoaBuoc = "dat" | "duyet" | "tien" | "ketoan" | "kho" | "giao" | "nhan" | "kt_mem" | "kho_xn" | "qc" | "kho_nhan";
const TEN_BUOC: Record<KhoaBuoc, string> = {
  dat: dichSau("Đặt đơn"),
  duyet: dichSau("Duyệt & kiểm kho"),
  tien: dichSau("Chuyển tiền"),
  ketoan: dichSau("Kế toán chốt"),
  kho: dichSau("Kho xuất hàng"),
  giao: dichSau("Giao KTV"),
  nhan: dichSau("KTV đã nhận"),
  kt_mem: dichSau("Kế toán duyệt"),
  kho_xn: dichSau("Kho xác nhận"),
  qc: dichSau("QC kiểm tra"),
  kho_nhan: dichSau("Kho nhận hàng trả"),
};
const LUONG_MUA: KhoaBuoc[] = ["dat", "duyet", "tien", "ketoan", "kho", "giao", "nhan"];
const LUONG_TRA: KhoaBuoc[] = ["dat", "kt_mem", "kho_xn", "qc", "ketoan", "kho_nhan"];

export type ViTriDon = {
  luong: KhoaBuoc[];
  hienTai: number; // chi so buoc dang o (== luong.length => da xong het)
  boQua: Set<KhoaBuoc>;
  nhan: string; // ten trang thai hien thi (thay "TN đã duyệt"...)
  ai: string | null; // dang cho ai
  tone: Tone;
  ketThuc: "xong" | "huy" | null;
};

const vt = (luong: KhoaBuoc[], buoc: KhoaBuoc | "xong", nhan: string, ai: string | null, tone: Tone, boQua: KhoaBuoc[] = [], ketThuc: ViTriDon["ketThuc"] = null): ViTriDon => ({
  luong,
  hienTai: buoc === "xong" ? luong.length : luong.indexOf(buoc),
  boQua: new Set(boQua),
  nhan,
  ai,
  tone,
  ketThuc,
});

// null = khong ve luong (don dong bo tu app Sua chua - co trang thai rieng).
export function viTriDon(d: DonVao): ViTriDon | null {
  const tt = d.trang_thai ?? d.trang_thai_hien_tai ?? "";
  if (d.nguon_ngoai || tt.startsWith("SC ")) return null;
  const pxk = d.trang_thai_pxk ?? "";
  const canTien = !["khong_can", "cong_no_doi_tac"].includes(d.thanh_toan ?? "");
  const boQuaTien: KhoaBuoc[] = canTien ? [] : ["tien"];

  if (d.loai_don === "tra_hang") {
    const L = LUONG_TRA;
    switch (tt) {
      case "Cho ke toan duyet mem": return vt(L, "kt_mem", dichSau("Chờ Kế toán duyệt hàng trả"), dichSau("Kế toán"), "warning");
      case "Cho kho xac nhan": return vt(L, "kho_xn", dichSau("Chờ Kho xác nhận hàng trả"), dichSau("Kho"), "warning");
      case "Cho QC xac nhan": return vt(L, "qc", dichSau("Chờ QC kiểm tra"), dichSau("QC"), "warning");
      case "Cho TN duyet tong": return vt(L, "qc", dichSau("Chờ duyệt tổng"), dichSau("Tác nghiệp / Kế toán"), "warning");
      case "Tu choi": case "TN tu choi": return vt(L, "xong", dichSau("Bị từ chối"), null, "danger", [], "huy");
      case "Da huy": return vt(L, "xong", dichSau("Đã hủy"), null, "neutral", [], "huy");
      case "TN da duyet":
        if (pxk === "cho_kho_nhan_hang_tra") return vt(L, "kho_nhan", dichSau("Chờ Kho nhận hàng trả"), dichSau("Kho"), "warning");
        if (pxk === "kho_da_nhan_hang_tra" || pxk === "kho_da_ket_thuc") return vt(L, "xong", dichSau("Kho đã nhận hàng trả"), null, "success", [], "xong");
        if (pxk === "phieu_da_huy") return vt(L, "ketoan", dichSau("Phiếu đã hủy — chờ vào phiếu mới"), dichSau("Kế toán"), "neutral");
        if (pxk === "cho_ke_toan_chot") return vt(L, "ketoan", dichSau("Kế toán đang chốt phiếu trả"), dichSau("Kế toán"), "warning");
        return vt(L, "ketoan", dichSau("QC đã duyệt — chờ chốt phiếu trả"), dichSau("Kế toán"), "info");
      default: return null;
    }
  }

  const L = LUONG_MUA;
  switch (tt) {
    case "Cho Tram duyet": return vt(L, "duyet", dichSau("Chờ Trạm duyệt"), dichSau("Trạm"), "warning", boQuaTien);
    case "Cho TBP xac nhan": return vt(L, "duyet", dichSau("Chờ TBP duyệt (LK đặc thù)"), dichSau("TBP DVBH"), "warning", boQuaTien);
    case "Cho GS duyet": return vt(L, "duyet", dichSau("Chờ GS duyệt (vượt trần)"), dichSau("Giám sát khu vực"), "purple", boQuaTien);
    case "Cho TN duyet": return vt(L, "duyet", dichSau("Chờ duyệt đơn"), dichSau("Kế toán / Tác nghiệp"), "warning", boQuaTien);
    case "Cho hang": return vt(L, "duyet", dichSau("Chờ hàng về kho"), dichSau("Kho / Mua hàng"), "warning", boQuaTien);
    case "Cho thanh toan":
      return pxk === "cho_xac_nhan_chuyen_tien"
        ? vt(L, "tien", dichSau("Kho thiếu — chờ Kế toán xác nhận tiền"), dichSau("Kế toán"), "warning")
        : vt(L, "tien", dichSau("Kho thiếu — chờ chuyển tiền trước"), dichSau("KTV chuyển tiền"), "warning");
    case "TN tu choi": case "Tu choi": return vt(L, "xong", dichSau("Bị từ chối"), null, "danger", boQuaTien, "huy");
    case "Da huy": return vt(L, "xong", dichSau("Đã hủy"), null, "neutral", boQuaTien, "huy");
    case "TN da duyet":
      switch (pxk) {
        case "cho_ktv_chuyen_tien": return vt(L, "tien", dichSau("Chờ KTV chuyển tiền"), dichSau("KTV chuyển tiền"), "warning");
        case "cho_xac_nhan_chuyen_tien": return vt(L, "tien", dichSau("Chờ Kế toán xác nhận tiền"), dichSau("Kế toán"), "warning", boQuaTien);
        case "cho_gui_ke_toan": return vt(L, "ketoan", dichSau("Đã đủ tiền — chờ gửi Kế toán"), dichSau("Kế toán"), "info", boQuaTien);
        case "cho_ke_toan_chot": return vt(L, "ketoan", dichSau("Kế toán đang chốt phiếu"), dichSau("Kế toán"), "warning", boQuaTien);
        case "cho_kho_gui_hang": return vt(L, "kho", dichSau("Kho đang xuất hàng"), dichSau("Kho"), "warning", boQuaTien);
        case "cho_ktv_xac_nhan": return vt(L, "giao", dichSau("Đang giao — chờ KTV xác nhận"), dichSau("KTV nhận hàng"), "warning", boQuaTien);
        case "ktv_da_nhan": return vt(L, "xong", dichSau("KTV đã nhận hàng"), null, "success", boQuaTien, "xong");
        case "kho_da_ket_thuc": return vt(L, "xong", dichSau("Hoàn tất"), null, "success", boQuaTien, "xong");
        case "hang_tru_kho": return vt(L, "xong", dichSau("Đã trừ kho (hoàn tất)"), null, "success", [...boQuaTien, "kho", "giao"], "xong");
        case "phieu_da_huy": return vt(L, "ketoan", dichSau("Phiếu đã hủy — chờ vào phiếu mới"), dichSau("Kế toán"), "neutral", boQuaTien);
        default:
          // Chua vao phieu: con thieu tien -> buoc Chuyen tien, du tien / khong can -> cho vao phieu (Ke toan).
          return canTien && d.thanh_toan === "cho_thanh_toan"
            ? vt(L, "tien", dichSau("Đã duyệt — chờ vào phiếu chuyển tiền"), dichSau("Hệ thống / Kế toán"), "info")
            : vt(L, "ketoan", dichSau("Đã duyệt — chờ vào phiếu xuất"), dichSau("Hệ thống / Kế toán"), "info", boQuaTien);
      }
    default:
      return null;
  }
}

// Nhan trang thai cua don THEO BUOC (thay "TN đã duyệt" bang buoc that trong phieu). Khong suy duoc -> nhan cu.
export function nhanTrangThaiDon(d: DonVao): { nhan: string; tone: Tone } {
  const v = viTriDon(d);
  if (v) return { nhan: t(v.nhan), tone: v.tone };
  const tt = d.trang_thai ?? d.trang_thai_hien_tai ?? "";
  return { nhan: trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, tt), tone: "neutral" };
}

export function TrangThaiDonBadge({ d, phu = false, tones }: { d: DonVao; phu?: boolean; tones?: Record<string, Tone> }) {
  const v = viTriDon(d);
  const tt = d.trang_thai ?? d.trang_thai_hien_tai ?? "";
  const nhan = v ? t(v.nhan) : trangThaiLabel(DON_CUA_TOI_TRANG_THAI_OPTIONS_ALL, tt);
  const tone = v ? v.tone : (tones?.[tt] ?? "neutral");
  return <Badge tone={tone} variant={phu ? "dot" : "soft"}>{nhan}</Badge>;
}

// Gio HOAN TAT tung buoc: log don (lan gan nhat vao trang thai sau buoc) + nhat ky phieu (moc_log, lan gan nhat phieu vao buoc).
function gioBuoc(k: KhoaBuoc, d: DonVao, moc: Record<string, string>): string | null {
  const logLuc = (...tt: string[]) => {
    const ds = (d.logs ?? []).filter((l) => tt.includes(l.trang_thai)).map((l) => l.ngay_xu_ly);
    return ds.length ? ds.sort().at(-1)! : null;
  };
  switch (k) {
    case "dat": return d.ngay_tao ?? null;
    case "duyet": return logLuc("TN da duyet", "Cho thanh toan");
    case "tien": return moc["Ke toan da duyet bang chung chuyen tien"] ?? moc["Tru quy du"] ?? null;
    case "ketoan": return moc["Da chot xong don xuat"] ?? moc["Hang tru kho"] ?? null;
    case "kho": return moc["Dang gui KTV"] ?? null;
    case "giao": case "nhan": return moc["KTV da nhan"] ?? moc["Kho da ket thuc"] ?? moc["Hang tru kho"] ?? null;
    case "kt_mem": return logLuc("Cho kho xac nhan");
    case "kho_xn": return logLuc("Cho QC xac nhan");
    case "qc": return logLuc("TN da duyet", "Cho TN duyet tong");
    case "kho_nhan": return moc["Kho da nhan hang tra"] ?? null;
  }
}

function gioNgan(s: string | null): string {
  if (!s) return "";
  const f = fmtDateTime(s); // dd/mm/yyyy hh:mm
  const m = /^(\d{2}\/\d{2})\/\d{4},?\s*(\d{2}:\d{2})/.exec(f);
  return m ? `${m[2]} ${m[1]}` : f;
}
function khoangCach(truoc: string | null, sau: string | null): string {
  if (!truoc || !sau) return "";
  const ms = new Date(sau.replace(" ", "T")).getTime() - new Date(truoc.replace(" ", "T")).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "";
  const phut = Math.round(ms / 60_000);
  if (phut < 60) return `+${phut}′`;
  const gio = Math.round(phut / 60);
  return gio < 48 ? `+${gio}h` : `+${Math.round(gio / 24)}${t("ngày")}`;
}

// Luong ngang dang duong o dau chi tiet don + "▾ Xem chi tiết" xo danh sach doc (quy uoc UI chi tiet chung).
export function LuongDon({ d, mocPhieu }: { d: DonVao; mocPhieu?: string | null }) {
  const [mo, setMo] = useState(false);
  const v = viTriDon(d);
  if (!v) return null;
  let moc: Record<string, string> = {};
  try {
    moc = mocPhieu ? (JSON.parse(mocPhieu) as Record<string, string>) : {};
  } catch {
    moc = {};
  }
  const gio = v.luong.map((k) => gioBuoc(k, d, moc));
  const trangThaiBuoc = (i: number): "xong" | "dang" | "chua" | "bo_qua" | "huy" => {
    const k = v.luong[i];
    if (v.ketThuc === "huy") return i === 0 || gio[i] ? "xong" : "chua";
    if (v.boQua.has(k)) return "bo_qua";
    if (i < v.hienTai) return "xong";
    // Tien da tra truoc (vd don Cho hang mang tien) -> moc Chuyen tien xong du buoc truoc chua xong.
    if (k === "tien" && d.thanh_toan === "da_thanh_toan" && i > v.hienTai) return "xong";
    if (i === v.hienTai) return "dang";
    return "chua";
  };
  const mauDang = v.tone === "purple" ? "var(--color-purple)" : v.tone === "info" ? "var(--color-primary)" : v.tone === "neutral" ? "var(--color-text-faint)" : "var(--color-warning)";
  // Moc truoc gan nhat co gio (de tinh "+khoang cach").
  const gioTruoc = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (gio[j]) return gio[j];
    return null;
  };

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white">
      {/* Dong tom tat 1 giay: dang o dau + cho ai */}
      <div className="flex items-center gap-2 flex-wrap px-3 pt-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">{t("Đơn đang ở")}</span>
        <Badge tone={v.tone}>{t(v.nhan)}</Badge>
        {v.ai && (
          <span className="text-[12px] text-[var(--ink-600)]">
            · {t("Đang chờ")}: <b>{t(v.ai)}</b>
          </span>
        )}
        <button type="button" onClick={() => setMo((x) => !x)} className="focus-ring ml-auto text-[12px] font-semibold text-[var(--color-primary)] hover:underline">
          {mo ? t("▴ Thu gọn") : t("▾ Xem chi tiết")}
        </button>
      </div>
      <div className="overflow-x-auto px-2 pb-2.5 pt-2">
        <div className="flex w-max min-w-full">
          {v.luong.map((k, i) => {
            const st = trangThaiBuoc(i);
            const cuoi = i === v.luong.length - 1 && v.ketThuc !== "huy";
            const xongDuong = st === "xong" && (trangThaiBuoc(i + 1) === "xong" || trangThaiBuoc(i + 1) === "dang" || trangThaiBuoc(i + 1) === "bo_qua");
            const kc = st === "xong" ? khoangCach(gioTruoc(i), gio[i]) : "";
            const nen =
              st === "dang" ? { background: mauDang, borderColor: mauDang, color: "white", boxShadow: `0 0 0 4px color-mix(in srgb, ${mauDang} 22%, transparent)` }
              : st === "xong" ? { background: "var(--color-success)", borderColor: "var(--color-success)", color: "white" }
              : st === "bo_qua" ? { background: "var(--color-surface)", borderColor: "var(--color-border)", borderStyle: "dashed" as const, color: "var(--color-text-faint)" }
              : { background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-faint)" };
            return (
              <div
                key={k}
                className="relative flex flex-col items-center shrink-0 flex-1"
                style={{ minWidth: 92 }}
                title={`${t(TEN_BUOC[k])}${gio[i] ? " · " + fmtDateTime(gio[i]) : ""}${st === "dang" ? " · " + t(v.nhan) : st === "bo_qua" ? " · " + t("Bỏ qua") : ""}`}
              >
                {!cuoi && (
                  <div
                    className="absolute top-4 h-0.5"
                    style={{
                      left: "50%",
                      width: "100%",
                      background: xongDuong ? "var(--color-success)" : "transparent",
                      borderTop: xongDuong ? undefined : "2px dashed var(--color-border)",
                      height: xongDuong ? 2 : 0,
                    }}
                  />
                )}
                <div className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold" style={nen}>
                  {st === "xong" ? "✓" : st === "bo_qua" ? "–" : i + 1}
                </div>
                <span
                  className="mt-1.5 text-[11px] font-semibold text-center leading-tight px-1"
                  style={{ color: st === "dang" ? "var(--color-text)" : st === "xong" ? "var(--color-success-strong)" : "var(--color-text-faint)" }}
                >
                  {t(TEN_BUOC[k])}
                </span>
                <span className="text-[10px] text-center leading-tight text-[var(--ink-500)] min-h-[13px]">
                  {st === "xong" && gio[i] ? (
                    <>
                      {gioNgan(gio[i])}
                      {kc && <span className="text-[var(--ink-400)]"> {kc}</span>}
                    </>
                  ) : st === "dang" ? (
                    <b style={{ color: mauDang }}>{t("Đang xử lý")}</b>
                  ) : st === "bo_qua" ? (
                    t("Không cần")
                  ) : (
                    ""
                  )}
                </span>
              </div>
            );
          })}
          {v.ketThuc === "huy" && (
            <div className="relative flex flex-col items-center shrink-0 flex-1" style={{ minWidth: 92 }}>
              <div className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white" style={{ background: v.tone === "danger" ? "var(--color-danger)" : "var(--color-text-faint)", borderColor: v.tone === "danger" ? "var(--color-danger)" : "var(--color-text-faint)" }}>
                ✕
              </div>
              <span className="mt-1.5 text-[11px] font-semibold text-center leading-tight px-1 text-[var(--color-danger-strong)]">{t(v.nhan)}</span>
            </div>
          )}
        </div>
      </div>
      {mo && (
        <ol className="border-t border-[var(--line)] px-4 py-3 space-y-2">
          {v.luong.map((k, i) => {
            const st = trangThaiBuoc(i);
            return (
              <li key={k} className="flex items-start gap-3 text-[13px]">
                <span
                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    st === "xong" ? "bg-[var(--color-success)] text-white" : st === "dang" ? "text-white" : "border border-[var(--color-border)] text-[var(--ink-400)]"
                  }`}
                  style={st === "dang" ? { background: mauDang } : undefined}
                >
                  {st === "xong" ? "✓" : st === "bo_qua" ? "–" : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={st === "chua" || st === "bo_qua" ? "text-[var(--ink-400)]" : "font-semibold text-[var(--color-text)]"}>
                    {t(TEN_BUOC[k])}
                    {st === "dang" && <span className="ml-2 font-normal" style={{ color: mauDang }}>— {t(v.nhan)}{v.ai ? ` (${t("chờ")} ${t(v.ai)})` : ""}</span>}
                    {st === "bo_qua" && <span className="ml-2 font-normal">— {t("không cần với đơn này")}</span>}
                  </div>
                  {gio[i] && st !== "chua" && <div className="text-[11.5px] text-[var(--ink-500)]">{fmtDateTime(gio[i])}</div>}
                </div>
              </li>
            );
          })}
          {v.ketThuc === "huy" && (
            <li className="flex items-start gap-3 text-[13px]">
              <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-bold flex items-center justify-center">✕</span>
              <div className="font-semibold text-[var(--color-danger-strong)]">{t(v.nhan)} — {t("xem lý do ở Lịch sử xử lý")}</div>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
