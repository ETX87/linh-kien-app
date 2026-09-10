# ui-prototype — Prototype giao diện "Đặt hàng linh kiện 3T"

App **độc lập, dùng mock data** để chốt hướng thị giác mới (bám 3 screenshot 260910) trước khi port
sang `frontend/` thật. KHÔNG nối backend, KHÔNG ảnh hưởng `frontend/` hay `backend/`.

> **`UI_SPEC.md` là hợp đồng thiết kế** — mọi lần sửa UI phải bám file đó (design token, kích thước,
> màu, component, responsive). Không tự ý đổi thiết kế.

## Chạy

```bash
npm --prefix ui-prototype install     # 1 lần
npm --prefix ui-prototype run dev     # http://localhost:5175
```

Hoặc chọn cấu hình `ui-prototype` trong `.claude/launch.json`.

## Trạng thái — TẤT CẢ màn đã dựng

| Màn | Trạng thái |
|---|---|
| S0 AppShell (Sidebar navy / Topbar navy / Breadcrumb / PersonaSwitcher / BottomTabBar / Web↔Mobile) | ✅ |
| S1 Login | ✅ |
| S2 Trang chủ / Việc cần làm (KPI nhóm theo vai trò có màu, Đang tồn, Báo cáo 2 khối, NotificationPanel) | ✅ |
| S3/S4 Mua hàng / Công nợ (KPI · FilterChips + sub-filter · Lọc thêm 6 dropdown · Bulk · Drawer tab · Tạo đơn · Import) | ✅ |
| S6/S7 Trả hàng (đầy đủ + chỉ-theo-dõi, WorkflowStepper 6 bước + nhánh) | ✅ |
| S8 Phiếu xuất kho (sub-tab Mua-Công nợ/Trả hàng · stepper 4 bước · Drawer đơn con + mã + tiền + timeline) | ✅ |
| S9 Thiếu linh kiện (nhóm theo KTV · nút 1-chạm Kho/TN · Drawer) | ✅ |
| S10 Báo cáo (pivot theo KTV cho quản lý · thẻ cá nhân cho thực thi · view riêng cho QC) | ✅ |
| S11 Danh mục linh kiện (sub-tab · Toolbar gate theo cờ · Drawer · Form thêm/sửa · Import) | ✅ |
| S12 Tồn kho công nợ KTV (bảng + đánh giá công nợ · Drawer chi tiết mặt hàng · Import MISA Admin) | ✅ |
| S13 Báo cáo tốc độ xử lý (Admin/View · lọc kỳ + luồng · bảng xếp hạng + xu hướng %) | ✅ |
| S14 Cài đặt (4 tab: Khu vực / Lý do chậm / Loại đề xuất / Google Drive) | ✅ |
| S15 Quản lý người dùng (5 tab: Chờ duyệt / KTV hiện trường / Nhân viên văn phòng / GS phụ trách / Lịch sử đăng nhập) | ✅ |
| S16 ImportExcelDialog · S17 NotificationPanel | ✅ |

"Đặt mua linh kiện" (nav) = module `DatMuaModule` gồm 5 tab nội bộ: Mua hàng · Công nợ · Phiếu xuất kho · Thiếu linh kiện · Báo cáo.

## Kiến trúc (port-ready)

- `styles/tokens.css` — design system (token màu/kích thước từ prompt §3 + screenshot).
- `types/` — shape mô phỏng `frontend/src/modules/datMuaLinhKien/types.ts`.
- `mock/` — seed cứng (SPEC §7 mở rộng). `services/store.ts` — store in-memory + mutation
  (điểm nối tương lai: thay thân hàm bằng `fetch('/api/...')`).
- `lib/permissions.ts` · `lib/scope.ts` · `lib/workflow.ts` — quyền / phạm vi dữ liệu / sinh việc
  cần làm theo persona (SPEC Ma trận 1/2/4).
- `hooks/usePersona.tsx` — 10 persona + 2 cờ độc lập; đổi persona → toàn app re-render theo quyền.
- `components/ui/` · `components/layout/` — thư viện dùng chung, không copy-paste giữa page.

## Đã theo screenshot (ghi đè quyết định cũ của app thật)

Màu nhấn xanh `#1467E8` (nút Duyệt = xanh lá) · nhãn sidebar đầy đủ · logo "QLBH 3T — Linh kiện" ·
topbar có breadcrumb + persona inline · Drawer có tab · Workflow = stepper vòng tròn + nhánh "Từ chối"
· Dashboard KPI nhóm theo vai trò.
