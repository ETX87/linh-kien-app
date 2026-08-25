import { StatCard } from "../../components/ui/StatCard";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { STEP_SHORT_LABEL } from "./constants";
import { BaoCaoTab } from "./BaoCaoTab";
import type { JumpTarget, LuongQuyTrinhStep } from "./types";

// Tab "Trang chủ" (them 2026-08-24, khop bo cuc renderHome()/kpiCard() cua
// ui-concepts/concept-1-structured-neutral.html) - man mac dinh moi khi vao module, gom 1 luoi
// StatCard "viec cua toi" (dung LAI du lieu luong-quy-trinh da co san, cung nguon voi
// MyWorkloadStrip/PipelineFlow - KHONG goi API moi) + 1 bang tom tat pham vi du lieu hien tai (dung
// loai-don-counts da co san, SCOPE dung theo nguoi dang xem qua scopeDatMuaNguoiTao o backend).
// Tone "coral" cho cac the KPI (khac voi warn/amber cua concept goc) de dong bo mau voi
// MyWorkloadStrip/PipelineFlow dang dung san cho "buoc cua chinh minh" (isMine && count>0 = coral),
// tranh 1 man hinh dung 2 quy uoc mau khac nhau cho CUNG 1 khai niem "viec cua toi".
export function TrangChuTab({
  steps,
  myRoleKeys,
  onJump,
  loaiDonCounts,
  tongViecCuaToi,
  canTraHangView,
  isManagerView,
  showBaoCao,
}: {
  steps: LuongQuyTrinhStep[];
  myRoleKeys: Set<string>;
  onJump: (t: JumpTarget) => void;
  loaiDonCounts: { mua: number; cong_no: number; tra_hang: number };
  tongViecCuaToi: number;
  // Them (phan hoi chu he thong 2026-08-24: "Trang chủ với báo cáo gộp làm 1") - BaoCaoTab (12 chi so
  // tong quan) gio render NGAY DUOI trong man nay thay vi 1 tab rieng. `isManagerView` truyen thang cho
  // BaoCaoTab quyet dinh the ca nhan hay bang pivot (dung y cu, khong doi). `showBaoCao` = false CHI
  // cho QC thuan (FIX Van de #1 - QC khong duoc xem bao cao pivot toan he thong, dich "bao cao" cua QC
  // van la tab Trả hàng loc san "Cho QC xac nhan" nhu truoc, khong lien quan man nay).
  isManagerView: boolean;
  showBaoCao: boolean;
  // FIX (phat hien qua kiem thu trinh duyet 2026-08-24): "Trả hàng" KHONG dung chung co che jump
  // loaiDon nhu Mua hang/Cong no - loaiDon tren JumpTarget CHI danh cho 3 buoc PXK tra hang (xem
  // comment o types.ts), khong phai cho "don-cua-toi". Voi vai tro CO canTraHangView (TN/Kho/Ke toan/
  // QC/GS), man "Trả hàng" that su la view "tra-hang" (TraHangTab, day du nut xu ly) - phai nhay bang
  // tab:"tra-hang" giong het cach PipelineFlow dang lam (xem backend datMuaLinhKien.ts dong 320-323),
  // KHONG PHAI tab:"don-cua-toi" + loaiDon:"tra_hang" (to hop nay chua tung duoc dung/kiem thu o dau
  // khac trong app, gay nhay sai sang danh sach "Mua hang" khi thu nghiem).
  canTraHangView: boolean;
}) {
  const mySteps = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);

  function jumpNum(loaiDon: "mua" | "cong_no" | "tra_hang") {
    function handleClick() {
      if (loaiDon === "tra_hang" && canTraHangView) onJump({ tab: "tra-hang", filter: "" });
      else onJump({ tab: "don-cua-toi", filter: "", loaiDon });
    }
    return (
      <button type="button" onClick={handleClick} className="focus-ring font-semibold hover:underline text-[var(--indigo-600)] tabular-nums">
        {loaiDonCounts[loaiDon]}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="font-display text-base font-bold text-[var(--ink-900)]">Việc cần làm hôm nay</h2>
        <div className="text-xs text-[var(--ink-500)] mt-0.5">Số liệu tồn đọng đúng theo vai trò của bạn — bấm vào ô số để nhảy thẳng tới danh sách xử lý.</div>
      </div>

      {mySteps.length > 0 ? (
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          {mySteps.map((s) => (
            <StatCard
              key={s.key}
              label={STEP_SHORT_LABEL[s.key] ?? s.label}
              value={s.count}
              tone="coral"
              onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-400)] py-4 text-center rounded-xl border border-dashed border-[var(--line)]">
          {tongViecCuaToi > 0 ? `Có ${tongViecCuaToi} việc cần làm — mở "Việc của tôi" ở tiêu đề trang để xem chi tiết.` : "Không có việc gì đang chờ bạn xử lý."}
        </div>
      )}

      {/* SUA (phan hoi 2026-08-25: "3 cái này trên giao diện web đang chiếm quá nhiều diện tích
          không cần thiết") - doi tu Card+table 3 hang (~130px cao) sang 1 hang inline duy nhat, giu
          nguyen y nghia/hanh vi bam-nhay (jumpNum), chi doi lop trinh bay. */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--ink-500)]">
        <span className="font-semibold uppercase tracking-wide text-[var(--ink-400)]">Phạm vi dữ liệu:</span>
        <span>Mua hàng {jumpNum("mua")} đơn</span>
        <span className="text-[var(--line)]">·</span>
        <span>Công nợ {jumpNum("cong_no")} đơn</span>
        <span className="text-[var(--line)]">·</span>
        <span>Trả hàng {jumpNum("tra_hang")} đơn</span>
      </div>

      {showBaoCao && (
        <div>
          {/* SUA (phan hoi 2026-08-25: "rút gọn nó lại 1 dòng là được") - gop dong ghi chu doc lap
              ("① Số liệu... ② Bấm vào số...") vao NGAY trong tieu de "Báo cáo tổng thể" thay vi 1
              dong <div> rieng ben tren, tiet kiem 1 dong chieu cao man hinh. */}
          <SectionTitle className="mt-6">
            Báo cáo tổng thể{" "}
            <span className="normal-case font-normal text-[var(--ink-400)]">
              (① Số liệu "Việc cần làm" luôn tô đúng theo vai trò của bạn · ② Bấm vào số bất kỳ để nhảy thẳng tới đúng tab/bộ lọc tương ứng.)
            </span>
          </SectionTitle>
          <BaoCaoTab onJump={onJump} isManagerView={isManagerView} />
        </div>
      )}
    </div>
  );
}
