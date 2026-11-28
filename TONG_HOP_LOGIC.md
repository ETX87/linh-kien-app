# Tổng hợp logic — App Đặt linh kiện (`linh-kien-app`)

> Mô tả logic **đang chạy thật** (theo code + `CLAUDE.md` tới 17/11/2026, v1.516). `CLAUDE.md` giữ chi tiết kỹ thuật (tên hàm, mã lỗi,
> migration, lý do từng quyết định); file này là bản tóm tắt nghiệp vụ để nắm nhanh. Yêu cầu đã chốt: `Yeu_cau_tong_hop_du_an.md`
> (đóng vai trò SRS); lịch sử: `nhat_ky_lam_viec.md`. Trong app còn có màn "Luồng & logic hệ thống" (`modules/luongHeThong/noiDung.ts`).
> Logic đổi thì sửa đè đúng mục. Không ghi tài khoản, mật khẩu, khoá.

## 1. Hệ thống là gì

- Quản lý toàn bộ luồng **mua / xuất kho / trả hàng / công nợ linh kiện** cho KTV, Trạm, văn phòng — tách từ module "Đặt mua linh kiện"
  của DVBH (19/08/2026), nay là hệ độc lập: 1 Worker (Hono, phục vụ cả API và React build) + D1. Cron mỗi giờ. Ảnh lưu Google Drive
  (uỷ quyền 1 tài khoản Google; token lưu mã hoá theo khoá hệ thống — đổi khoá thì Admin phải "Kết nối lại" ở Cài đặt › Google Drive, trang này báo "Cần kết nối lại").
- Đơn = `dat_don_hang` (DDH-…); phiếu xuất kho = `phieu_xuat_kho` (PMH mua / PCN công nợ / PTL trả hàng).

## 2. Vai trò (cờ trên tài khoản)

| Vai trò | Việc chính |
|---|---|
| KTV DVBH / Vệ tinh (Vệ tinh → Trạm nhận thay; Vệ tinh không tự tạo đơn) | Đặt hàng cho mình, chuyển tiền, xác nhận nhận hàng, báo nhận thiếu |
| Tác nghiệp (TN) — Kế toán được làm thay toàn bộ | Duyệt tay đơn còn sót, sửa / chuyển đơn, quản lý phiếu xuất |
| Kế toán | Xác nhận tiền, mã đơn hàng / mã MISA, chốt phiếu, quỹ, công nợ, hạn mức dự trữ |
| Kho | Thiếu hàng (tiếp nhận, hàng về, từ chối), in / gửi phiếu, nhận hàng trả |
| Mua hàng | Xem toàn bộ (chỉ đọc) + xét duyệt mã LK + ticket "Chờ mua hàng" |
| QC | Kiểm hàng trả; đặt hàng cho chính mình như 1 KTV; phiếu xuất chỉ thấy phiếu mình nhận (v1.520) |
| Giám sát (GS chính theo khu vực + GS phụ) | Đặt hộ mọi KTV, duyệt vượt trần (mã EO), hủy hộ, xác nhận chuyển tiền hộ |
| TBP | Duyệt LK đặc thù |
| View | Xem mọi menu, chỉ đọc, theo khu vực được gán |
| NV sửa chữa | Đặt CÔNG NỢ SỬA CHỮA cho chính mình (như 1 KTV) |
| Admin | Toàn quyền |

Phạm vi dữ liệu theo **Khu vực** (khu vực hiệu lực của đơn / phiếu = khu vực chọn tay nếu có, không thì khu vực tự tính bằng trigger).

## 3. Tạo đơn & tự động duyệt (100%)

1 bộ quyết định dùng chung cho tạo tay, import Excel, kiểm tra trước trên form, API đối tác:
- **Chặn tạo**: đơn có tiền mà giá 0 (trừ LK cho phép giá 0đ); công nợ khi người nhận chưa có Mã MISA; TRỪ CÔNG NỢ thiếu tồn KTV.
- LK đặc thù (loại đề xuất không bỏ qua TBP) → **Chờ TBP**; công nợ vượt trần → **Chờ GS duyệt** (nhập mã EO). GS, KTV "không có trần",
  LK B2B, HỖ TRỢ 0 ĐỒNG, trả góp TG12, đơn sửa chữa không xét trần.
- Còn lại kiểm **tồn kho công ty theo khu vực của đơn** (FIFO theo thời gian tạo): đủ → tự duyệt + vào phiếu; thiếu + có tiền → **Chờ thanh toán**
  (vào phiếu, KTV chuyển tiền trước); thiếu + không tiền → **Chờ hàng** + ticket thiếu hàng. LK "không kiểm tra tồn kho" luôn coi là đủ.
- Mọi quyết định tự động ghi lý do vào lịch sử đơn; giao diện giải thích "đang ở đâu, chờ ai" bằng luồng quy trình ngang.

## 4. Giá & chiết khấu

Giá chốt tay luôn thắng. **Linh kiện B2B** (v1.575): luôn Giá KTV (chưa có Giá KTV → giá niêm yết), không áp bậc thang 200–500k / Đình tủ / giá dự phòng; đơn có yêu cầu hóa đơn, KH chuyển khoản, KH lẻ vẫn giá niêm yết; tiền B2B vẫn cộng vào tổng ngày để xét mốc cho LK khác. **Phí dịch vụ** (LK có tên "phí dịch vụ", vd mã 10002 / 1002 — 150.000đ): lúc tạo đơn KTV được nhập số tiền thực tế
(mặc định giá danh mục); khác giá danh mục → ghi làm giá chốt của đơn (không chiết khấu), log ghi rõ. Bậc thang theo **tổng ngày** của KTV (+ phiếu đang mở chưa chốt): < 200k giá bán, 200–500k ×70%, ≥ 500k giá KTV;
Đình tủ ×85%; có yêu cầu hóa đơn / KH chuyển khoản về công ty / KH lẻ / công nợ đối tác = giá niêm yết. Dự phòng chỉ cho MUA DỰ TRỮ trong hạn mức. Backend là nguồn
duy nhất tính tiền (`tinhToanPxk`), form tạo đơn có bản sao để xem trước.

## 5. Phiếu xuất kho & tiền

`Dang tao phieu` (chờ chuyển tiền / chờ mã HĐ) → `Cho ke toan` (Kế toán nhập Mã MISA) → `Da chot xong don xuat` → `Dang gui KTV` →
`KTV da nhan` (tự xác nhận sau 10 ngày) | `Hang tru kho` | `Kho da nhan hang tra`; `Ke toan huy`.
- 1 phiếu chỉ chứa đơn cùng người nhận + loại đơn + nhóm loại đề xuất + hình thức hóa đơn + đối tác + cờ chờ hàng.
- Người đặt TỰ CHỌN gộp / tách phiếu khi tạo đơn (v1.578 — hệ thống không tự quyết). Form hiện ô chọn BẮT BUỘC (chưa chọn thì nút Tạo đơn khoá) khi:
  - **Có đơn kho thiếu** ("Chờ thanh toán") cùng nhóm phiếu với đơn có hàng trong lần đặt, hoặc với phiếu đang tạo của người nhận: **Gộp chung 1 phiếu**
    (chuyển tiền 1 lần, cả phiếu chờ đủ hàng mới xuất) hoặc **Tách phiếu chờ hàng riêng** (đơn có hàng xuất trước). Lịch sử phiếu ghi lựa chọn.
  - **Người nhận có phiếu đang tạo Kế toán đã duyệt đủ tiền** cùng nhóm: **Gộp vào phiếu đã đủ tiền** (phiếu về "Chờ KTV chuyển" phần tăng thêm, Kế toán
    xác nhận lại) hoặc **Tách phiếu mới chờ chuyển tiền**.
  - Tách theo người nhận / loại đơn / loại đề xuất / hóa đơn / KH chuyển khoản / đối tác vẫn BẮT BUỘC, không hỏi. API đối tác không gửi lựa chọn → tách như cũ.
- Phiếu vừa đủ tiền theo BẤT KỲ đường nào (Kế toán duyệt khoản, tự đủ bằng quỹ, Kế toán từ chối ảnh nhưng quỹ đã trả đủ, sửa thực nhận tăng) → đơn "Chờ thanh toán"
  trong phiếu được xét lại tồn: đủ → tự duyệt ở lại phiếu; vẫn thiếu → rời phiếu mang theo tiền sang "Chờ hàng". Bấm gửi Kế toán cũng chạy lại bước này trước khi kiểm.
- Phiếu "Đang tạo phiếu" không còn đơn: ai liên quan (văn phòng / người nhận / người tạo) bấm "Hủy phiếu trống"; cron mỗi giờ tự hủy phiếu trống
  im lặng ≥ 30 phút. Danh sách "tất cả" ẩn phiếu đã hủy không còn đơn (lọc "Kế toán hủy" vẫn thấy).
- Sửa đơn: tích / bỏ "KH đã chuyển khoản về công ty" được khi đơn không giữ tiền riêng và phiếu chứa đơn chưa được Kế toán chốt xuất
  ("Đang tạo phiếu" / "Chờ mã MISA", kể cả đã có tiền): đơn tự rời phiếu cũ như đơn chưa thanh toán (tiền thừa hoàn về quỹ cũ), gom lại đúng quỹ / nhóm.
- **Danh sách Đơn hàng — cột "Hóa đơn"** (v1.571): hiện mặc định, nhãn gọn (Không / HĐ - Không thu phí / HĐ - Có thu phí / HĐ - Xuất cho trạm), lọc chọn nhiều
  trên tiêu đề cột (lọc phía server); "Tải danh sách chi tiết" xuất đúng các đơn đang lọc (cột `yeu_cau_hoa_don` trong file).
- **Quỹ tiền dư KTV**: mọi tiền KTV chuyển vào quỹ người nhận, Kế toán nhập số thực nhận → quỹ tự trả phiếu thiếu cũ nhất; thừa ở lại quỹ;
  hủy / giảm thì hoàn quỹ. Quỹ KH chuyển khoản (đơn tích "KH đã chuyển khoản về công ty", có hoặc không xuất hóa đơn) tách riêng. Tiền cần chuyển = 0 thì không cần Kế toán duyệt.
  Quỹ còn tiền thì tự trừ cả phiếu đang chờ Kế toán ("KTV đã chuyển") — đủ thì Kế toán xác nhận thực nhận 0đ; Kế toán từ chối bằng chứng mà quỹ
  đã trả đủ phiếu thì phiếu đóng luôn "Kế toán đã duyệt" (TN đẩy lại thì giữ "Chờ KTV chuyển").
- Thêm / bớt / tách / chuyển đơn được tới khi Kế toán chốt; đẩy lùi từng bước có lý do; Kế toán duyệt nhanh hàng loạt.
- OCR đọc số tiền ảnh chuyển khoản trên trình duyệt + đối soát ảnh nghi trùng — chỉ cảnh báo, không chặn.

## 6. Thiếu hàng

- **Đặt mua**: ticket theo đơn "Chờ hàng": Kho tiếp nhận / cập nhật dự kiến / chuyển Mua hàng / hàng đã về / từ chối (bắt buộc lý do);
  hàng về → đơn tự duyệt vào phiếu; từ chối / hủy → đơn tự hủy, tiền về quỹ. Tự xác nhận hàng về theo ưu tiên (khiếu nại > ngày cũ > VIP)
  sau mỗi lần nhập tồn. Tách đơn khi về một phần; đổi sang LK tương đương (đổi mã thì BỎ giá chốt tay của mã cũ — giá tính lại theo mã mới).
  Giá chốt tay luôn thắng giá theo loại chiết khấu; dòng đơn trong phiếu có nhãn "Giá chốt tay" khi đang áp.
  **Sửa tiền 1 dòng trong phiếu (v1.570)**: khi phiếu còn "Đang tạo phiếu" VÀ Kế toán CHƯA duyệt tiền — TN bấm số tiền mở "Sửa SL thực xuất / Đơn giá" như cũ;
  Kế toán bấm số tiền mở "Sửa tiền cần chuyển" (nhập tiền của dòng + lý do bắt buộc, hoặc "Về giá tự tính") → ghi giá chốt = tiền ÷ SL, phiếu và quỹ dư tự tính lại,
  log ở cả phiếu và đơn. Kế toán đã duyệt tiền thì không sửa được.
- **Chuyển đơn về "Chờ hàng" bằng tay**: Mua hàng / Kế toán / Admin bấm "⏳ Chuyển chờ hàng" (bắt buộc ghi chú) ở chi tiết đơn Mua / Công nợ
  (không TRỪ CÔNG NỢ, không gửi bù) đang Chờ duyệt / Chờ thanh toán / Đã duyệt mà phiếu chứa đơn còn "Đang tạo phiếu" — kể cả khi Kế toán đã duyệt tiền
  phiếu. Đơn rời phiếu MANG THEO tiền đã trả, ticket mở thẳng ở "Chờ mua hàng". Nút "Chờ hàng" của Tác nghiệp chỉ có khi Kế toán CHƯA duyệt tiền phiếu.
  Ngày dự kiến có hàng (Kho tiếp nhận / cập nhật, Mua hàng "Đã đặt hàng", cả ticket bảo hành) là TUỲ CHỌN — Mua hàng chưa rõ ngày thì bỏ trống (mã EO vẫn bắt buộc);
  nếu nhập phải là ngày thật từ hôm nay tới tối đa 1 năm sau; giá trị 01/01/1900 coi như trống (`lib/ngayDuKien.ts`, v1.545).
  **EO Mua hàng là nguồn chuẩn của ngày dự kiến (v1.568)**: mỗi giờ app hỏi EO cho mọi ticket THB / TLK đang mở; dòng EO đã ban hành, chưa kết thúc, có ngày dự kiến
  và ghi mã ticket (hoặc mã đơn DDH của TLK) ở ô ID CRM / ID đặt hàng, hoặc khớp "mã EO ticket ghi ~ mã LK" → ngày dự kiến của ticket bị GHI ĐÈ bằng ngày sớm nhất
  của EO (kể cả ngày Kho / Mua hàng đã nhập tay), kèm mã PO nếu ticket chưa ghi. EO chưa có ngày → giữ nguyên ticket. THB đổi ngày → thêm 1 dòng lịch sử
  "tự động theo EO Mua hàng" + đẩy sang app Sửa chữa bảo hành. TLK không thêm dòng lịch sử (giữ đồng hồ SLA), chỉ ghi nhật ký `dong_bo_ngay_eo_log`.
  **Cảnh báo "EO báo đã về" (v1.572)**: cùng lượt chạy mỗi giờ, ticket đang mở mà MỌI dòng EO khớp (trừ dòng bị hủy) đã kết thúc và có hàng nhập kho → nhãn đỏ
  "EO báo đã về x/y" ở danh sách Thiếu hàng + khung cảnh báo trong chi tiết ticket (TLK và THB) + chip lọc "EO báo đã về (n)". Hệ thống KHÔNG tự xác nhận hàng về —
  Kho kiểm hàng thực tế rồi bấm "Hàng đã về". Ticket đóng / không còn đúng điều kiện → hết cảnh báo.
- **Đẩy lại** đơn / ticket bị người khác hủy / từ chối: ticket về trạng thái trước khi bị từ chối, đơn về Chờ hàng, lấy lại tiền đã hoàn về quỹ
  (tối đa số dư quỹ). TN / Kế toán / Kho trong 24h kể từ lúc hủy; Admin không giới hạn thời gian.
- **KTV báo nhận thiếu** (ticket NTH): Kho kiểm → gửi bù hoặc hoàn tiền → Kế toán cân đối. Với gửi bù, Kế toán chọn: tạo đơn + phiếu gửi bù trên app (SL thực xuất đơn gốc = SL thực nhận, tiền phần thiếu sang phiếu gửi bù) HOẶC "Kho gửi bù ngoài hệ thống" (không tạo đơn / phiếu, giữ nguyên SL + tiền phiếu gốc, ticket "Đã gửi bù" không có phiếu gửi bù).
- **Thiếu hàng bảo hành** (ticket THB) nhận từ app Bảo hành đổi trả, phản hồi trạng thái về đơn gốc. Từ v1.565 nằm CHUNG 1 danh sách với ticket thiếu hàng đặt mua (menu Thiếu hàng › "Thiếu hàng (đặt mua + bảo hành)" — không còn tab riêng): cột + bộ lọc chọn nhiều **Nguồn tiếp nhận** = App đặt LK · Đổi trả — cấp LK (đơn tạo từ app đổi trả) · API đối tác · Đổi trả — thiếu hàng BH (THB); số đếm cột trạng thái cộng cả THB (Hàng đã về → nhóm "Đã duyệt đơn gốc", từ chối / không mua được / app rút lại → "Đã huỷ bỏ"); dòng THB bấm vào mở popup xử lý THB, không có nút nhanh / chọn hàng loạt. KTV / người không xem được THB chỉ thấy ticket đặt mua. Ticket THB chỉ báo thiếu — KHÔNG tạo đơn xuất; muốn xuất linh kiện cho NV sửa chữa phải có đề xuất linh kiện (đơn DDH) bên app đổi trả. Ô tìm Ctrl+K tìm được ticket THB theo mã ticket / mã case / mã đơn BH (Kho, TN, Mua hàng, Kế toán, View, Admin, Giám sát — Giám sát chỉ xem, từ v1.569) và đơn sửa chữa theo mã đơn BH. Danh sách Đơn hàng tìm ra 0 đơn (từ khoá ≥ 3 ký tự) mà khớp ticket THB → hiện dòng gợi ý + chip mở chi tiết ticket (v1.566, cùng quyền xem THB).

## 7. Hàng trả

Kế toán duyệt mềm → Kho xác nhận (sửa SL thực nhận) → QC xác nhận (tách phần chưa đạt, từ chối kèm ảnh / video) → tự gom phiếu PTL →
Kế toán chốt → Kho nhận hàng trả. Mỗi giai đoạn hạn 8 giờ làm việc (xem 10a), quá hạn bắt lý do chậm.
**Tự hủy chờ Kho**: đơn ở "Chờ kho xác nhận" quá 10 ngày (KTV không gửi hàng) = "Đơn tự hủy" — tính lúc đọc, KHÔNG đổi trạng thái
(`traHangTuHuySql` ở `lib/hanLyDoCham.ts`): không đếm "Chờ Kho" / việc cần làm / còn tồn, nằm ở tab "Đơn tự hủy (quá 10 ngày)" (lọc `__TU_HUY_KHO__`);
hàng về muộn Kho vẫn xác nhận như thường từ tab đó. Ca quá hạn "Kho xác nhận (trả hàng)" của đơn tự hủy KHÔNG tính cho Kho: lần quét kế tiếp
tự chuyển "Đã giải trình" (lý do "Đơn tự hủy — KTV không gửi hàng"), kể cả ca đã Tồn CEO.

## 8. Công nợ, dự trữ, công nợ đối tác

- Công nợ chốt = thực tế (file MISA) + phát sinh − đã trừ (đơn TRỪ CÔNG NỢ đã duyệt tiền); công nợ 0 đồng theo chương trình.
- Hạn mức dự trữ theo Mã MISA (tab riêng): đã mua dự trữ = số MISA + mua sau mốc MISA của từng KTV − trả hàng dự trữ đã chốt.
- MUA HÀNG CÔNG NỢ ĐỐI TÁC: phiếu riêng, không cần chuyển tiền, ghi nợ đối tác, vượt hạn mức → chờ GS.

## 9. Công nợ sửa chữa (NV sửa chữa)

3 loại theo đơn bảo hành (hết BH → MUA HÀNG SỬA CHỮA; còn BH + Karofi → HỖ TRỢ SỬA CHỮA 0 ĐỒNG; còn lại → CÔNG NỢ SỬA CHỮA; ưu tiên TRƯỚC bảo hành: Admin BH duyệt hướng xử lý
"Dịch vụ tính phí" → MUA HÀNG SỬA CHỮA) = loại hệ thống GỢI Ý; người đặt được chọn loại khác (VD sản phẩm hết BH nhưng linh kiện
bên trong còn BH) — đơn lưu `loai_goi_y` + lý do, gắn cảnh báo đỏ "Khác loại gợi ý" ở danh sách đơn, chi tiết đơn, dòng đơn trong phiếu và
bên app Bảo hành đổi trả. Admin BH xác nhận
tiêu hao bên app Bảo hành → tự tạo đơn TRỪ CÔNG NỢ - SỬA CHỮA / TRẢ HÀNG CÔNG NỢ - SỬA CHỮA đi thẳng Kế toán. Đơn "SỬA CHỮA TẠI KHO" cũ
đồng bộ về chỉ để xem (khoá bằng trigger).

## 10a. SLA, quá hạn & vi phạm

12 bước có SLA (bảng `sla_buoc`, Admin sửa ở menu "Quá hạn & vi phạm" › Cấu hình SLA): TBP xác nhận, GS duyệt vượt trần, Duyệt đơn
(TN), Kho tiếp nhận thiếu hàng, Mua hàng đặt hàng, Kế toán xác nhận chuyển tiền, Kế toán chốt phiếu, Kho xuất hàng, 4 bước trả hàng.
**Mọi hạn SLA tính theo GIỜ LÀM VIỆC** (`lib/gioLamViec.ts`, từ v1.527): T2–T6 08:00–12:00 + 13:00–17:00 (8h), T7 08:00–12:00 (4h),
CN nghỉ, chưa trừ ngày lễ. Mặc định mỗi bước 8 giờ làm việc (Mua hàng đặt hàng 16), hạn giải trình 8; hạn "Lý do chậm" của TN và hạn từng
giai đoạn trả hàng cố định 8 giờ làm việc (`GIO_SLA_LY_DO_CHAM`). Hạn = lúc vào bước + số giờ làm việc (vào ngoài giờ thì đếm từ đầu ca kế
tiếp); bước bật "Giờ lịch 24/7" (`tinh_cuoi_tuan` = 1) thì cộng giờ lịch liên tục. "Trễ X giờ" cũng tính theo giờ làm việc; nhắc sắp hết
hạn giải trình khi còn ≤ 2 giờ làm việc. Cron mỗi giờ quét thực thể đang ở
bước + thực thể có log mới → bước quá hạn thành 1 ca `vi_pham` "Chờ giải trình" (hạn giải trình = lúc quá hạn, không sớm hơn lúc ghi nhận,
+ số giờ giải trình). Bộ phận phụ trách (theo cờ vai trò; Kế toán làm thay TN) giải trình → "Đã giải trình"; hết hạn → **"Tồn CEO"** (`Ton CEO`, trước v1.524 gọi "Gắn thẻ"; kết quả cuối,
không gỡ; chuyển ở lần quét mỗi giờ kế tiếp sau hạn). Chỉ nhân viên văn phòng giải trình, KTV không. Lý do chậm bắt buộc của trả hàng và giải trình lý do chậm trên đơn tự thành giải trình. Ca vẫn giữ khi đơn rời bước (ghi người
xử lý, lúc rời). Không quét ngược lịch sử: lần đầu chạy lấy mốc hiện tại; thực thể có log mới (vd đơn vừa bị hủy) chỉ xét khoảng còn mở hoặc vừa kết thúc sau lần quét trước — khoảng đã đóng từ trước bỏ qua (v1.563). Đối tác kéo `GET /api/partner/v1/vi-pham` (con trỏ `cap_nhat_luc`, `id`) + danh sách Tồn CEO
`GET /api/partner/v1/danh-sach-ton?loai=ton-ceo` (cùng hình dạng API `danh-sach-ton?loai=canh-bao-ceo` của DVBH; kéo tăng dần bằng con trỏ `cap_nhat_tu` + `after_id` → `next`).
Người PHẢI giải trình (`vi_pham.nguoi_phu_trach`, tính lại mỗi lần quét khi còn chờ): GS = GS của đơn + GS chính/phụ khu vực; bộ phận khác = người
được gán khu vực của đơn → không ai thì người không gán khu vực → không ai thì cả bộ phận (Kho lọc thêm nhóm LK). Tác nghiệp KHÔNG còn tham gia giải trình (v1.531): 2 bước của TN (Chờ duyệt đơn, duyệt tổng trả hàng) giao Kế toán; người có cờ Tác nghiệp (không phải Kế toán) không tính vào Kho / Mua hàng / QC / TBP / GS dù có bật cờ đó.
Thông báo chuông + đẩy gộp theo người: ca mới / còn ≤ 6 giờ làm việc là hết hạn giải trình / chuyển Tồn CEO. Mở app (nhân viên văn phòng) mà còn ca chờ mình giải trình → popup nhắc (`NhacGiaiTrinhPopup`): số ca, ca sắp hết hạn, nút Giải trình từng ca, "Mở danh sách cần giải trình"; "Để sau" ẩn tới lần mở app sau hoặc khi có ca mới / ca chuyển sắp hết hạn. Giải trình = chọn lý do ("Ghi nhận không
đúng / không thuộc trách nhiệm" + danh mục lý do chậm "Mua hàng" + "Khác") + **lỗi thuộc về** (Lỗi nội bộ / Lỗi đối tác — bắt buộc; từ v1.553 bỏ "Lỗi của tôi" / "Khác", ca cũ giữ nhãn) + **ảnh bằng chứng** 0–5 ảnh (tùy chọn từ v1.553) + nội dung; ca ghi nhận sai cũng chỉ là 1 giải trình, không có bước
Admin xem xét / gỡ thẻ. Chi tiết đơn / phiếu / ticket / đơn trả hàng hiện thanh cảnh báo quá hạn. Mỗi ca hiện "Lỗi vi phạm" (v1.542, `moTaLoi`/`KhoiLoiViPham` ở `modules/viPham/ViPhamUi.tsx`): bộ phận phải làm gì ở bước đó, vào bước lúc nào, hạn SLA, đã xử lý lúc nào / chưa xử lý, trễ bao lâu — cột "Lỗi vi phạm" ở danh sách, khối đầu hộp giải trình + chi tiết ca; mã đơn / phiếu / ticket TLK đều bấm được để mở chi tiết (`MaTicketLink`). Thêm bước SLA mới phải thêm câu ở `VIEC_BUOC`. Tab "Tổng hợp theo dõi" theo bộ phận và theo người.
Hướng dẫn người dùng: `docs/Huong_dan_giai_trinh_qua_han_theo_vai_tro.html`.
Báo cáo "Tốc độ xử lý" (v1.579) hiện cột **SLA** (đọc sống `sla_buoc.so_gio`, ghép giai đoạn báo cáo ↔ bước SLA ở `STAGE_SLA_MA`, `lib/slaMetrics.ts`)
và cột **So với SLA**: Đạt khi TB giờ làm việc ≤ SLA, ngược lại Không đạt (tab Tổng quan so TB toàn hệ thống; tab từng giai đoạn so TB từng tài khoản;
có trong file Excel). Giai đoạn chưa có SLA (Trạm duyệt, TN tạo PXK, chờ chuyển tiền / chờ KTV nhận) để "—". Bước tắt SLA vẫn so, ghi "(tắt)".
**App Nhiệm vụ eOffice** (v1.554, `lib/congNhiemVu.ts`, mã app `dat-linh-kien`, secret `TASK_FEED_KEY`): mỗi ca "Chờ giải trình" thành 1 việc `VP-<id>` của
TỪNG người trong `nguoi_phu_trach` (gửi theo Mã nhân sự, chưa có thì email) — tiêu đề mã đơn / phiếu / ticket · tên bước · lúc quá hạn SLA · hạn giải trình,
hạn = ngày hạn giải trình, khẩn (🔴) khi còn ≤ 6 giờ làm việc, bấm mở "Cần tôi giải trình". Luôn gửi ẢNH CHỤP ĐỦ (`toanBo`): ca đã giải trình / chuyển Tồn
CEO tự biến mất. Gửi: cron mỗi giờ ngay sau quét, ngay sau khi 1 ca được giải trình, Admin bấm "Đẩy lên App Nhiệm vụ" (tab Cấu hình SLA, hiện lần đẩy
cuối). Danh sách không đổi so với lần gửi thành công trước thì không gọi cổng. Chưa nạp khoá → bỏ qua, không ảnh hưởng nghiệp vụ.

## 10b. BC KPIs (menu Hệ thống › BC KPIs)

Chỉ tính khi bấm "Tải số liệu" (`GET /api/bao-cao-kpi`, `routes/baoCaoKpi.ts`), không lưu, không chạy nền; nhân viên văn phòng + Admin xem (chặn KTV / Vệ tinh).
Tuần = WEEKNUM của Excel (tuần bắt đầu Chủ nhật). Miền theo khu vực hiệu lực (có "MB" / "MN"; không có = Khác); phiếu đã chuyển kho xuất thì theo miền xuất.
- **Tỷ lệ thiếu hàng** (đơn mua / công nợ tạo trong tháng; SL = SL thực xuất, chưa có thì SL đề xuất; mặc định bỏ đơn Đã hủy / Từ chối / TN từ chối):
  phân loại theo ticket thiếu LK mới nhất của đơn — không có ticket = Bình thường; LK nhóm b2b = B2B; lý do "Do nhà máy hết hàng" = Khách quan;
  ticket Đã kết thúc / Kho xác nhận hàng về / có ngày hàng về / đơn đã vào phiếu = Đã về hàng; còn lại = Có đơn thiếu.
  Tỷ lệ = Có đơn thiếu ÷ (Có đơn thiếu + Bình thường + Đã về hàng); B2B + Khách quan không tính. Mục tiêu MB 1,5%, MN 2%. "Tỷ lệ phát sinh" = (thiếu + đã về) ÷ cùng mẫu số.
- **Tốc độ Kho** (phiếu tạo trong tháng): giờ từ `chot_ke_toan_luc` → log đầu tiên Đang gửi KTV / Hàng trừ kho / Kho đã kết thúc / Kho đã nhận hàng trả.
  Đạt ≤ 24 giờ lịch (kèm ≤ 8 giờ làm việc theo `lib/gioLamViec.ts`). Chưa chốt: không xét; đã chốt chưa xuất còn trong hạn: "Đang xử lý" (không vào tỷ lệ); quá hạn chưa xuất: Không đạt.
- **Đơn có mã sự cố / Lada** (bỏ đơn hủy; giá trị "Ko", "k", "0", "-"… coi như không có mã): giờ tạo đơn → Kho xuất, giờ tạo đơn → hoàn tất
  (KTV đã nhận / Hàng trừ kho / Kho đã kết thúc / Kho đã nhận hàng trả), chưa xong thì tính đến lúc chạy.

## 10. Lịch chạy tự động (cron mỗi giờ)

Đồng bộ danh bạ KTV / danh mục LK sang DVBH + app Bảo hành mỗi giờ; giá gia88 0h VN; ETX nhân sự 0h thứ Hai (tự tạo KTV + tài khoản, nghỉ
việc tự khoá — Gmail đã là tài khoản văn phòng / Giám sát không bao giờ tự tạo KTV; nút "Tạo tài khoản" ở tab ETX cũng bị chặn khi Gmail đã
khai báo vai trò văn phòng hoặc đã là KTV). Chuyển tài khoản KTV sang văn phòng: mã có Mã MISA hoặc Gmail đã có đơn thì GIỮ liên kết (Mã MISA của
đơn tra theo người nhận → mã gắn Gmail, gỡ là đơn cũ mất Mã MISA); mã chưa dùng thì gỡ Gmail + TỰ TẮT (Admin bật lại được); gắn Gmail cho mã đang trống thì mã tự bật lại; 8h VN tự xác nhận phiếu quá hạn nhận + nhắc KTV; mỗi giờ quét quá hạn SLA + gắn thẻ vi phạm, tự hủy phiếu trống; 0h dọn thông báo cũ / bộ đếm ảnh.

## 11. Kết nối hệ khác

DVBH (tra case CRM — ô Mã YCSC chỉ gửi tra cứu khi mã > 5 ký tự dạng toàn số / `T`+số / `SC`+số / `TSC`+số (mã sự cố 3T, v1.573), quy về chữ HOA; API đối tác tồn kho / lịch sử LK / đơn theo ca — `case-timeline` khớp mã ca trên đơn + mã đơn DDH DVBH gửi kèm từ giải trình (`ma_don`, v1.567); `case-timeline` + `linh-kien/lich-su` kèm `trang_thai_pxk` = trạng thái phiếu chứa đơn (v1.568) / đặt hàng qua API) · App Bảo hành đổi trả (Service Binding: phân loại,
thiếu hàng BH, đơn sửa chữa, trừ công nợ; `GET /api/suachua-partner/lk-theo-case` trả linh kiện đã đặt theo mã case hoặc mã Lada (`ma_lada`); `GET /api/suachua-partner/lada?id=` tra mã Lada (center.dichvu3t.com, cache 10 phút) cho app đổi trả — bỏ đơn trả
hàng / từ chối / hủy — để app đó ưu tiên lên đầu ô chọn linh kiện khi gửi bảo hành) · Phân tích tồn kho 3T (kho dữ liệu MISA) · khovan (đẩy phiếu sang kho — **TẠM DỪNG từ 27/11/2026**: var `KHOVAN_TAM_DUNG="1"` bỏ qua mọi lệnh đẩy/báo trạng thái + đồng bộ danh bạ KTV sang khovan; duyệt trả hàng không còn phụ thuộc khovan; Kho thao tác trên app này) · ETX nhân sự · gia88 (giá) · **EO Mua hàng** (`muahang`, Service Binding
`MUAHANG_SERVICE`, chỉ đọc `GET /api/partner/theo-id`; `POST /api/partner/theo-id` mỗi giờ để đồng bộ ngày dự kiến sang ticket THB / TLK): khung "Mua hàng (EO)" ở chi tiết đơn và chi tiết ticket thiếu hàng hiện PO (3TDO), trạng thái,
SL đặt / về / thiếu, ngày dự kiến, ngày về. App gửi mã đơn, các ticket của đơn, mã case của đơn + cặp "mã EO ticket đã ghi ~ mã LK của đơn"; bên Mua hàng
khớp nếu mã nằm trong ô ID CRM hoặc ID đặt hàng của dòng EO. Đơn có ticket → khung luôn hiện (kể cả "chưa có PO"); đơn khác chỉ hiện khi có PO khớp.

**Cửa sổ thông tin eOffice** (popup toàn màn hình Giám đốc soạn): `GET /api/cua-so` (không cần đăng nhập) → Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG. Frontend `CuaSoThongTin` hiện mỗi lần mở app (và khi quay lại sau ≥ 10 phút ẩn), nút "Vào app" khoá vài giây (theo `khoaNutGiay`). API lỗi / chậm / chưa có khoá → không hiện, người dùng vào app bình thường. Cùng 1 bộ mã ở mọi app hệ DVBH.

## 12. Giới hạn & bảo vệ chung

Giới hạn tần suất theo tài khoản / IP / khoá API; request ghi phải cùng origin; ảnh chỉ JPG/PNG/WEBP/GIF/HEIC ≤ 10MB, hạn mức ảnh / ngày
theo vai trò; thu hồi phiên "đăng xuất mọi thiết bị". Danh sách tham số truyền 1 bind JSON (D1 ≤ 100 tham số).
