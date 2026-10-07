import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../../api/client";
import { StatCard } from "../../components/x/StatCard";
import { Icon } from "../../components/ui/Icon";
import { ChartCard, ChartLink } from "../../components/charts/ChartCard";
import { TrendChart } from "../../components/charts/TrendChart";
import { DonutChart } from "../../components/charts/DonutChart";
import { HBarList, VBarChart } from "../../components/charts/BarCharts";
import { fmtCompactVND, pct } from "../../components/charts/chartUtils";
import { formatPersonDisplay, usePersonDirectory } from "../../lib/personDisplay";
import type { BaoCaoRow } from "./types";
import { t } from "../../i18n";

interface XuHuongResp {
  ngay: string[];
  tao_moi: number[];
  da_duyet: number[];
  tu_choi: number[];
}

// Phan "nhin nhanh" bang bieu do cua Bao cao tong the (them 2026-09-26, yeu cau "bo sung chart cho bao cao
// sinh dong", doi chieu anh demo "Bao cao" nguoi dung gui): 5 the KPI -> xu huong theo ngay + co cau loai
// don -> 5 buoc xuat kho + Top 5. CUNG nguon so voi 3 bang chi tiet ben duoi (tong/rows tu
// /bao-cao-tong-the, xu huong tu /bao-cao-xu-huong dung chung scope) - moi phan tu bam duoc deu nhay
// toi DUNG tab/bo loc nhu con so tuong ung trong bang, khong tu tao diem den moi.
export function BaoCaoCharts({
  tong,
  rows,
  thang,
  full,
  tonDong,
  jumpDon,
  jumpTraHang,
  jumpPxk,
}: {
  tong: Omit<BaoCaoRow, "email" | "ten" | "slDeXuat" | "slThucDuyet">;
  rows: BaoCaoRow[];
  thang: number;
  full: boolean;
  tonDong: (r: BaoCaoRow) => number;
  jumpDon: (filter: string, loaiDon: "mua" | "cong_no" | undefined, email?: string) => void;
  jumpTraHang: (filter: string, email?: string) => void;
  jumpPxk: (filter: string, email?: string) => void;
}) {
  const personDir = usePersonDirectory();
  const { data: xuHuong } = useQuery({
    queryKey: ["dat-mua-lk-bao-cao-xu-huong", thang, full],
    queryFn: () => api.get<XuHuongResp>("/dat-mua-lk/bao-cao-xu-huong" + buildQuery({ thang, full: full ? 1 : undefined })),
  });
  const isPersonal = rows.length <= 1;
  const kpiWrap = "flex min-w-0";

  const topTonDong = [...rows].filter((r) => tonDong(r) > 0).sort((a, b) => tonDong(b) - tonDong(a)).slice(0, 5);
  const topTien = [...rows].filter((r) => r.tongTienThucTe > 0).sort((a, b) => b.tongTienThucTe - a.tongTienThucTe).slice(0, 5);

  return (
    <div className="space-y-[14px]">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-[14px] xl:grid-cols-5">
        <div className={kpiWrap}>
          <StatCard
            label={t("Tổng đơn")}
            value={tong.slDon.toLocaleString("vi-VN")}
            color="blue"
            iconType={Icon.cart}
            sub={t("Mua {a} · CN {b} · Trả {c}", { a: tong.slDonMua, b: tong.slDonCongNo, c: tong.slDonTraHang })}
            onClick={() => jumpDon("", undefined)}
          />
        </div>
        <div className={kpiWrap}>
          <StatCard
            label={t("Đã duyệt")}
            value={tong.slDuyet.toLocaleString("vi-VN")}
            tone="success"
            iconType={Icon.check}
            sub={t("{p} tổng đơn", { p: pct(tong.slDuyet, tong.slDon) })}
            onClick={() => jumpDon("TN da duyet", undefined)}
          />
        </div>
        <div className={kpiWrap}>
          <StatCard
            label={t("Đang chờ duyệt")}
            value={tong.slDangCho.toLocaleString("vi-VN")}
            tone="warning"
            iconType={Icon.clock}
            sub={t("{p} tổng đơn", { p: pct(tong.slDangCho, tong.slDon) })}
            onClick={() => jumpDon("__OPEN__", undefined)}
          />
        </div>
        <div className={kpiWrap}>
          <StatCard
            label={t("Bị từ chối / huỷ")}
            value={tong.slTuChoi.toLocaleString("vi-VN")}
            tone="danger"
            iconType={Icon.x}
            sub={t("{p} tổng đơn", { p: pct(tong.slTuChoi, tong.slDon) })}
            onClick={() => jumpDon("TN tu choi", undefined)}
          />
        </div>
        <div className={`${kpiWrap} col-span-2 xl:col-span-1`}>
          <StatCard
            label={t("Thực tế đã mua")}
            value={fmtCompactVND(tong.tongTienThucTe)}
            tone="purple"
            iconType={Icon.chart}
            sub={t("Dự kiến {a} · Chờ duyệt {b}", { a: fmtCompactVND(tong.tongTienDatMua), b: fmtCompactVND(tong.tienChoDuyet) })}
            onClick={() => jumpDon("TN da duyet", undefined)}
          />
        </div>
      </div>

      <div className="grid gap-[14px] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChartCard title={t("Xu hướng đơn hàng theo ngày")} subtitle={thang === 0 ? t("Từ đầu tháng tới hôm nay") : t("Cả tháng đã chọn")}>
          <TrendChart
            labels={(xuHuong?.ngay ?? []).map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)}
            series={[
              { key: "tao", label: t("Tạo mới"), color: "var(--chart-new)", values: xuHuong?.tao_moi ?? [] },
              { key: "duyet", label: t("Đã duyệt"), color: "var(--chart-ok)", values: xuHuong?.da_duyet ?? [] },
              { key: "tuchoi", label: t("Từ chối / huỷ"), color: "var(--chart-reject)", values: xuHuong?.tu_choi ?? [], dashed: true },
            ]}
          />
        </ChartCard>
        <ChartCard title={t("Cơ cấu đơn theo loại")} subtitle={t("Bấm 1 loại để mở danh sách")}>
          <DonutChart
            centerLabel={t("Tổng đơn")}
            segments={[
              { key: "mua", label: t("Mua hàng"), value: tong.slDonMua, color: "var(--chart-1)", onClick: () => jumpDon("", "mua") },
              { key: "cn", label: t("Công nợ"), value: tong.slDonCongNo, color: "var(--chart-2)", onClick: () => jumpDon("", "cong_no") },
              { key: "tra", label: t("Trả hàng"), value: tong.slDonTraHang, color: "var(--chart-3)", onClick: () => jumpTraHang("") },
            ]}
          />
        </ChartCard>
      </div>

      <div className={`grid gap-[14px] ${isPersonal ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        <ChartCard title={t("Tiến trình phiếu xuất kho")} subtitle={thang === 0 ? t("3 bước đầu = đang chờ ngay lúc này") : t("Tháng cũ chỉ còn 2 bước kết thúc")} action={<ChartLink onClick={() => jumpPxk("")} />}>
          <VBarChart
            bars={[
              { key: "kt", label: t("Chờ kế toán"), value: tong.slChoKeToan, color: "var(--chart-1)", onClick: () => jumpPxk("Cho ke toan") },
              { key: "kho", label: t("Chờ kho gửi"), value: tong.slChoKhoGui, color: "var(--chart-2)", onClick: () => jumpPxk("Da chot xong don xuat") },
              { key: "gui", label: t("Chờ KTV nhận"), value: tong.slDaGui, color: "var(--chart-3)", onClick: () => jumpPxk("Dang gui KTV") },
              { key: "nhan", label: t("KTV đã nhận"), value: tong.slDaXacNhan, color: "var(--chart-4)", onClick: () => jumpPxk("KTV da nhan") },
              { key: "xong", label: t("Kho kết thúc"), value: tong.slKhoKetThuc, color: "var(--chart-5)", onClick: () => jumpPxk("Kho da ket thuc") },
            ]}
          />
        </ChartCard>
        {isPersonal ? (
          <ChartCard title={t("Cơ cấu tiền")} subtitle={t("Giá trị theo từng giai đoạn")}>
            <HBarList
              rows={[
                { key: "dk", label: t("Đang đặt mua (dự kiến)"), value: tong.tongTienDatMua, display: fmtCompactVND(tong.tongTienDatMua), color: "var(--chart-1)", onClick: () => jumpDon("", undefined) },
                { key: "cd", label: t("Chờ duyệt"), value: tong.tienChoDuyet, display: fmtCompactVND(tong.tienChoDuyet), color: "var(--chart-2)", onClick: () => jumpDon("__OPEN__", undefined) },
                { key: "tt", label: t("Thực tế đã mua"), value: tong.tongTienThucTe, display: fmtCompactVND(tong.tongTienThucTe), color: "var(--chart-3)", onClick: () => jumpDon("TN da duyet", undefined) },
                { key: "cc", label: t("Chờ chuyển tiền"), value: tong.tongChoChuyen, display: fmtCompactVND(tong.tongChoChuyen), color: "var(--chart-4)", onClick: () => jumpPxk("") },
              ]}
            />
          </ChartCard>
        ) : (
          <>
            <ChartCard title={t("Top 5 KTV tồn đọng nhiều nhất")} subtitle={t("Đơn chưa xong + phiếu xuất chưa tới tay KTV")}>
              <HBarList
                ranked
                emptyText={t("Không có KTV nào đang tồn đọng.")}
                rows={topTonDong.map((r) => ({
                  key: r.email,
                  label: formatPersonDisplay(r.email, personDir),
                  value: tonDong(r),
                  sub: t("Chờ duyệt {a} · Xuất kho {b}", { a: r.slDangCho, b: r.slChoKeToan + r.slChoKhoGui + r.slDaGui }),
                  onClick: () => jumpDon("", undefined, r.email),
                }))}
              />
            </ChartCard>
            <ChartCard title={t("Top 5 KTV theo tiền đã mua")} subtitle={t("Tổng thực tế đã duyệt mua")}>
              <HBarList
                ranked
                emptyText={t("Chưa có đơn nào được duyệt mua.")}
                rows={topTien.map((r) => ({
                  key: r.email,
                  label: formatPersonDisplay(r.email, personDir),
                  value: r.tongTienThucTe,
                  display: fmtCompactVND(r.tongTienThucTe),
                  color: "var(--chart-4)",
                  onClick: () => jumpDon("TN da duyet", undefined, r.email),
                }))}
              />
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}
