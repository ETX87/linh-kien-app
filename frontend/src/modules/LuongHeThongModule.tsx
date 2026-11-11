import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { khopTim } from "../lib/boDau";
import { NHOM, VAI_TRO, KET_NOI, LICH_CHAY, TONG_QUAN, type Luong, type TheThongTin } from "./luongHeThong/noiDung";
import { LuongNgang, ChuGiai, MAU_MOC } from "./luongHeThong/LuongNgang";

// Muc "Luong & logic he thong" (2026-11-11, v1.471): giai thich truc quan TOAN BO luong nghiep vu - noi dung TINH o
// luongHeThong/noiDung.ts (khong goi API). Quyen xem: moi nhan vien van phong + Admin (App.tsx, cung dieu kien Bao cao toc do).

const TAB_VAI_TRO = "vai-tro";
const TAB_KET_NOI = "ket-noi";
const TAB_TONG_QUAN = "tong-quan";

function TheLuong({ luong, chon, onChon }: { luong: Luong; chon: string | null; onChon: (k: string) => void }) {
  return (
    <Card className="p-4 md:p-5">
      <h3 className="text-[15px] font-bold text-[var(--color-text)]">{luong.ten}</h3>
      {luong.moTa && <p className="text-[13px] text-[var(--color-text-secondary)] mt-1 mb-4 leading-relaxed">{luong.moTa}</p>}
      <LuongNgang luong={luong} chon={chon} onChon={onChon} />
    </Card>
  );
}

function TheNoiDung({ the, chon, onChon }: { the: TheThongTin; chon: Record<string, string>; onChon: (luong: string, moc: string) => void }) {
  return (
    <Card className="p-4">
      <h4 className="text-[14px] font-bold text-[var(--color-text)] mb-2">
        <span className="mr-1.5">{the.bieuTuong}</span>
        {the.tieuDe}
      </h4>
      <ul className="space-y-1.5">
        {the.dong.map((d, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-[var(--color-text-body)]">
            <span className="text-[var(--color-primary)] shrink-0">•</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
      {the.luong && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border-soft)]">
          <div className="text-[12px] font-semibold text-[var(--color-text-secondary)] mb-2">{the.luong.ten}</div>
          <LuongNgang luong={the.luong} chon={chon[the.luong.key] ?? null} onChon={(k) => onChon(the.luong!.key, k)} />
        </div>
      )}
    </Card>
  );
}

interface KetQuaTim {
  nhom: string;
  nhomTen: string;
  luong: string;
  luongTen: string;
  moc: string;
  mocTen: string;
  ai: string;
}

export function LuongHeThongModule() {
  const [tab, setTab] = useState(TAB_TONG_QUAN);
  const [chon, setChon] = useState<Record<string, string>>({});
  const [tim, setTim] = useState("");
  const datChon = (luong: string, moc: string) => setChon((c) => ({ ...c, [luong]: moc }));

  const tabs = [
    { key: TAB_TONG_QUAN, label: "Tổng quan" },
    ...NHOM.map((n) => ({ key: n.key, label: n.ten })),
    { key: TAB_VAI_TRO, label: "Vai trò & quyền" },
    { key: TAB_KET_NOI, label: "Kết nối hệ khác" },
  ];

  // Tim trong moi moc cua moi luong (ten, ma trang thai, ai, mo ta, dieu kien...) - tren may, khong dau.
  const ketQua = useMemo<KetQuaTim[]>(() => {
    const q = tim.trim();
    if (q.length < 2) return [];
    const out: KetQuaTim[] = [];
    for (const n of NHOM) {
      const dsLuong = [...(n.luong ?? []), ...(n.the ?? []).flatMap((t) => (t.luong ? [t.luong] : []))];
      for (const l of dsLuong) {
        for (const m of l.moc) {
          const chu = [m.ten, m.ma, m.ai, m.moTa, ...(m.dieuKien ?? []), ...(m.tiepTheo ?? []), ...(m.tuDong ?? []), ...(m.luuY ?? [])].join(" ");
          if (khopTim(chu, q)) out.push({ nhom: n.key, nhomTen: n.ten, luong: l.key, luongTen: l.ten, moc: m.key, mocTen: m.ten, ai: m.ai });
        }
      }
    }
    return out.slice(0, 30);
  }, [tim]);

  const nhom = NHOM.find((n) => n.key === tab);

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              Toàn bộ luồng nghiệp vụ của app Đặt mua linh kiện: ai làm gì, ở bước nào, hệ thống tự động quyết định ra sao. Bấm vào từng mốc trên luồng để
              xem chi tiết; “▾ Xem chi tiết” mở toàn bộ các bước.
            </p>
            <div className="mt-3">
              <ChuGiai />
            </div>
          </div>
          <div className="md:w-72 shrink-0 relative">
            <input
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm trạng thái, vai trò, quy tắc…"
              className="o-tim w-full"
            />
            {ketQua.length > 0 && (
              <div className="absolute z-20 right-0 left-0 mt-1 max-h-80 overflow-y-auto bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)]">
                {ketQua.map((k) => (
                  <button
                    key={`${k.luong}-${k.moc}`}
                    type="button"
                    onClick={() => {
                      setTab(k.nhom);
                      datChon(k.luong, k.moc);
                      setTim("");
                    }}
                    className="focus-ring w-full text-left px-3 py-2 hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border-soft)] last:border-0"
                  >
                    <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{k.mocTen}</div>
                    <div className="text-[11px] text-[var(--color-text-faint)] truncate">
                      {k.nhomTen} › {k.luongTen}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {tim.trim().length >= 2 && ketQua.length === 0 && <div className="mt-1 text-[12px] text-[var(--color-text-faint)]">Không có mốc nào khớp.</div>}
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === TAB_TONG_QUAN && <TongQuan onMo={setTab} />}

      {nhom && (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">{nhom.gioiThieu}</p>
          {(nhom.luong ?? []).map((l) => (
            <TheLuong key={l.key} luong={l} chon={chon[l.key] ?? null} onChon={(k) => datChon(l.key, k)} />
          ))}
          {nhom.the && nhom.the.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {nhom.the.map((t) => (
                <TheNoiDung key={t.tieuDe} the={t} chon={chon} onChon={datChon} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === TAB_VAI_TRO && <VaiTroTab />}
      {tab === TAB_KET_NOI && <KetNoiTab />}
    </div>
  );
}

function TongQuan({ onMo }: { onMo: (tab: string) => void }) {
  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <h3 className="text-[15px] font-bold text-[var(--color-text)] mb-1">Hành trình 1 đơn hàng</h3>
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Bấm 1 giai đoạn để mở luồng chi tiết của giai đoạn đó.</p>
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max min-w-full">
            {TONG_QUAN.map((g, i) => {
              const m = MAU_MOC[g.loai];
              const cuoi = i === TONG_QUAN.length - 1;
              return (
                <button key={g.ten} type="button" onClick={() => onMo(g.nhom)} className="focus-ring group relative flex flex-col items-center flex-1 min-w-[124px] rounded-lg pt-1 pb-1.5">
                  {!cuoi && <div className="absolute top-[25px] h-0.5" style={{ left: "50%", width: "100%", background: "var(--color-border)" }} />}
                  <div className="relative z-10 w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-bold text-white transition-transform group-hover:scale-110" style={{ background: m.nen }}>
                    {cuoi ? "✓" : i + 1}
                  </div>
                  <span className="mt-2 text-[12px] font-semibold text-center leading-tight px-1 text-[var(--color-text)]">{g.ten}</span>
                  <span className="mt-0.5 text-[10px] text-center leading-tight px-1 text-[var(--color-text-faint)]">{g.ai}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <button type="button" onClick={() => onMo("tra-hang")} className="focus-ring text-left rounded-lg px-3 py-2.5 bg-[var(--color-purple-soft)] hover:brightness-95">
            <div className="text-[12px] font-bold text-[var(--color-purple-strong)]">↳ Nhánh Hàng trả</div>
            <div className="text-[12px] text-[var(--color-text-body)]">Kế toán duyệt mềm → Kho → QC → phiếu PTL → Kho nhận hàng trả.</div>
          </button>
          <button type="button" onClick={() => onMo("thieu-hang")} className="focus-ring text-left rounded-lg px-3 py-2.5 bg-[var(--color-warning-soft)] hover:brightness-95">
            <div className="text-[12px] font-bold text-[var(--color-warning-strong)]">↳ Nhánh Thiếu hàng</div>
            <div className="text-[12px] text-[var(--color-text-body)]">Kho tiếp nhận / chuyển Mua hàng → hàng về → đơn tự duyệt vào phiếu.</div>
          </button>
          <button type="button" onClick={() => onMo("phieu-tien")} className="focus-ring text-left rounded-lg px-3 py-2.5 bg-[var(--color-danger-soft)] hover:brightness-95">
            <div className="text-[12px] font-bold text-[var(--color-danger-strong)]">↳ Nhánh Nhận thiếu</div>
            <div className="text-[12px] text-[var(--color-text-body)]">KTV báo nhận thiếu → Kho kiểm tra → Kế toán hoàn tiền / gửi bù.</div>
          </button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h4 className="text-[14px] font-bold text-[var(--color-text)] mb-2">⚖️ Nguyên tắc vận hành</h4>
          <ul className="space-y-1.5 text-[13px] leading-snug text-[var(--color-text-body)]">
            <li>• Tự động duyệt 100% — người chỉ quyết ở bước cần (TBP, GS vượt trần, Kho, Mua hàng, Kế toán, QC).</li>
            <li>• Mọi quyết định tự động ghi LÝ DO vào lịch sử đơn / phiếu.</li>
            <li>• Backend là nguồn duy nhất tính tiền, chiết khấu, trạng thái.</li>
            <li>• Kế toán làm thay được mọi việc của Tác nghiệp.</li>
            <li>• Thời gian lưu và hiển thị theo giờ Việt Nam (+7).</li>
          </ul>
        </Card>
        <Card className="p-4">
          <h4 className="text-[14px] font-bold text-[var(--color-text)] mb-2">🧾 3 loại đơn</h4>
          <ul className="space-y-1.5 text-[13px] leading-snug text-[var(--color-text-body)]">
            <li>
              • <b>Mua</b> (PMH): KTV trả tiền, có chiết khấu — gồm cả TRỪ CÔNG NỢ (mua LK đang giữ công nợ) và Mua công nợ đối tác.
            </li>
            <li>
              • <b>Công nợ</b> (PCN): ký gửi / hỗ trợ, tính vào công nợ KTV, xét trần.
            </li>
            <li>
              • <b>Trả hàng</b> (PTL): KTV trả LK về kho, qua Kế toán → Kho → QC.
            </li>
            <li>• Mỗi phiếu chỉ chứa 1 nhóm loại đề xuất — không trộn.</li>
          </ul>
        </Card>
        <Card className="p-4">
          <h4 className="text-[14px] font-bold text-[var(--color-text)] mb-2">⏰ Lịch hệ thống tự chạy</h4>
          <ul className="space-y-1.5">
            {LICH_CHAY.map((l) => (
              <li key={l.gio} className="text-[13px] leading-snug text-[var(--color-text-body)]">
                <span className="font-semibold text-[var(--color-text)]">{l.gio}:</span> {l.viec}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function VaiTroTab() {
  const [q, setQ] = useState("");
  const ds = VAI_TRO.filter((v) => !q.trim() || khopTim([v.ten, v.co, v.xem, ...v.lam].join(" "), q));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm vai trò hoặc việc…" className="o-tim w-full sm:w-72" />
        <span className="text-[12px] text-[var(--color-text-faint)]">
          {ds.length}/{VAI_TRO.length} vai trò · 1 tài khoản có thể bật nhiều cờ cùng lúc
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ds.map((v) => (
          <Card key={v.ten} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[20px] leading-none">{v.bieuTuong}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-[var(--color-text)]">{v.ten}</div>
                <code className="text-[11px] text-[var(--color-text-faint)]">{v.co}</code>
              </div>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1">Làm được</div>
            <ul className="space-y-1 mb-3">
              {v.lam.map((d) => (
                <li key={d} className="flex gap-2 text-[13px] leading-snug text-[var(--color-text-body)]">
                  <span className="text-[var(--color-success)] shrink-0">✓</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1">Phạm vi xem</div>
            <p className="text-[13px] leading-snug text-[var(--color-text-body)]">{v.xem}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

const CHIEU_NHAN = { vao: "← Vào app", ra: "→ Ra ngoài", hai_chieu: "⇄ Hai chiều" } as const;

function KetNoiTab() {
  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="shrink-0 mx-auto md:mx-0 w-36 h-36 rounded-full flex flex-col items-center justify-center text-center bg-[var(--color-primary-soft)] border-2 border-[var(--color-primary)]">
            <div className="text-[24px]">🔩</div>
            <div className="text-[13px] font-bold text-[var(--color-primary-dark)] leading-tight px-3">Đặt mua linh kiện</div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">Workers + D1</div>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {KET_NOI.map((k) => (
              <div key={k.ten} className="rounded-lg px-2.5 py-2 bg-[var(--color-surface-soft)] border border-[var(--color-border-soft)]">
                <div className="text-[12px] font-semibold text-[var(--color-text)] truncate">
                  {k.bieuTuong} {k.ten}
                </div>
                <div className="text-[11px] text-[var(--color-primary-dark)]">{CHIEU_NHAN[k.chieu]}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {KET_NOI.map((k) => (
          <Card key={k.ten} className="p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-[14px] font-bold text-[var(--color-text)]">
                <span className="mr-1.5">{k.bieuTuong}</span>
                {k.ten}
              </h4>
              <span className="text-[11px] font-semibold px-2 py-[3px] rounded-[var(--radius-badge)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] whitespace-nowrap">{CHIEU_NHAN[k.chieu]}</span>
            </div>
            <ul className="space-y-1.5">
              {k.dong.map((d) => (
                <li key={d} className="flex gap-2 text-[13px] leading-snug text-[var(--color-text-body)]">
                  <span className="text-[var(--color-primary)] shrink-0">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
