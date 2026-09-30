import { KtvTab } from "./UsersModule";
import { useAuth } from "../auth/AuthContext";

// Muc menu "Danh sách KTV" (them 2026-09-05, phan hoi "danh sách KTV trong quản lý tài khoản => đẩy
// ra menu để các vai trò nhân viên văn phòng có thể xem được thông tin (cấp quyền cho kế toán quyền
// sửa trần công nợ, mã misa, tên misa của KTV)") - dung LAI chinh KtvTab cua UsersModule.tsx (khong
// nhan doi bang/logic), chi khac o mode: Kế toán duoc sua Tran cong no/Ma MISA/Ten MISA, cac vai tro
// con lai duoc phep vao muc nay (xem dieu kien allowedModules o App.tsx) chi xem duoc (readonly).
// Đường vào của Admin ("Quản lý User" > "KTV hiện trường", mode="admin" mac dinh) không đổi.
export function DanhSachKtvModule() {
  const auth = useAuth();
  const canEditCongNoMisa = auth.status === "authenticated" && auth.user.la_ke_toan;
  // TN (2026-09-30): sua Ma/Ten MISA (mode "tn"); vua Ke toan vua TN -> "ke-toan" (rong hon).
  const canEditMisa = auth.status === "authenticated" && auth.user.la_tac_nghiep;
  return (
    <div className="anim-in">
      <KtvTab mode={canEditCongNoMisa ? "ke-toan" : canEditMisa ? "tn" : "readonly"} />
    </div>
  );
}
