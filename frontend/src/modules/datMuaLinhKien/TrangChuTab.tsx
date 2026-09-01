import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "../../components/ui/StatCard";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { api, buildQuery } from "../../api/client";
import { parseDbDateTime, fmtDate } from "../../types";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { STEP_SHORT_LABEL } from "./constants";
import { KhuVucChipFilter, CollapsibleSection } from "./SharedUi";
import { BaoCaoTab } from "./BaoCaoTab";
import type { JumpTarget, LuongQuyTrinhStep, DangTonStep } from "./types";

interface TonDongRow {
  id: string;
  loai_don: "mua" | "cong_no";
  ma_lk: string;
  ten_lk_snapshot: string | null;
  so_luong_de_xuat: number;
  nguoi_nhan_hang: string | null;
  ngay_tao: string;
  ddh_trang_thai: string | null;
  pxk_trang_thai: string | null;
  so_tien_can_chuyen: number | null;
  trang_thai_chuyen_tien: string | null;
  ten_hien_thi: string | null;
  khu_vuc_ma: string | null;
  vai_tro_ktv: string | null;
  khu_vuc_ten: string | null;
  ngay_du_kien_co_hang: string | null;
}

// Dich trang thai tho (ddh_trang_thai/pxk_trang_thai) thanh 1 cau ngan de nguoi xem hieu NGAY "vi sao
// con tồn" + "ai đang cầm bóng" (phan hoi 2026-08-27: "phải gặp ai để yêu cầu hỗ trợ") - thuan hien
// thi FE, backend chi tra RAW status (giu dung quy uoc chung ca module: cac endpoint khac cung KHONG
// dich san label o BE, tu FE tu ve badge - vd DonCuaToiTab hien thang chuoi trang_thai).
function moTaTonDong(r: TonDongRow): { label: string; nguoiCanGap: string; tone: BadgeTone } {
  const choTien = r.so_tien_can_chuyen != null && r.trang_thai_chuyen_tien !== "TN da duyet";
  if (r.pxk_trang_thai) {
    if (r.pxk_trang_thai === "Dang tao phieu" && choTien) return { label: "Chờ chuyển tiền cho KTV", nguoiCanGap: "KTV / Tác nghiệp", tone: "amber" };
    switch (r.pxk_trang_thai) {
      case "Dang tao phieu":
        return { label: "Tác nghiệp đang tạo phiếu xuất kho", nguoiCanGap: "Tác nghiệp", tone: "ocean" };
      case "Cho ke toan":
        return { label: "Chờ Kế toán duyệt phiếu xuất kho", nguoiCanGap: "Kế toán", tone: "amber" };
      case "Da chot xong don xuat":
        return { label: "Chờ Kho gửi hàng cho KTV", nguoiCanGap: "Kho", tone: "amber" };
      case "Dang gui KTV":
        return { label: "Đã gửi hàng, chờ KTV xác nhận đã nhận", nguoiCanGap: "KTV", tone: "ocean" };
      default:
        return { label: r.pxk_trang_thai, nguoiCanGap: "—", tone: "gray" };
    }
  }
  switch (r.ddh_trang_thai) {
    case "Cho Tram duyet":
      return { label: "Chờ Trạm duyệt", nguoiCanGap: "Trạm", tone: "amber" };
    case "Cho TBP xac nhan":
      return { label: "Chờ TBP ĐVBH duyệt LK đặc thù", nguoiCanGap: "TBP ĐVBH", tone: "amber" };
    case "Cho TN duyet":
      return { label: "Chờ Tác nghiệp duyệt", nguoiCanGap: "Tác nghiệp", tone: "amber" };
    case "TN da duyet":
      return { label: "Đã duyệt, chờ Tác nghiệp tạo phiếu xuất kho", nguoiCanGap: "Tác nghiệp", tone: "ocean" };
    case "Cho hang":
      return {
        label: r.ngay_du_kien_co_hang ? `Thiếu hàng, Kho dự kiến có hàng ${fmtDate(r.ngay_du_kien_co_hang)}` : "Thiếu hàng, Kho đang tìm nguồn",
        nguoiCanGap: "Kho",
        tone: "coral",
      };
    default:
      return { label: r.ddh_trang_thai ?? "—", nguoiCanGap: "—", tone: "gray" };
  }
}

function soNgayTonTone(soNgay: number): BadgeTone {
  if (soNgay >= 7) return "coral";
  if (soNgay >= 3) return "amber";
  return "gray";
}

// Bao cao "Đơn hàng đang tồn theo KTV" (them 2026-08-27, thay cho khoi "KTV khu vực của tôi" cu - chi
// liet ke danh ba, KHONG tra loi duoc cau hoi that su cua Giam sat/TN/Kho/Ke toan la "còn bao nhiêu
// đơn đang tồn, tồn bao lâu, kẹt ở đâu, phải gặp ai" (phan hoi: "cái nhìn nhanh trong 5s"). Nhom theo
// nguoi_nhan_hang (KTV), sap xep KTV tồn LAU NHAT len dau; bam mo rong 1 KTV de xem tung don kem ly do
// + nguoi can lien he. CHI hien voi Giam sat/TN/Kho/Ke toan (goi la "quan ly" giong isManagerView o
// component cha) - KTV/Ve tinh tu xem tien do CA NHAN qua StatCard/pipeline san co o tren, khong can
// bao cao "theo tung nguoi" nay.
// forwardRef + useImperativeHandle (them 2026-09-01, phan hoi "đang tồn/tồn đọng toàn hệ thống không
// click để xem danh sách được") - lo "open" cua CollapsibleSection VA "filterKhuVuc" ra thanh dieu
// khien duoc TU BEN NGOAI (component cha TrangChuTab goi ref.current.expand() khi bam StatCard "Đang
// tồn"/"Tồn đọng toàn hệ thống"), thay vi 2 state noi bo an hoan toan nhu truoc.
export interface TonDongTheoKtvReportHandle {
  expand: (opts?: { resetKhuVuc?: boolean }) => void;
}
const TonDongTheoKtvReport = forwardRef<TonDongTheoKtvReportHandle, { onJump: (t: JumpTarget) => void }>(function TonDongTheoKtvReport({ onJump }, ref) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  // Muc B (phan hoi 2026-08-28) - tren mobile, an bo loc Khu vuc/KTV sau nut "☰ Bộ lọc" (mac dinh
  // dong) thay vi luon hien 2 hang pill+dropdown ngay duoi tieu de; desktop giu nguyen hien san.
  const [showFilter, setShowFilter] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(!isMobile);
  const { data: khuVucAllData } = useQuery({
    queryKey: ["settings-khu-vuc"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/settings/khu-vuc"),
  });
  const { data: khuVucCuaToiData } = useQuery({
    queryKey: ["dat-mua-lk-khu-vuc-cua-toi"],
    queryFn: () => api.get<{ rows: { ma: string; ten: string }[] }>("/dat-mua-lk/khu-vuc-cua-toi"),
  });
  const [filterKhuVuc, setFilterKhuVuc] = useState<Set<string>>(new Set());
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (!khuVucCuaToiData) return;
    defaultAppliedRef.current = true;
    if (khuVucCuaToiData.rows.length > 0) setFilterKhuVuc(new Set(khuVucCuaToiData.rows.map((r) => r.ma)));
  }, [khuVucCuaToiData]);
  useImperativeHandle(ref, () => ({
    expand(opts) {
      setSectionOpen(true);
      if (opts?.resetKhuVuc) setFilterKhuVuc(new Set());
      // Cuon SAU 1 tick de doi CollapsibleSection render xong noi dung (sectionOpen=true) truoc khi do
      // vi tri, tranh cuon toi 1 khung con thu gon (chua co chieu cao that).
      requestAnimationFrame(() => containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
  }));
  const khuVucParam = [...filterKhuVuc].join(",");
  const khuVucOptions = (khuVucAllData?.rows ?? []).map((k) => ({ value: k.ma, label: k.ten }));

  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-ton-dong-theo-ktv", khuVucParam],
    queryFn: () => api.get<{ rows: TonDongRow[]; now: string }>("/dat-mua-lk/ton-dong-theo-ktv" + buildQuery({ khu_vuc: khuVucParam || undefined })),
  });

  const [filterKtv, setFilterKtv] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpand(email: string) {
    const next = new Set(expanded);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setExpanded(next);
  }

  const allRows = data?.rows ?? [];
  const nowMs = data ? parseDbDateTime(data.now).getTime() : Date.now();
  const rows = filterKtv ? allRows.filter((r) => r.nguoi_nhan_hang === filterKtv) : allRows;

  const ktvOptions = [...new Map(allRows.filter((r) => r.nguoi_nhan_hang).map((r) => [r.nguoi_nhan_hang as string, r.ten_hien_thi ?? r.nguoi_nhan_hang!])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const groups = [...new Map(rows.map((r) => [r.nguoi_nhan_hang ?? "", r])).keys()].map((email) => {
    const rowsOfKtv = rows.filter((r) => (r.nguoi_nhan_hang ?? "") === email);
    const soNgayList = rowsOfKtv.map((r) => Math.floor((nowMs - parseDbDateTime(r.ngay_tao).getTime()) / 86400000));
    return {
      email,
      ten: rowsOfKtv[0]?.ten_hien_thi ?? email ?? "(chưa gán người nhận)",
      khuVucTen: rowsOfKtv[0]?.khu_vuc_ten ?? null,
      rows: rowsOfKtv,
      soNgayList,
      maxNgay: Math.max(...soNgayList, 0),
    };
  });
  groups.sort((a, b) => b.maxNgay - a.maxNgay || b.rows.length - a.rows.length);

  const hasFilterOptions = khuVucOptions.length > 0 || ktvOptions.length > 0;
  const filterRow = (
    <div className="flex flex-wrap items-center gap-3 mb-2.5">
      {khuVucOptions.length > 0 && <KhuVucChipFilter value={filterKhuVuc} onChange={setFilterKhuVuc} options={khuVucOptions} />}
      {ktvOptions.length > 0 && (
        <div className="w-56">
          <Select value={filterKtv} onChange={setFilterKtv} options={[{ value: "", label: "— Tất cả KTV —" }, ...ktvOptions]} />
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef}>
    <CollapsibleSection
      defaultOpen={!isMobile}
      open={sectionOpen}
      onOpenChange={setSectionOpen}
      title="Đơn hàng đang tồn theo KTV"
      note={
        <span className="hidden sm:inline normal-case font-normal text-[var(--ink-400)]">
          {" "}(sắp xếp theo số ngày tồn lâu nhất — bấm vào 1 KTV để xem chi tiết từng đơn.)
        </span>
      }
    >
      {isMobile && hasFilterOptions ? (
        <div className="mb-2.5">
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className="focus-ring text-xs font-semibold text-[var(--ink-500)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 bg-[var(--surface)]"
          >
            {showFilter ? "▲ Ẩn bộ lọc" : "☰ Bộ lọc Khu vực/KTV ▾"}
          </button>
          {showFilter && <div className="mt-2">{filterRow}</div>}
        </div>
      ) : (
        filterRow
      )}
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)] py-4 text-center">Đang tải…</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-[var(--ink-400)] py-4 text-center rounded-xl border border-dashed border-[var(--line)]">
          Không có đơn hàng nào đang tồn trong phạm vi này.
        </div>
      ) : (
        <div className="border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)] divide-y divide-[var(--line)]">
          {groups.map((g) => (
            <div key={g.email}>
              <button
                type="button"
                onClick={() => toggleExpand(g.email)}
                className="focus-ring w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-100)]/60"
              >
                <span className="text-[var(--ink-400)] text-xs w-3">{expanded.has(g.email) ? "▾" : "▸"}</span>
                <span className="font-medium text-sm flex-1 truncate">
                  {g.ten}
                  {g.khuVucTen && <span className="text-[var(--ink-400)] font-normal"> · {g.khuVucTen}</span>}
                </span>
                <Badge tone="ocean">{g.rows.length} đơn tồn</Badge>
                <Badge tone={soNgayTonTone(g.maxNgay)}>Lâu nhất {g.maxNgay} ngày</Badge>
                {g.email && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: g.email });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: g.email })}
                    className="focus-ring text-xs font-semibold text-[var(--ocean-700)] hover:underline whitespace-nowrap"
                  >
                    Xem danh sách →
                  </span>
                )}
              </button>
              {expanded.has(g.email) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--ink-400)] text-[10px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border-y border-[var(--line)]">
                        <th className="px-3 py-1.5">Mã đơn</th>
                        <th className="px-3 py-1.5">Linh kiện</th>
                        <th className="px-3 py-1.5">Ngày tạo</th>
                        <th className="px-3 py-1.5">Tồn</th>
                        <th className="px-3 py-1.5">Lý do / Đang chờ ai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => {
                        const soNgay = g.soNgayList[i];
                        const mota = moTaTonDong(r);
                        return (
                          <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                            <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                              <button
                                type="button"
                                className="focus-ring hover:underline text-[var(--ocean-700)]"
                                onClick={() =>
                                  onJump(
                                    r.pxk_trang_thai
                                      ? { tab: "phieu-xuat-kho", filter: r.pxk_trang_thai, nguoiNhanHang: r.nguoi_nhan_hang ?? undefined }
                                      : { tab: "don-cua-toi", filter: r.ddh_trang_thai ?? "", nguoiNhanHang: r.nguoi_nhan_hang ?? undefined },
                                  )
                                }
                              >
                                {r.id}
                              </button>
                              <span className="ml-1 text-[var(--ink-400)]">({r.loai_don === "cong_no" ? "Công nợ" : "Mua"})</span>
                            </td>
                            <td className="px-3 py-1.5">
                              {r.ten_lk_snapshot ?? r.ma_lk} × {r.so_luong_de_xuat}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.ngay_tao)}</td>
                            <td className="px-3 py-1.5">
                              <Badge tone={soNgayTonTone(soNgay)}>{soNgay} ngày</Badge>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="text-[var(--ink-700)]">{mota.label}</span>
                              {mota.nguoiCanGap !== "—" && (
                                <>
                                  {" "}
                                  <Badge tone={mota.tone}>{mota.nguoiCanGap}</Badge>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
    </div>
  );
});

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
  dangTon,
  dangTonSteps,
  tonDongToanHeThong,
  tonDongToanHeThongSteps,
  choDonBiTuChoi,
  canTraHangView,
  isManagerView,
  showBaoCao,
  canTacNghiep,
  canKho,
  canKeToan,
  isGiamSat,
}: {
  steps: LuongQuyTrinhStep[];
  myRoleKeys: Set<string>;
  onJump: (t: JumpTarget) => void;
  loaiDonCounts: { mua: number; cong_no: number; tra_hang: number };
  tongViecCuaToi: number;
  // Them (phan hoi 2026-08-31: "tách ra là 'Cần làm' và 'Đang tồn'") - dangTon la don/PXK/thieu_lk cua
  // CHINH nguoi dang xem (hoac trong pham vi Khu vuc/Khu vuc phu trach cua ho neu la TN/Kho/Ke toan/
  // TBP/QC) van con "tồn" (chua dong ho so) NHUNG khong phai luot xu ly cua ho ngay luc nay - phan
  // biet ro voi tongViecCuaToi (viec CAN LAM thuc su). tonDongToanHeThong = null cho vai tro khong duoc
  // xem (KTV/Ve tinh/Giam sat/QC/TBP) - CHI TN/Kho/Ke toan (+Admin) moi thay con so toan he thong nay.
  dangTon: number;
  // Them (2026-09-01, phan hoi "ấn vào đơn đang tồn 6... làm sao tôi biết 6 đơn này hiện ở đâu để
  // click vào xem") - breakdown chi tiet theo TUNG trang thai (moi dong bam-nhay duoc rieng), hien khi
  // bam mo rong the "Đang tồn"/"Tồn đọng toàn hệ thống" - xem DangTonStep o types.ts.
  dangTonSteps: DangTonStep[];
  tonDongToanHeThong: number | null;
  tonDongToanHeThongSteps: DangTonStep[] | null;
  // FIX (ra soat "logic sai theo vai tro" 2026-08-29, Bug A): so don CUA CHINH nguoi dang xem dang o
  // trang thai "TN tu choi" VA CHUA xem chi tiet (thong_bao_ktv.da_doc=0, loai='tu_choi') - da CONG
  // SAN vao tongViecCuaToi o component cha, truyen rieng them de ve 1 the rieng ("khong bi troi mat"
  // giua cac buoc dang cho khac, vi day la tin xau can chu y ngay chu khong phai hang doi binh thuong).
  choDonBiTuChoi: number;
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
  // Them (2026-08-27) - gate hien thi TonDongTheoKtvReport (chi Giam sat/TN/Kho/Ke toan, khop dieu
  // kien FORBIDDEN_ROLE o backend GET /ton-dong-theo-ktv).
  canTacNghiep: boolean;
  canKho: boolean;
  canKeToan: boolean;
  isGiamSat: boolean;
}) {
  const isMobile = useIsMobile();
  const mySteps = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);
  const isManagerish = canTacNghiep || canKho || canKeToan || isGiamSat;
  const ktvReportRef = useRef<TonDongTheoKtvReportHandle>(null);
  // Them (2026-09-01, phan hoi "ấn vào đơn đang tồn 6... làm sao tôi biết 6 đơn này hiện ở đâu để click
  // vào xem") - THAY vi mo report "Đơn hàng đang tồn theo KTV" (chi khop Mua/Cong no, gay nham lan vi
  // so khong trung khop nhu phan hoi truoc do), bam "Đang tồn"/"Tồn đọng toàn hệ thống" gio MO RONG 1
  // luoi StatCard chi tiet NGAY DUOI (dangTonSteps/tonDongToanHeThongSteps, moi dong = 1 trang thai cu
  // the, bam duoc thang toi dung tab/filter) - giong het co che mySteps ben tren.
  const [showToanHeThongDetail, setShowToanHeThongDetail] = useState(false);
  const dangTonRows = dangTonSteps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);
  const toanHeThongRows = (tonDongToanHeThongSteps ?? []).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);

  function jumpNum(loaiDon: "mua" | "cong_no" | "tra_hang") {
    function handleClick() {
      if (loaiDon === "tra_hang" && canTraHangView) onJump({ tab: "tra-hang", filter: "" });
      else onJump({ tab: "don-cua-toi", filter: "", loaiDon });
    }
    return (
      <button type="button" onClick={handleClick} className="focus-ring font-semibold hover:underline text-[var(--ocean-800)] tabular-nums">
        {loaiDonCounts[loaiDon]}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="font-display text-base font-bold text-[var(--ink-900)]">Đang chờ hôm nay</h2>
        <div className="hidden sm:block text-xs text-[var(--ink-500)] mt-0.5">Số liệu tồn đọng đúng theo vai trò của bạn — bấm vào ô số để nhảy thẳng tới danh sách xử lý.</div>
      </div>

      {/* FIX (ra soat "logic sai theo vai tro" 2026-08-29, Bug A): "don bi tu choi" truoc day CHI co
          1 thong bao chuong dung 1 lan (NotificationBell.tsx) - neu bo lo/xoa thi mat dau hoan toan,
          khong co mat trong "Viec can lam" nhu cac buoc cho duyet khac. Rieng the nay tach khoi
          mySteps (nguon du lieu khac nhau - thong_bao_ktv.da_doc, khong phai trang_thai_hien_tai cua
          pipeline) nen luon hien DOC LAP ben tren khi con chua xem, tu bien mat khi da mo chi tiet don
          (xem GET /dat-mua-lk/don-hang/:id o backend). */}
      {choDonBiTuChoi > 0 && (
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <StatCard
            label="Đơn bị từ chối"
            value={choDonBiTuChoi}
            tone="coral"
            onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi", nguoiNhanHang: "" })}
          />
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-400)]">Cần làm</div>
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
      ) : tongViecCuaToi > 0 ? (
        // SUA (muc D, phan hoi 2026-08-28) - truoc day chi la 1 dong text tinh, khong bam duoc, buoc
        // nguoi dung phai tu tim nut "Cần làm: N" o tieu de trang (o TREN cung, de bi bo qua tren
        // mobile vi phai cuon nguoc len). Doi thanh StatCard bam duoc GIONG cac the ben tren, nhay
        // thang toi danh sach don con ton cua chinh minh - it nhat co 1 diem den cu the thay vi chi
        // mo ta suong.
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <StatCard label="Việc cần làm" value={tongViecCuaToi} tone="coral" onClick={() => onJump({ tab: "don-cua-toi", filter: "__OPEN__", nguoiNhanHang: "" })} />
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-400)] py-4 text-center rounded-xl border border-dashed border-[var(--line)]">Không có việc gì đang chờ bạn xử lý.</div>
      )}

      {/* Them (phan hoi 2026-08-31: "'Đang tồn' là đơn của ktv vẫn đang xử lý chưa xong") - tach rieng
          khoi "Cần làm" o tren: day la don/PXK/thieu_lk van con mo NHUNG khong phai luot cua nguoi dang
          xem ngay luc nay. SUA (phan hoi 2026-09-01: "ấn vào đơn đang tồn 6... làm sao tôi biết 6 đơn
          này hiện ở đâu để click vào xem") - THAY the rieng, quyet dinh RIENG "mo report Đơn hàng đang
          tồn theo KTV" (khong khop so, gay nham lan) bang 1 luoi StatCard chi tiet LUON HIEN SAN, GIONG
          HET co che mySteps o tren - moi dong = 1 trang thai cu the, bam thang toi dung tab/filter. */}
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-400)]">Đang tồn</div>
      {dangTonRows.length > 0 ? (
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          {dangTonRows.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={s.count}
              tone="amber"
              onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
            />
          ))}
        </div>
      ) : dangTon > 0 ? (
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <StatCard label="Đang tồn" value={dangTon} tone="amber" />
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-400)] py-4 text-center rounded-xl border border-dashed border-[var(--line)]">Không có đơn nào đang tồn.</div>
      )}

      {tonDongToanHeThong !== null && (canTacNghiep || canKho || canKeToan) && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-400)]">Tồn đọng toàn hệ thống</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard
              label="Tồn đọng toàn hệ thống"
              value={tonDongToanHeThong}
              tone="violet"
              sub="Toàn quốc, không lọc theo Khu vực của bạn"
              onClick={toanHeThongRows.length > 0 ? () => setShowToanHeThongDetail((v) => !v) : undefined}
            />
          </div>
          {showToanHeThongDetail && toanHeThongRows.length > 0 && (
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              {toanHeThongRows.map((s) => (
                <StatCard
                  key={s.key}
                  label={s.label}
                  value={s.count}
                  tone="violet"
                  size="sm"
                  onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "", loaiDon: s.loaiDon })}
                />
              ))}
            </div>
          )}
        </>
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

      {isManagerish && <TonDongTheoKtvReport ref={ktvReportRef} onJump={onJump} />}

      {showBaoCao && (
        // Muc C (phan hoi 2026-08-28: "Home mobile lỗi giao diện nặng") - mac dinh THU GON tren mobile
        // (nguoi dung tu bam "▼ Mở rộng" khi can xem sau), giu MO SAN tren desktop nhu hanh vi cu -
        // giam dang ke do dai trang luc moi vao Home, uu tien StatCard "viec can lam" len truoc.
        <CollapsibleSection
          defaultOpen={!isMobile}
          title="Báo cáo tổng thể"
          note={
            <span className="hidden sm:inline normal-case font-normal text-[var(--ink-400)]">
              {" "}(① Số liệu "Việc cần làm" luôn tô đúng theo vai trò của bạn · ② Bấm vào số bất kỳ để nhảy thẳng tới đúng tab/bộ lọc tương ứng.)
            </span>
          }
        >
          <BaoCaoTab onJump={onJump} isManagerView={isManagerView} canTraHangView={canTraHangView} />
        </CollapsibleSection>
      )}
    </div>
  );
}
