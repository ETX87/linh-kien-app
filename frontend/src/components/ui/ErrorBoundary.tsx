import { Component, type ReactNode } from "react";
import { Btn } from "./Btn";
import { t } from "../../i18n";

// Chong "trang trắng tinh màn hình" (phan hoi 2026-09-29: "thỉnh thoảng ấn vào trang chủ, trang web bị bug trắng
// tinh màn hình"). Truoc day app KHONG co error boundary nao: 1 loi render bat ky -> React go CA cay -> man trang.
// Nguyen nhan hay gap nhat: cac tab la React.lazy() - sau moi lan deploy, tab trinh duyet dang mo van tro toi file
// chunk cua ban CU (ten co hash) da bi xoa, Worker tra index.html (not_found_handling single-page-application) thay
// vi JS -> import() loi. Loi tai chunk -> tu tai lai trang 1 lan (lay ban moi); loi khac -> hien thong bao + nut
// tai lai thay vi man trang.
const KHOA_TAI_LAI = "loi_chunk_tai_lai_luc";

export function laLoiTaiChunk(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch|ChunkLoadError|MIME type|Unable to preload CSS/i.test(msg);
}

/** Tai lai trang de lay ban moi - toi da 1 lan / 30 giay (tranh vong lap neu that su mat mang). */
export function taiLaiDeLayBanMoi(): boolean {
  try {
    const truoc = Number(sessionStorage.getItem(KHOA_TAI_LAI) ?? 0);
    if (Date.now() - truoc < 30_000) return false;
    sessionStorage.setItem(KHOA_TAI_LAI, String(Date.now()));
  } catch {
    /* sessionStorage bi chan - van thu tai lai */
  }
  window.location.reload();
  return true;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error);
    if (laLoiTaiChunk(error)) taiLaiDeLayBanMoi();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = laLoiTaiChunk(error);
    return (
      <div className="content-card mx-auto my-6 max-w-md p-5 text-center">
        <div className="text-2xl">⚠</div>
        <div className="mt-1 text-[15px] font-bold text-[var(--color-text)]">
          {chunk ? t("Hệ thống vừa được cập nhật phiên bản mới") : t("Có lỗi khi hiển thị màn hình này")}
        </div>
        <div className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          {chunk ? t("Bấm “Tải lại trang” để dùng phiên bản mới nhất.") : t("Bấm “Thử lại”, nếu vẫn lỗi hãy tải lại trang và báo quản trị kèm nội dung bên dưới.")}
        </div>
        {!chunk && (
          <div className="mt-2 break-words rounded-lg bg-[var(--color-subtle)] px-2.5 py-1.5 text-left font-mono text-[11px] text-[var(--color-text-secondary)]">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        <div className="mt-3 flex justify-center gap-2">
          {!chunk && (
            <Btn variant="ghost" onClick={() => this.setState({ error: null })}>
              {t("Thử lại")}
            </Btn>
          )}
          <Btn onClick={() => window.location.reload()}>{t("Tải lại trang")}</Btn>
        </div>
      </div>
    );
  }
}
