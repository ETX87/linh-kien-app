import { useState } from "react";
import type { LoaiMoc, Luong, Moc } from "./noiDung";

// Luong quy trinh NGANG dang duong (quy uoc UI chung "chi tiet = luong ngang + ▾ Xem chi tiet") - cung kieu node tron + duong noi
// cua PxkMiniPipeline (datMuaLinhKien/PipelineFlow.tsx), mau theo LOAI moc thay vi da qua/dang o vi day la so do giai thich.

export const MAU_MOC: Record<LoaiMoc, { nen: string; nhat: string; chu: string; nhan: string; icon: string }> = {
  bat_dau: { nen: "var(--color-primary)", nhat: "var(--color-primary-soft)", chu: "var(--color-primary-dark)", nhan: "Bắt đầu", icon: "▶" },
  tu_dong: { nen: "var(--color-purple)", nhat: "var(--color-purple-soft)", chu: "var(--color-purple-strong)", nhan: "Hệ thống tự động", icon: "⚙" },
  cho: { nen: "var(--color-warning)", nhat: "var(--color-warning-soft)", chu: "var(--color-warning-strong)", nhan: "Chờ người xử lý", icon: "⏳" },
  xong: { nen: "var(--color-success)", nhat: "var(--color-success-soft)", chu: "var(--color-success-strong)", nhan: "Hoàn tất", icon: "✓" },
  huy: { nen: "var(--color-danger)", nhat: "var(--color-danger-soft)", chu: "var(--color-danger-strong)", nhan: "Hủy / từ chối", icon: "✕" },
};

export function ChuGiai() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--color-text-secondary)]">
      {(Object.keys(MAU_MOC) as LoaiMoc[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: MAU_MOC[k].nen }} />
          {MAU_MOC[k].nhan}
        </span>
      ))}
    </div>
  );
}

function DanhSach({ tieuDe, dong }: { tieuDe: string; dong?: string[] }) {
  if (!dong || dong.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1">{tieuDe}</div>
      <ul className="space-y-1">
        {dong.map((d, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-[var(--color-text-body)]">
            <span className="text-[var(--color-text-faint)] shrink-0">•</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChiTietMoc({ moc, gon = false }: { moc: Moc; gon?: boolean }) {
  const m = MAU_MOC[moc.loai];
  return (
    <div className={`rounded-[var(--radius-card)] border border-[var(--color-border-soft)] ${gon ? "p-3" : "p-4"}`} style={{ borderLeft: `3px solid ${m.nen}` }}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[14px] font-bold text-[var(--color-text)]">{moc.ten}</span>
        <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-[var(--radius-badge)] text-[11px] font-semibold" style={{ background: m.nhat, color: m.chu }}>
          {m.icon} {m.nhan}
        </span>
        {moc.ma && <code className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-neutral-soft)] text-[var(--color-text-secondary)]">{moc.ma}</code>}
      </div>
      <div className="text-[12px] text-[var(--color-text-secondary)] mb-2">
        <span className="font-semibold">Ai xử lý:</span> {moc.ai}
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--color-text-body)] mb-3">{moc.moTa}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <DanhSach tieuDe="Điều kiện" dong={moc.dieuKien} />
        <DanhSach tieuDe="Bước kế tiếp" dong={moc.tiepTheo} />
        <DanhSach tieuDe="Hệ thống tự làm" dong={moc.tuDong} />
        <DanhSach tieuDe="Lưu ý" dong={moc.luuY} />
      </div>
    </div>
  );
}

export function LuongNgang({ luong, chon, onChon }: { luong: Luong; chon: string | null; onChon: (key: string) => void }) {
  const [moRong, setMoRong] = useState(false);
  const mocChon = luong.moc.find((x) => x.key === chon) ?? luong.moc[0];
  return (
    <div>
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex w-max min-w-full">
          {luong.moc.map((moc, i) => {
            const m = MAU_MOC[moc.loai];
            const dangChon = moc.key === mocChon.key;
            const cuoi = i === luong.moc.length - 1;
            return (
              <button
                key={moc.key}
                type="button"
                onClick={() => onChon(moc.key)}
                title={`${moc.ten} — ${moc.ai}`}
                className="focus-ring group relative flex flex-col items-center flex-1 min-w-[112px] rounded-lg pt-1 pb-1.5"
              >
                {!cuoi && <div className="absolute top-[22px] h-0.5" style={{ left: "50%", width: "100%", background: "var(--color-border)" }} />}
                <div
                  className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white transition-transform group-hover:scale-110"
                  style={{ background: m.nen, boxShadow: dangChon ? `0 0 0 4px ${m.nhat}, 0 0 0 5px ${m.nen}` : undefined }}
                >
                  {moc.loai === "xong" || moc.loai === "huy" ? m.icon : i + 1}
                </div>
                <span
                  className="mt-2 text-[11px] font-semibold text-center leading-tight px-1"
                  style={{ color: dangChon ? "var(--color-text)" : "var(--color-text-secondary)" }}
                >
                  {moc.ten}
                </span>
                <span className="mt-0.5 text-[10px] text-center leading-tight px-1 text-[var(--color-text-faint)] line-clamp-2">{moc.ai.split(/[;(]/)[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <ChiTietMoc moc={mocChon} />
      </div>

      {luong.nhanh && luong.nhanh.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {luong.nhanh.map((n) => {
            const m = MAU_MOC[n.loai];
            return (
              <div key={n.ten} className="rounded-lg px-3 py-2.5" style={{ background: m.nhat }}>
                <div className="text-[12px] font-bold mb-0.5" style={{ color: m.chu }}>
                  ↳ {n.ten}
                </div>
                <div className="text-[12px] leading-snug text-[var(--color-text-body)]">{n.moTa}</div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setMoRong((v) => !v)} className="focus-ring mt-3 text-[12px] font-semibold text-[var(--color-link)] hover:underline">
        {moRong ? "▴ Thu gọn" : `▾ Xem chi tiết (${luong.moc.length} bước)`}
      </button>
      {moRong && (
        <ol className="mt-2 space-y-2">
          {luong.moc.map((moc) => (
            <li key={moc.key}>
              <ChiTietMoc moc={moc} gon />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
