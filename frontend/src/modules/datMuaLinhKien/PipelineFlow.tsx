import { useState, useEffect, useRef } from "react";
import { Btn } from "../../components/x/Btn";
import type { LuongQuyTrinhStep, JumpTarget } from "./types";
import { moViec, type ViecCanLam } from "./viecCanLam";
import { STEP_SHORT_LABEL, STEP_DESCRIPTION, PIPELINE_NOTCH, PXK_TRANG_THAI_TONE, PXK_MINI_STEPS, PXK_MINI_LABEL, PXK_MINI_NHANH_RE } from "./constants";
import { t } from "../../i18n";

// "Luong quy trinh" pipeline UI (thanh chevron so dem theo buoc) dung chung boi DatMuaLinhKienModule
// (tab tong quan) va PhieuXuatKhoTab (mini-pipeline PXK) - tach tu DatMuaLinhKienModule.tsx (UI
// redesign Phase 3, phan hoi Codex 2026-08-19).

// "Viec cua toi" (UI redesign phan hoi Codex 2026-08-19, muc P1#1) - loc TRUC TIEP tu du lieu
// luong-quy-trinh da co san (khong goi API moi, khong them logic nghiep vu moi) lay dung cac buoc
// isMine (roleKeys giao voi myRoleKeys) VA count>0, sap xep giam dan theo so luong - dat NGAY dau
// trang thay vi phai bam sang tab "Bao cao" moi thay (truoc do StatCard tuong tu chi nam trong
// BaoCaoTab). Tai su dung StatCard (size sm) de dong bo hinh anh voi BaoCaoTab, khong tao pattern
// chip moi rieng.
// FIX (phan hoi "Cần làm 19 nhưng Việc của tôi cộng lại chỉ 17"): truoc day nhan `steps` KIEU
// LuongQuyTrinhStep[] (nguon /luong-quy-trinh, 16 subquery, TAT tren mobile) - lech voi con so tieu de
// "Cần làm [N]" o DatMuaLinhKienModule.tsx (lay tu /home-summary.canLam, nguon DUNG duy nhat theo
// comment dau file backend). Rong hon: 2 nguon con GAN roleKeys KHAC NHAU cho cung 1 trang thai (vd PXK
// "Dang gui KTV" - luong-quy-trinh gan roleKeys:["ktv"], home-summary gan roleKeys:["kho"] vi day la
// buoc Kho theo doi cho KTV xac nhan) khien Kho thay so trong tieu de nhung KHONG thay dong tuong ung o
// day. Sua: nhan truc tiep cac dong dangTonSteps.isCanLam (home-summary) tu component cha - dung
// SHAPE toi thieu (khong con phu thuoc LuongQuyTrinhStep/countCuaToi) de nhan duoc CA LuongQuyTrinhStep
// LAN DangTonStep, tong luon khop DUNG canLam.
export function MyWorkloadStrip({ viec, onJump }: { viec: ViecCanLam[]; onJump: (t: JumpTarget) => void }) {
  // v1.450: nguon = danhSachViecCanLam() (viecCanLam.ts, /notifications/count) - CUNG so voi o "Cần làm" Trang chu + badge menu.
  if (viec.length === 0) return null;
  return (
    <div className="no-scrollbar -mx-4 mb-2 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="text-[11px] font-semibold text-[var(--ink-500)] uppercase tracking-wide shrink-0">{t("Việc của tôi")}</span>
      {viec.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => moViec(s, onJump)}
          className="focus-ring shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] hover:brightness-95 text-[var(--color-warning-strong)] pl-2.5 pr-1.5 py-1 text-xs font-semibold transition-all"
        >
          {t(s.label)}
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-warning)] text-white text-[10px] font-bold leading-none">
            {s.count > 99 ? "99+" : s.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function pipelineChevronClip(hasLeftNotch: boolean, hasRightPoint: boolean): string {
  const d = PIPELINE_NOTCH;
  const pts = ["0 0", hasRightPoint ? `calc(100% - ${d}px) 0` : "100% 0"];
  if (hasRightPoint) pts.push("100% 50%");
  pts.push(hasRightPoint ? `calc(100% - ${d}px) 100%` : "100% 100%", "0 100%");
  if (hasLeftNotch) pts.push(`${d}px 50%`);
  return `polygon(${pts.join(", ")})`;
}
// DOI GIAO DIEN (phan hoi ra soat "demo giao diện" 2026-09-09: "Giao diện demo 2 (bước PXK)" - stepper
// tron so + nhan duoi, khop concept-1-structured-neutral.html pattern ".stepper" phien ban tron) - THAY
// THE hoan toan dang pill/chevron cu (rounded-full + clip-path). Truoc day co 1 <Stepper> rieng (underline
// tab, xem git history) bi GO 2026-09-08 vi KHONG hien duoc 3 trang thai nhanh re (Ke toan huy/Hang tru
// kho/Kho da ket thuc) - LAN NAY giu nguyen dung y stepper tron cua demo CHO 5 buoc chinh, VA THEM 1 nut
// tron rieng o cuoi (mau/icon khac han, ✕/⏹) cho nhanh re thay vi bo qua kha nang hien thi nhu <Stepper>
// cu - khong danh doi thong tin nghiep vu de lay dung hinh thuc demo (da xac nhan huong nay voi nguoi
// dung truoc khi doi).
export function PxkMiniPipeline({ trangThai }: { trangThai: string }) {
  const idxHienTai = PXK_MINI_STEPS.indexOf(trangThai as (typeof PXK_MINI_STEPS)[number]);
  const isNhanhRe = PXK_MINI_NHANH_RE.has(trangThai);
  const nhanhReTone = PXK_TRANG_THAI_TONE[trangThai] === "success" ? "var(--color-success)" : "var(--color-text-faint)";
  // SUA (phan hoi 2026-09-22 "TN hủy phiếu nhưng đang hiện là kế toán hủy") - nhan trung tinh vai tro,
  // xem giai thich day du o constants.ts PXK_TRANG_THAI_OPTIONS.
  const nhanhReLabel = trangThai === "Ke toan huy" ? t("Đã huỷ") : trangThai === "Hang tru kho" ? t("Trừ kho") : t("Kết thúc");
  const nhanhReIcon = trangThai === "Ke toan huy" ? "✕" : "⏹";
  return (
    <div className="mb-3 overflow-x-auto pb-0.5">
      <div className="flex w-max min-w-full">
        {PXK_MINI_STEPS.map((s, i) => {
          const isLastCol = i === PXK_MINI_STEPS.length - 1 && !isNhanhRe;
          // "Da qua"/"dang o" chi co y nghia khi con dang di tren truc chinh (idxHienTai>=0) - neu da
          // re nhanh, ca 5 buoc chinh deu coi la nen/trung tinh (khong node nao to dam), dung mau rieng
          // cho nut nhanh re o cuoi thay vi to sai 1 trong 5 buoc chinh.
          const daQua = idxHienTai >= 0 && i < idxHienTai;
          const dangO = idxHienTai >= 0 && i === idxHienTai;
          return (
            <div key={s} className="relative flex flex-col items-center shrink-0" style={{ width: 76 }}>
              {/* Duong noi sang node KE TIEP - ve bang absolute (tu tam node nay sang tam node ke,
                  dung do rong cot co dinh) thay vi border giua cac the roi ghep hinh hoc nhu ban
                  chevron cu, don gian hoa dang ke voi dang tron nay. */}
              {!isLastCol && (
                <div
                  className="absolute top-4 h-0.5"
                  style={{ left: "50%", width: "100%", background: daQua ? "var(--color-success)" : "var(--color-border)" }}
                />
              )}
              <div
                className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0"
                style={
                  dangO
                    ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "white" }
                    : daQua
                      ? { background: "var(--color-success)", borderColor: "var(--color-success)", color: "white" }
                      : { background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-faint)" }
                }
              >
                {daQua ? "✓" : i + 1}
              </div>
              <span
                className="mt-1.5 text-[10px] font-semibold text-center leading-tight px-0.5"
                style={{ color: dangO ? "var(--color-text)" : daQua ? "var(--color-success)" : "var(--color-text-faint)" }}
              >
                {t(PXK_MINI_LABEL[s])}
              </span>
            </div>
          );
        })}
        {isNhanhRe && (
          <div className="relative flex flex-col items-center shrink-0" style={{ width: 76 }}>
            <div
              className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 text-white"
              style={{ background: nhanhReTone, borderColor: nhanhReTone }}
            >
              {nhanhReIcon}
            </div>
            <span className="mt-1.5 text-[10px] font-semibold text-center leading-tight px-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {nhanhReLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
