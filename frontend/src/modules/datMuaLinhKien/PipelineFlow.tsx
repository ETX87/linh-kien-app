import { useState, useEffect, useRef } from "react";
import { Btn } from "../../components/x/Btn";
import type { LuongQuyTrinhStep, JumpTarget } from "./types";
import { STEP_SHORT_LABEL, STEP_DESCRIPTION, PIPELINE_NOTCH, PXK_TRANG_THAI_TONE, PXK_MINI_STEPS, PXK_MINI_LABEL, PXK_MINI_NHANH_RE } from "./constants";

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
export function MyWorkloadStrip({
  steps, myRoleKeys, onJump,
}: {
  steps: { key: string; label: string; count: number; roleKeys: string[]; tab: string; filter: string; loaiDon?: string }[];
  myRoleKeys: Set<string>;
  onJump: (t: JumpTarget) => void;
}) {
  const mine = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);
  if (mine.length === 0) return null;
  // SUA (phan hoi 2026-08-19 #4: "chiếm hẳn 1 dòng, và rất to") - doi tu luoi StatCard size="sm"
  // (moi the min-w-[110px], 2 dong noi dung, co border/shadow rieng) sang 1 HANG PILL GON, nhan +
  // so dem NAM CHUNG 1 dong duy nhat, dung dung ngon ngu badge tron do da co san o Tabs.tsx ("nhu
  // thong bao tin nhan") - tiet kiem dien tich doc dang ke so voi luoi the cu.
  // Mobile (< sm, 2026-09-29 ra soat giao dien mobile): 1 HANG cuon ngang thay vi wrap - truoc day 8 chip wrap
  // thanh 4 hang (~150px) day danh sach xuong duoi nua man hinh o MOI tab cua module.
  return (
    <div className="no-scrollbar -mx-4 mb-2 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="text-[11px] font-semibold text-[var(--ink-500)] uppercase tracking-wide shrink-0">Việc của tôi</span>
      {mine.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
          className="focus-ring shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] hover:brightness-95 text-[var(--color-warning-strong)] pl-2.5 pr-1.5 py-1 text-xs font-semibold transition-all"
        >
          {STEP_SHORT_LABEL[s.key] ?? s.label}
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-warning)] text-white text-[10px] font-bold leading-none">
            {s.count > 99 ? "99+" : s.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// Thanh dieu huong dang PIPELINE thay cho SummaryStrip cu. Vong 5: chu he thong van thay "xau" sau ca
// vong 3/4 dung ky thuat clip-path chevron long khop - RA SOAT LAI TOAN BO HINH HOC va phat hien 1 LOI
// THAT (khong phai gu tham my): moi doan chi dat CANH NHAU (khong chong len), nhung 1 notch "khuyet V"
// chi thuc su khop voi 1 diem nhon ("<" tao boi mep phai) NEU 2 doan CHONG LEN NHAU dung PIPELINE_NOTCH
// px - neu khong chong len, diem nhon cua doan truoc (0 chieu cao tai canh phai) dung ngay canh phan
// "day du chieu cao" cua notch doan sau, tao ra 1 buoc nhay dot ngot roi 1 "eo that lung" thua (giong
// hinh "con thoi") ngay sau do thay vi 1 mui ten lien mach duy nhat - day chinh la nguyen nhan "xau".
// Sua: moi doan (tru doan dau) dung `marginLeft: -PIPELINE_NOTCH` de CHONG vao doan truoc dung do sau
// notch; trong vung chong nay ca 2 doan co hinh dang giong het nhau (cung tap tu day du -> 0), nen doan
// SAU (ve sau trong DOM, tu nhien de len tren khi khong dinh position/z-index) hoan toan che doan truoc
// - ket qua la 1 mui ten mau cua doan SAU chen giua 2 than hinh chu nhat, dung 1 duong noi lien mach.
// 4 yeu cau cu van giu nguyen: khong nhap nhay ca o (chi 1 cham nho canh nhan o muc khan cap nhat), mau
// nen mac dinh la gradient tang dan do dam theo vi tri, o co viec can xu ly ghi de bang mau dac
// amber/coral, khong con tien to "B{n}.". Vong 7: chu he thong thay cac o "khong deu nhau" (dang tu co
// dan theo do dai nhan) - doi sang CHIEU RONG CO DINH (PIPELINE_SEG_WIDTH) cho moi o deu nhau tam tap,
// bo "whitespace-nowrap" tren nhan de chu dai tu XUONG DONG thay vi day rong o.
export function pipelineChevronClip(hasLeftNotch: boolean, hasRightPoint: boolean): string {
  const d = PIPELINE_NOTCH;
  const pts = ["0 0", hasRightPoint ? `calc(100% - ${d}px) 0` : "100% 0"];
  if (hasRightPoint) pts.push("100% 50%");
  pts.push(hasRightPoint ? `calc(100% - ${d}px) 100%` : "100% 100%", "0 100%");
  if (hasLeftNotch) pts.push(`${d}px 50%`);
  return `polygon(${pts.join(", ")})`;
}
// THIET KE LAI (2026-08-24, theo yeu cau chu he thong "vẽ UI thử" -> duyet phuong an "dai the theo
// luong, moi giai doan 1 mau"): bo han co che chevron long khop gradient theo t (ham cu
// pipelineGradientStyle da xoa 2026-08-26 - khong con noi nao goi, gradient RGB hardcode dung dung
// --ocean-100/--ocean-800 nen se KHONG doi theo tinh nang "Giao diện" moi o theme/).
// Moi buoc (step) gio thuoc VE 1 TRONG 4 "LANE" theo dung luong nghiep vu, moi lane 1 mau rieng (dung
// lai dung cac tong mau da co san trong tokens.css, khong bia mau moi ngoai 4 sac bo sung o tren) -
// giup nhin la phan biet ngay dang xem so lieu cua luong nao, thay vi phai doc nhan chu.
type LaneKey = "mua_cong_no" | "thieu_lk" | "pxk" | "tra_hang";
const LANE_ORDER: LaneKey[] = ["mua_cong_no", "thieu_lk", "pxk", "tra_hang"];
const LANE_META: Record<LaneKey, { label: string; bg: string; border: string; labelColor: string; numColor: string }> = {
  mua_cong_no: { label: "Mua hàng / Công nợ", bg: "var(--color-info-soft)", border: "var(--color-info)", labelColor: "var(--color-info)", numColor: "var(--color-info)" },
  thieu_lk: { label: "Thiếu LK", bg: "var(--color-danger-soft)", border: "var(--color-danger)", labelColor: "var(--color-danger)", numColor: "var(--color-danger)" },
  pxk: { label: "Phiếu xuất kho", bg: "var(--color-success-soft)", border: "var(--color-success)", labelColor: "var(--color-success)", numColor: "var(--color-success)" },
  // "Tra hang" gom CA 3 buoc PXK rieng cua luong tra hang (tra_hang_tao_pxk/pxk_kt/pxk_kho, tab that
  // su la "phieu-xuat-kho") lan 4 buoc D1-D4 (tab "tra-hang") - phan biet theo TIEN TO key
  // "tra_hang_" (xem laneOf), KHONG theo field `tab`, vi 2 nhom nay khac tab nhung cung 1 luong nghiep
  // vu tra hang nen phai gom chung 1 mau (khop dung STEP_SHORT_LABEL da dat tien to "Trả·" cho ca 7).
  // Dung --color-purple (UI_SPEC §1.2: "bước 'Lên PXK'" cung thuoc nhom mau nay).
  tra_hang: { label: "Trả hàng", bg: "var(--color-purple-soft)", border: "var(--color-purple)", labelColor: "var(--color-purple)", numColor: "var(--color-purple)" },
};
function laneOf(s: LuongQuyTrinhStep): LaneKey {
  if (s.key.startsWith("tra_hang_")) return "tra_hang";
  if (s.tab === "thieu-lk") return "thieu_lk";
  if (s.tab === "phieu-xuat-kho") return "pxk";
  return "mua_cong_no";
}
export function PipelineFlow({
  steps, myRoleKeys, onJump, onCreateDon, canCreateDon, inHeader, collapsed, onToggleCollapsed,
}: {
  steps: LuongQuyTrinhStep[]; myRoleKeys: Set<string>; onJump: (t: JumpTarget) => void;
  // CHOT (theo yeu cau bo sung sau ra soat): nut "Tao don" la loi tat hanh dong LUON CO SAN bat ke co
  // viec cho hay khong - KHONG den tu /luong-quy-trinh (khong phai 1 so dem).
  onCreateDon: () => void;
  canCreateDon: boolean;
  // Khi duoc portal len cung hang voi tieu de trang (App.tsx headerExtra) - bo margin-bottom vi luc
  // do no la 1 flex item CANH tieu de, khong con la 1 khoi rieng phia tren noi dung.
  inHeader?: boolean;
  // UI redesign (phan hoi Codex 2026-08-19, muc P1#3): thu gon danh sach TOAN BO cac buoc (toan he
  // thong) mac dinh, chi giu "+ Tao don" luon hien (day la loi tat hanh dong, KHONG duoc an).
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [steps.length, canCreateDon, collapsed]);

  if (steps.length === 0 && !canCreateDon) return null;
  // SUA BUG (phan hoi 2026-08-19 #2, "xem full luồng quy trình bị tràn màn hình"): thieu min-w-0 tren
  // ca 2 lop flex-item (hang ngoai VA khoi "relative" boc scroll-area) - mac dinh trinh duyet dat
  // min-width:auto cho flex item, buoc ca hang phai no rong bang TONG chieu rong noi dung thay vi cho
  // phep overflow-x-auto ben trong tu cuon. Dac biet nghiem trong khi inHeader=true (portal vao
  // headerExtra cua App.tsx, 1 flex-row hep canh tieu de trang) - min-w-0 phai co O CA 2 CAP thi
  // overflow-x-auto moi thuc su phat huy tac dung thay vi day tran ca trang.
  const lanes = LANE_ORDER.map((key) => ({ key, meta: LANE_META[key], items: steps.filter((s) => laneOf(s) === key) })).filter((l) => l.items.length > 0);
  return (
    <div className={`flex items-center gap-2 min-w-0 ${inHeader ? "" : "mb-3"}`}>
      {canCreateDon && (
        <Btn size="sm" onClick={onCreateDon} className="shrink-0" title="Tạo đơn đặt linh kiện mới">
          ＋ Tạo đơn
        </Btn>
      )}
      {!collapsed && (
        <div className="relative min-w-0 flex-1">
          <div ref={scrollRef} className="overflow-x-auto pb-0.5">
            {/* SUA (phan hoi chu he thong 2026-08-24 lan 2: "vẫn là ô vuông như ban đầu nhưng thu gọn
                lại, không phải chuyển thành ô li") - QUAY LAI dang O VUONG/CHU NHAT (so xep TREN, nhan
                xep DUOI, ca 2 giua tam), KHONG dung dang tron-so+nhan-inline (pill) cua ban truoc -
                chi thu nho kich thuoc con khoang 1 nua so voi o vuong GOC (truoc do min-w-[62px]/
                text-sm+text-[10px] -> gio min-w-[32px]/text-[11px]+text-[7px]). Nhan lane van dat
                NGANG HANG truoc nhom o cua no (khong phai 1 dong rieng phia tren) de ca thanh van gon
                trong 1 dong duy nhat nhu yeu cau lan truoc. */}
            <div className="flex items-center gap-2 w-max border border-[var(--line)] bg-[var(--surface)] rounded-xl px-2 py-1.5">
              {lanes.map((lane, laneIdx) => (
                <div key={lane.key} className="flex items-center gap-1 shrink-0">
                  {laneIdx > 0 && <span className="w-px h-6 bg-[var(--line)] mr-1" aria-hidden />}
                  <span className="text-[8.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: lane.meta.labelColor }}>
                    {lane.meta.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {lane.items.map((s) => {
                      const isMine = s.roleKeys.some((r) => myRoleKeys.has(r));
                      const hasCount = s.count > 0;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
                          style={{ background: lane.meta.bg, borderColor: lane.meta.border }}
                          className="focus-ring relative flex min-w-[32px] flex-col items-center justify-center gap-0 rounded-md border py-1 px-1 text-center transition-transform hover:-translate-y-0.5"
                          title={STEP_DESCRIPTION[s.key] ?? s.label}
                        >
                          {isMine && hasCount && (
                            <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-[var(--color-primary)]" title="Việc của bạn" />
                          )}
                          <span
                            className="text-[11px] font-extrabold leading-none tabular-nums"
                            style={{ color: hasCount ? lane.meta.numColor : "var(--color-text-faint)" }}
                          >
                            {s.count}
                          </span>
                          <span className="text-[7px] font-semibold leading-none mt-0.5 whitespace-nowrap" style={{ color: hasCount ? lane.meta.labelColor : "var(--color-text-faint)" }}>
                            {STEP_SHORT_LABEL[s.key] ?? s.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {canScrollRight && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 bottom-0.5 w-10 rounded-r-xl"
              style={{ background: "linear-gradient(to right, transparent, var(--bg))" }}
            />
          )}
        </div>
      )}
      {steps.length > 0 && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="focus-ring shrink-0 whitespace-nowrap text-xs font-semibold text-[var(--ink-500)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink-700)]"
        >
          {collapsed ? `Xem toàn bộ quy trình (${steps.length}) ▾` : "Thu gọn quy trình ▴"}
        </button>
      )}
    </div>
  );
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
  const nhanhReLabel = trangThai === "Ke toan huy" ? "Đã huỷ" : trangThai === "Hang tru kho" ? "Trừ kho" : "Kết thúc";
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
                {PXK_MINI_LABEL[s]}
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
