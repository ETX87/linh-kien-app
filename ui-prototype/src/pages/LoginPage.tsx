import { Btn } from "../components/ui/Btn";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-background)] p-6">
      <div className="w-full max-w-[380px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-center shadow-pop">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#2363e0] to-[#0bd0e0] text-[16px] font-extrabold text-white">3T</span>
        <h1 className="mt-3 text-[17px] font-extrabold text-[var(--color-text)]">Đăng nhập · Đặt hàng linh kiện 3T</h1>
        <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">Chỉ tài khoản được cấp quyền mới truy cập được.</p>
        <Btn className="mt-5 w-full" onClick={onLogin}>
          <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[11px] font-bold text-[var(--color-primary)]">G</span>
          Đăng nhập với Google
        </Btn>
      </div>
    </div>
  );
}
