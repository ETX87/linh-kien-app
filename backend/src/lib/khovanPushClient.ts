import type { Env } from "../types";

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
export async function pushPxkToKhovan(env: Env, orderCode: string, senderName: string, loaiDon: string | null, note: string): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: orderCode,
        sender_name: senderName,
        sender_info: { loai_don: loaiDon },
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
  note: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({
        order_code: orderCode,
        sender_name: senderName,
        sender_info: { loai_don: "tra_hang_qc" },
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

// QC tu choi 1 thung "TRA-" da ve kho (chot 08/09/2026: hang o lai kho, xu ly thu cong, khong
// tu tao luot xuat tra lai KTV) - bao NGUOC cho khovan biet de hien dung trang thai cuoi, tranh
// de nguyen "Da nhan" gay hieu nham da xong viec. Best-effort (khac pushTraHangToKhovan o tren) -
// day chi la cap nhat hien thi, khong phai moc kich hoat vat ly, loi o day khong nen chan QC.
export async function notifyTraHangQcRejected(env: Env, orderCode: string, note: string): Promise<void> {
  const url = `${env.KHOVAN_SYNC_BASE_URL.replace(/\/$/, "")}/api/v1/inbound/orders/${encodeURIComponent(orderCode)}/status`;
  try {
    const res = await env.KHOVAN_SYNC_SERVICE.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": env.KHOVAN_SYNC_API_KEY },
      body: JSON.stringify({ box_status: "qc_rejected", note }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[khovanPush] status-update fetch that bai", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[khovanPush] status-update exception", err instanceof Error ? err.message : err);
  }
}
