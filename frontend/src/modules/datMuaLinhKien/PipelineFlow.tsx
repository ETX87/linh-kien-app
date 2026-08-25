import { useState, useEffect, useRef } from "react";
import { Btn } from "../../components/ui/Btn";
import type { LuongQuyTrinhStep, JumpTarget } from "./types";
import { STEP_SHORT_LABEL, STEP_DESCRIPTION, PIPELINE_NOTCH, PXK_TRANG_THAI_TONE, PXK_MINI_STEPS, PXK_MINI_LABEL, PXK_MINI_NHANH_RE, PXK_MINI_SEG_WIDTH } from "./constants";

// "Luong quy trinh" pipeline UI (thanh chevron so dem theo buoc) dung chung boi DatMuaLinhKienModule
// (tab tong quan) va PhieuXuatKhoTab (mini-pipeline PXK) - tach tu DatMuaLinhKienModule.tsx (UI
// redesign Phase 3, phan hoi Codex 2026-08-19).

// "Viec cua toi" (UI redesign phan hoi Codex 2026-08-19, muc P1#1) - loc TRUC TIEP tu du lieu
// luong-quy-trinh da co san (khong goi API moi, khong them logic nghiep vu moi) lay dung cac buoc
// isMine (roleKeys giao voi myRoleKeys) VA count>0, sap xep giam dan theo so luong - dat NGAY dau
// trang thay vi phai bam sang tab "Bao cao" moi thay (truoc do StatCard tuong tu chi nam trong
// BaoCaoTab). Tai su dung StatCard (size sm) de dong bo hinh anh voi BaoCaoTab, khong tao pattern
// chip moi rieng.
export function MyWorkloadStrip({
  steps, myRoleKeys, onJump,
}: {
  steps: LuongQuyTrinhStep[]; myRoleKeys: Set<string>; onJump: (t: JumpTarget) => void;
}) {
  const mine = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);
  if (mine.length === 0) return null;
  // SUA (phan hoi 2026-08-19 #4: "chiếm hẳn 1 dòng, và rất to") - doi tu luoi StatCard size="sm"
  // (moi the min-w-[110px], 2 dong noi dung, co border/shadow rieng) sang 1 HANG PILL GON, nhan +
  // so dem NAM CHUNG 1 dong duy nhat, dung dung ngon ngu badge tron do da co san o Tabs.tsx ("nhu
  // thong bao tin nhan") - tiet kiem dien tich doc dang ke so voi luoi the cu.
  return (
    <div className="mb-2 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold text-[var(--ink-500)] uppercase tracking-wide shrink-0">Việc của tôi</span>
      {mine.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-[var(--coral-100)] hover:brightness-95 text-[var(--coral-700)] pl-2.5 pr-1.5 py-1 text-xs font-semibold transition-all"
        >
          {STEP_SHORT_LABEL[s.key] ?? s.label}
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--coral-500)] text-white text-[10px] font-bold leading-none">
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
// nen mac dinh la gradient tang dan do dam theo vi tri (pipelineGradientStyle), o co viec can xu ly ghi
// de bang mau dac amber/coral, khong con tien to "B{n}.". Vong 7: chu he thong thay cac o "khong deu
// nhau" (dang tu co dan theo do dai nhan) - doi sang CHIEU RONG CO DINH (PIPELINE_SEG_WIDTH) cho moi
// o deu nhau tam tap, bo "whitespace-nowrap" tren nhan de chu dai tu XUONG DONG thay vi day rong o.
export function pipelineChevronClip(hasLeftNotch: boolean, hasRightPoint: boolean): string {
  const d = PIPELINE_NOTCH;
  const pts = ["0 0", hasRightPoint ? `calc(100% - ${d}px) 0` : "100% 0"];
  if (hasRightPoint) pts.push("100% 50%");
  pts.push(hasRightPoint ? `calc(100% - ${d}px) 100%` : "100% 100%", "0 100%");
  if (hasLeftNotch) pts.push(`${d}px 50%`);
  return `polygon(${pts.join(", ")})`;
}
// DOI MAU (2026-08-24, khop concept 1 "Structured Neutral"): gradient truoc dung tong ocean
// (--ocean-100 #ddf1fb -> gan --ocean-800 #0a4666) - doi sang tong indigo (--indigo-100 #eef2ff ->
// --indigo-700 #3730a3), khop accent chinh cua concept 1, KHONG dung CSS var truc tiep (can noi suy
// tung mau theo t) nen ghi thang RGB tuong ung 2 token do - CHI doi mau, KHONG doi hinh hoc/nguong t.
export function pipelineGradientStyle(t: number): { background: string; color: string } {
  const r = Math.round(238 + (55 - 238) * t);
  const g = Math.round(242 + (48 - 242) * t);
  const b = Math.round(255 + (163 - 255) * t);
  return { background: `rgb(${r}, ${g}, ${b})`, color: t > 0.55 ? "#ffffff" : "#3730a3" };
}
// THIET KE LAI (2026-08-24, theo yeu cau chu he thong "vẽ UI thử" -> duyet phuong an "dai the theo
// luong, moi giai doan 1 mau"): bo han co che chevron long khop clip-path (pipelineChevronClip/
// pipelineGradientStyle van GIU LAI ben tren - PxkMiniPipeline van dung, chi PipelineFlow doi cach ve).
// Moi buoc (step) gio thuoc VE 1 TRONG 4 "LANE" theo dung luong nghiep vu, moi lane 1 mau rieng (dung
// lai dung cac tong mau da co san trong tokens.css, khong bia mau moi ngoai 4 sac bo sung o tren) -
// giup nhin la phan biet ngay dang xem so lieu cua luong nao, thay vi phai doc nhan chu.
type LaneKey = "mua_cong_no" | "thieu_lk" | "pxk" | "tra_hang";
const LANE_ORDER: LaneKey[] = ["mua_cong_no", "thieu_lk", "pxk", "tra_hang"];
const LANE_META: Record<LaneKey, { label: string; bg: string; border: string; labelColor: string; numColor: string }> = {
  mua_cong_no: { label: "Mua hàng / Công nợ", bg: "var(--ocean-100)", border: "var(--ocean-500)", labelColor: "var(--ocean-700)", numColor: "var(--ocean-800)" },
  thieu_lk: { label: "Thiếu LK", bg: "var(--coral-100)", border: "var(--coral-500)", labelColor: "var(--coral-600)", numColor: "var(--coral-700)" },
  pxk: { label: "Phiếu xuất kho", bg: "var(--teal-100)", border: "var(--teal-500)", labelColor: "var(--teal-600)", numColor: "var(--teal-700)" },
  // "Tra hang" gom CA 3 buoc PXK rieng cua luong tra hang (tra_hang_tao_pxk/pxk_kt/pxk_kho, tab that
  // su la "phieu-xuat-kho") lan 4 buoc D1-D4 (tab "tra-hang") - phan biet theo TIEN TO key
  // "tra_hang_" (xem laneOf), KHONG theo field `tab`, vi 2 nhom nay khac tab nhung cung 1 luong nghiep
  // vu tra hang nen phai gom chung 1 mau (khop dung STEP_SHORT_LABEL da dat tien to "Trả·" cho ca 7).
  tra_hang: { label: "Trả hàng", bg: "var(--violet-100)", border: "var(--violet-500)", labelColor: "var(--violet-600)", numColor: "var(--violet-700)" },
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
                            <span className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full bg-[var(--indigo-600)]" title="Việc của bạn" />
                          )}
                          <span
                            className="text-[11px] font-extrabold leading-none tabular-nums"
                            style={{ color: hasCount ? lane.meta.numColor : "var(--ink-400)" }}
                          >
                            {s.count}
                          </span>
                          <span className="text-[7px] font-semibold leading-none mt-0.5 whitespace-nowrap" style={{ color: hasCount ? lane.meta.labelColor : "var(--ink-400)" }}>
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

export function PxkMiniPipeline({ trangThai }: { trangThai: string }) {
  const idxHienTai = PXK_MINI_STEPS.indexOf(trangThai as (typeof PXK_MINI_STEPS)[number]);
  const isNhanhRe = PXK_MINI_NHANH_RE.has(trangThai);
  return (
    <div className="mb-3 overflow-x-auto pb-0.5">
      <div className="flex w-max items-stretch overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)] py-0.5 shadow-sm">
        {PXK_MINI_STEPS.map((s, i) => {
          const isFirst = i === 0;
          // "Da qua" chi co y nghia khi con dang di tren truc chinh (idxHienTai>=0) - neu da re nhanh,
          // ca 5 buoc chinh deu coi la nen/trung tinh, khong to dam buoc nao tren truc nua.
          const daQua = idxHienTai >= 0 && i < idxHienTai;
          const dangO = idxHienTai >= 0 && i === idxHienTai;
          // DOI MAU (2026-08-24, khop concept 1): "dang o" (buoc hien tai cua chinh PXK nay) tu ocean
          // sang indigo - dong bo voi accent chinh cua concept 1, CHI doi mau nen/chu, khong doi hinh
          // hoc/logic dangO/daQua.
          const toneStyle = dangO
            ? { background: "var(--indigo-600)", color: "white" }
            : daQua
              ? { background: "var(--teal-100)", color: "var(--teal-700)" }
              : { background: "var(--surface-100)", color: "var(--ink-400)" };
          return (
            <div key={s} className="shrink-0" style={{ marginLeft: isFirst ? 0 : -PIPELINE_NOTCH }}>
              <div
                style={{
                  width: PXK_MINI_SEG_WIDTH,
                  clipPath: pipelineChevronClip(!isFirst, true),
                  paddingLeft: isFirst ? 12 : PIPELINE_NOTCH + 5,
                  paddingRight: PIPELINE_NOTCH + 5,
                  ...toneStyle,
                }}
                className="flex h-full items-center justify-center py-1.5 text-center"
              >
                <span className="text-[9.5px] font-semibold leading-tight">{PXK_MINI_LABEL[s]}</span>
              </div>
            </div>
          );
        })}
        {isNhanhRe && (
          <div className="shrink-0" style={{ marginLeft: -PIPELINE_NOTCH }}>
            <div
              style={{
                width: PXK_MINI_SEG_WIDTH + 10,
                clipPath: pipelineChevronClip(true, false),
                paddingLeft: PIPELINE_NOTCH + 5,
                paddingRight: 12,
                background: PXK_TRANG_THAI_TONE[trangThai] === "teal" ? "var(--teal-500)" : "var(--ink-400)",
              }}
              className="flex h-full items-center justify-center py-1.5 text-center text-white"
            >
              <span className="text-[9.5px] font-semibold leading-tight">{trangThai === "Ke toan huy" ? "KT huỷ" : trangThai === "Hang tru kho" ? "Trừ kho" : "Kết thúc"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
