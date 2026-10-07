import type { Env } from "../types";

// Link truy cap truc tiep 1 PXK/dong tra hang tren linh-kien-app theo ID (them 2026-09-09, xem
// frontend/src/lib/pxkDeepLink.ts - dung LAI dung mau duong dan da lam cho PXK "/PMH-000001/"). Ham
// nay chi ghep chuoi, khong validate id - noi goi (pushPxkToKhovan/pushTraHangToKhovan) da biet chac
// id hop le vi vua tu sinh/doc tu DB.
export function buildWorkUrl(env: Env, id: string): string {
  return `${env.FRONTEND_URL.replace(/\/$/, "")}/${id}/`;
}

// Day phieu xuat kho (phieu_xuat_kho) sang khovan (he Quan ly hang ve kho) - danh dau
// "cho xu ly" (pending) ben do - de Kho biet truoc hang sap can xu ly, nhan dien duoc
// khi quet ma (nguyen tac "Kho chi thao tac qua app kho van", chot 2026-09-07). Goi LUC
// "Da chot xong don xuat" (Ke toan chot xong, moc ban giao sang Kho) - AP DUNG CHO CA
// loai_don thuong (mua/cong_no, Kho se "Gui cho KTV"/"Hang tru kho" tu khovan) VA
// loai_don='tra_hang' (Kho se "Nhan hang tra" tu khovan) - phan biet nhanh nao qua
// sender_info.loai_don (xem lib/orderPrefix.ts + routes/shipments.ts ben khovan).
// Tai dung KHOVAN_SYNC_SERVICE/KHOVAN_SYNC_API_KEY da co san (dvbhSyncClient.ts dung
// cho dong bo KTV) - cung 1 Worker khovan, cung 1 external_systems.api_key, chi khac
// duong dan goi (inbound/orders thay vi partner/sync/ktv), khong can secret rieng.
// Best-effort: loi/khovan down KHONG duoc chan thao tac cua nguoi dung (chi log).
// workUrl (them 2026-09-09, phan hoi "các API bắn sang kho vận bh đều kèm URL công việc... kho vận
// sẽ vào link và xác nhận công việc xong") - link truc tiep toi dung PXK/dong tra hang tren
// linh-kien-app (xem frontend/src/lib/pxkDeepLink.ts), dat trong sender_info (JSON tu do, khovan
// khong can doi schema van luu duoc) de FE khovan tu doc va hien thanh nut/link bam qua.
export async function pushPxkToKhovan(
  env: Env,
  orderCode: string,
  senderName: string,
  loaiDon: string | null,
  note: string,
  exportSlipCode?: string | null,
  workUrl?: string | null,
  // Kho xuat "bac"/"nam" cua phieu (chuyen tay hoac theo khu vuc, migration 0070) - de khovan biet kho MB/MN nao xu ly.
  mienXuat?: string | null,
): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: orderCode,
        export_slip_code: exportSlipCode ?? undefined,
        sender_name: senderName,
        sender_info: { loai_don: loaiDon, work_url: workUrl ?? undefined, mien_xuat: mienXuat ?? undefined },
        note,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[khovanPush] fetch that bai", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[khovanPush] exception", err instanceof Error ? err.message : err);
  }
}

// Day thung "Tra hang" (dat_don_hang, loai_don='tra_hang') sang khovan - them 2026-09-08 (Luong
// C, xem Artifact "Ma tran luong Kho van"). Goi NGAY khi Ke toan duyet mem xong (SOM HON
// pushPxkToKhovan o tren - hang ve kho That truoc khi QC kiem, khong doi den luc TN tao PXK o
// cuoi luong nua). KHAC pushPxkToKhovan: ham nay CHAN thao tac (tra ve ket qua, khong best-effort)
// vi day la moc kich hoat vat ly duy nhat cua ca luong - neu khovan loi ma van cho Ke toan duyet
// xong, thung se "mat tich" khong co trong khovan de Kho nhan (da thong nhat voi nguoi dung
// 2026-09-08: khong cho hoan tat duyet, tra loi de Ke toan thu lai).
export async function pushTraHangToKhovan(
  env: Env,
  orderCode: string,
  senderName: string,
  note: string,
  workUrl?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: orderCode,
        sender_name: senderName,
        sender_info: { loai_don: "tra_hang_qc", work_url: workUrl ?? undefined },
        note,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `khovan tra ve ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Bao khovan biet co 1 dong hang dang THIEU can tim nguon (them 2026-09-10, phan hoi "Ticket đơn
// thiếu linh kiện này cần có kho xử lý => thiếu API bắn sang Kho xử lý... api đã có sẵn và đang hoạt
// động sẵn" - nguoi dung xac nhan "he thong quan ly kho" chinh la khovan, tai dung nguyen ha tang nay
// thay vi tich hop moi). Goi tu openThieuLkForDonHang() ngay luc tao ticket (trang thai dau tien luon
// la "Cho kho xu ly") - best-effort giong pushPxkToKhovan (loi/khovan down KHONG duoc chan tao ticket).
export async function pushThieuLkToKhovan(env: Env, thieuLkId: string, senderName: string, note: string, workUrl?: string | null): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: thieuLkId,
        sender_name: senderName,
        sender_info: { loai_don: "thieu_lk", work_url: workUrl ?? undefined },
        note,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[khovanPush] thieu-lk fetch that bai", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[khovanPush] thieu-lk exception", err instanceof Error ? err.message : err);
  }
}

// Bao NGUOC cho khovan biet trang thai moi cua 1 "shipment" ben do - dung chung cho 3 truong hop:
// QC tu choi 1 thung "TRA-" da ve kho (chot 08/09/2026), VA (them 2026-09-09, phan hoi "khi xác nhận
// bên hệ thống linh kiện xong => tự bắn api trạng thái mới về cho app khovan") khi mot buoc Kho
// duoc xac nhan THANG tren linh-kien-app (qua link, khong qua khovan nua) - "received" cho buoc Kho
// nhan thung hang tra vat ly, "handed_over" cho cac buoc Kho gui/ket thuc 1 PXK. Best-effort (khac
// pushPxkToKhovan/pushTraHangToKhovan - day chi la cap nhat hien thi cho khop thuc te, khong phai
// moc kich hoat vat ly nao, loi o day khong nen chan thao tac cua nguoi dung).
async function updateKhovanBoxStatus(env: Env, orderCode: string, boxStatus: "qc_rejected" | "received" | "handed_over", note: string): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders/${encodeURIComponent(orderCode)}/status`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({ box_status: boxStatus, note }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[khovanPush] status-update fetch that bai", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[khovanPush] status-update exception", err instanceof Error ? err.message : err);
  }
}

export function notifyTraHangQcRejected(env: Env, orderCode: string, note: string): Promise<void> {
  return updateKhovanBoxStatus(env, orderCode, "qc_rejected", note);
}

// Kho xac nhan da NHAN thung hang tra (TRA-xxxxxx) THANG tren linh-kien-app qua link (bo qua buoc
// quet ma vat ly qua khovan - chot nguoi dung 2026-09-09) - bao khovan cap nhat box_status='received'
// giong het nhu khi chinh khovan goi vao /tra-hang/:maThung/kho-xac-nhan, de danh sach cong viec ben
// khovan het hien "cho xu ly" cho dung thung nay.
export function notifyTraHangReceivedViaApp(env: Env, maThungTra: string, note: string): Promise<void> {
  return updateKhovanBoxStatus(env, maThungTra, "received", note);
}

// 1 buoc Kho (gui KTV/hang tru kho/ket thuc/nhan hang tra) cua 1 PXK duoc xac nhan THANG tren
// linh-kien-app qua link thay vi qua nut trong khovan - bao khovan cap nhat box_status='handed_over'
// de khong con hien "cho xu ly" sai cho PXK nay nua.
export function notifyPxkAdvancedViaApp(env: Env, orderCode: string, note: string): Promise<void> {
  return updateKhovanBoxStatus(env, orderCode, "handed_over", note);
}
