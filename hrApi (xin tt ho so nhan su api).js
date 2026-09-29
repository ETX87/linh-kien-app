// ============================================================================
// hrApi — API HỒ SƠ NHÂN SỰ CHO ĐỐI TÁC NGOÀI (P417). Chỉ đạo Giám đốc 14/09/2026:
//   *"Xây dựng API cho đối tác để lấy được thông tin hồ sơ nhân sự (họ tên · chức danh · gmail ·
//     trạng thái làm việc · quản lý trực tiếp), kết quả trả ra dạng JSON."*
//
// ⚠ ĐÂY LÀ CỬA RA NGOÀI CÔNG TY — khác hẳn `hrLink` (chỉ phục vụ các app NỘI BỘ, xác thực bằng
// Firebase ID-token của chính project gọi). Nên bộ khung dựng theo bốn nguyên tắc:
//
//  1. **KHÔNG CÓ KHOÁ THÌ KHÔNG CÓ DỮ LIỆU.** Xác thực bằng API key riêng của từng đối tác, cấp qua
//     Secret Manager (`HR_API_KEYS`), so sánh theo kiểu chống dò thời gian. Chưa nạp secret ⇒ hàm
//     trả 503 và KHÔNG trả một dòng nào — deploy trước, cấp khoá sau là an toàn.
//  2. **CHỈ NĂM TRƯỜNG GĐ CHO PHÉP.** Mã NS đi kèm chỉ để bên kia nối dữ liệu (và để chỉ đích danh
//     quản lý). TUYỆT ĐỐI không SĐT · CCCD · ngân hàng · địa chỉ · lương — những trường đó thậm chí
//     không có trong ảnh chụp mà hàm này đọc (HS_LOAI_TRU, xem orgSnapshot).
//  3. **MỖI KHOÁ MỘT MỨC TRẦN / NGÀY.** Đối tác gọi sai vòng lặp là chuyện thường; trần chặn việc
//     một lỗi của họ biến thành hoá đơn của mình. Đếm theo ngày, ghi luôn vết ai gọi bao nhiêu lần.
//  4. **ĐỌC ẢNH CHỤP, KHÔNG LẬT CẢ KHO.** 3.5xx hồ sơ/lần gọi là không chịu nổi nếu đối tác hỏi mỗi
//     giờ. Ảnh chụp dựng 02:00 mỗi đêm (~16 lượt đọc) và hàm NÓI RÕ dữ liệu tính đến lúc nào
//     (`duLieuLuc`) — im lặng về độ tươi mới là cách bên kia tự tin vào số liệu cũ.
//
// GET /hrApi
//   Header : Authorization: Bearer <API_KEY>   (hoặc x-api-key: <API_KEY>)
//   Query  : trangThai=on|off|all (mặc định on) · trang=1 · cỡ=500 (tối đa 1000) · maNhanSu=NS-123
//   TÀI KHOẢN LADA (P417b, chỉ đạo GĐ 14/09): trả `taiKhoanLada = { maLada, tenLada }`.
//     ⚠ KHÔNG trả nguyên văn `ladaName` vì chuỗi ấy có **SỐ ĐIỆN THOẠI** lẫn bên trong
//       ("C-0849995477-Tuấn-Võ Thanh Tuấn"). SĐT là PII, không nằm trong danh sách GĐ cho phép.
//       `tenLada` là phần HỌ TÊN đã tách sẵn (dùng chung `ladaFullNameOf` với hrLink).
//       Muốn gửi cả chuỗi gốc thì phải là quyết định riêng của GĐ, thêm cờ, không mặc định.
//   Trả    : { duLieuLuc, nguon, tong, trang, soTrang, nhanSu: [ … ] }
// ============================================================================
const admin = require('firebase-admin')
const crypto = require('crypto')
const { docAnhChup, docLada, ladaFullNameOf, empTitleName, empTitleCodes } = require('./hrlink')

const CO_TOI_DA = 1000
const CO_MAC_DINH = 500
const TRAN_NGAY_MAC_DINH = 500          // số lần gọi/ngày cho mỗi khoá

/* Khoá đọc từ secret `HR_API_KEYS`, dạng: "tenDoiTac:khoa[:tranNgay],tenDoiTac2:khoa2"
   Ví dụ: "lada:9f3c…:2000,amis:77ab…"  — tên đối tác chỉ để GHI VẾT, không dùng để xác thực. */
function docDanhSachKhoa() {
  const raw = String(process.env.HR_API_KEYS || '').trim()
  if (!raw) return []
  return raw.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [ten, khoa, tran] = x.split(':').map((y) => (y || '').trim())
    return { ten: ten || 'không tên', khoa: khoa || '', tranNgay: Number(tran) > 0 ? Number(tran) : TRAN_NGAY_MAC_DINH }
  }).filter((x) => x.khoa.length >= 16)   // khoá ngắn hơn 16 ký tự coi như chưa cấu hình
}

// So sánh CHỐNG DÒ THỜI GIAN: so bằng `===` thì thời gian trả lời tiết lộ dần từng ký tự của khoá.
function trungKhoa(a, b) {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  if (x.length !== y.length) return false
  try { return crypto.timingSafeEqual(x, y) } catch { return false }
}

function layKhoa(req) {
  const h = String(req.headers.authorization || '')
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return (m ? m[1] : String(req.headers['x-api-key'] || '')).trim()
}

const ngayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

/* Đếm + chặn theo NGÀY (giờ VN). Dùng giao dịch để hai lần gọi cùng lúc không ghi đè nhau.
   Trả { ok, da, tran }. Đếm hỏng ⇒ CHO QUA (ok:true): sự cố của bộ đếm không được làm sập API. */
async function demVaChan(db, ten, tran) {
  const ref = db.collection('apiUsage').doc(`${ngayVN()}__${ten}`)
  try {
    return await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      const da = s.exists ? Number(s.data().n) || 0 : 0
      if (da >= tran) return { ok: false, da, tran }
      tx.set(ref, { n: da + 1, ten, ngay: ngayVN(), at: new Date().toISOString() }, { merge: true })
      return { ok: true, da: da + 1, tran }
    })
  } catch (e) {
    console.warn('[hrApi] đếm lượt gọi lỗi (bỏ qua):', e && e.message)
    return { ok: true, da: -1, tran }
  }
}

/* Một hồ sơ → ĐÚNG những trường GĐ cho phép. `tenTheoId` để chỉ đích danh quản lý trực tiếp.
   ⚠ `managerId` là DOC ID, không phải mã NS — nối bằng id, đừng bao giờ nối bằng TÊN (dữ liệu thật
   có hai định dạng tên quản lý lẫn lộn, khớp theo tên là lệch âm thầm; xem chú thích ở hrlink roster). */
/* ⚠⚠ P417b — XOÁ SỐ ĐIỆN THOẠI KHỎI TÊN LADA TRƯỚC KHI RA NGOÀI CÔNG TY ⚠⚠
   `ladaFullNameOf` (dùng cho app NỘI BỘ) chỉ tách được mẫu "C-<sđt>-<tên gọi>-<họ tên>"; dữ liệu thật
   còn ít nhất hai mẫu khác — "LL-Phan Huy Hoàng-0961989414" và "B2B-Trần Bá Quyết-0914422213-CTV" —
   và với chúng hàm ấy TRẢ NGUYÊN VĂN, tức kèm luôn SĐT. Đo trên kho thật: **40/170 tài khoản Lada**
   lọt SĐT ra API đối tác. Bắt được khi tự soi kết quả bằng khoá thử; nếu chỉ nhìn vài dòng đầu thì
   không thấy (hai dòng đầu sạch).
   Nên ở cửa ra ngoài: bỏ MỌI dãy 9–11 chữ số, rồi dọn dấu nối thừa. Thà tên Lada cụt còn hơn phát
   tán số điện thoại của nhân sự. */
const boSdt = (v) => String(v || '')
  .replace(/\d{9,11}/g, '')            // bỏ dãy 9–11 chữ số = số điện thoại
  .replace(/\s+-/g, '-').replace(/-\s+/g, '-')   // dọn dấu nối bị hở sau khi cắt
  .replace(/[-–—_]{2,}/g, '-')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[-–—_\s]+|[-–—_\s]+$/g, '')
  .trim()

function gonHoSo(e, tenTheoId, ladaMap) {
  /* Ảnh chụp nhân sự CỐ Ý không mang `ladaName` (có SĐT lẫn trong chuỗi, xem HS_LOAI_TRU) — tài khoản
     Lada nằm ở bảng riêng `aggregates/ladaSnapshot`. Không đọc được bảng đó ⇒ để trống, KHÔNG đoán. */
  const lada = (ladaMap && ladaMap.get(e.id)) || (ladaMap ? {} : e)
  const ql = (e.positions || []).filter((p) => p.managerId)
  const quanLy = ql.length ? ql.map((p) => {
    const m = tenTheoId.get(p.managerId) || null
    return {
      maNhanSu: m ? (m.code || null) : null,
      hoTen: (m && m.fullName) || p.managerName || null,
      gmail: m ? ((m.gmail || '').toLowerCase() || null) : null,
      chucDanhCuaToi: p.titleName || null,      // quản lý của CHỨC DANH nào (một người có thể kiêm nhiều)
    }
  }) : []
  return {
    maNhanSu: e.code || null,
    hoTen: e.fullName || null,
    chucDanh: empTitleName(e) || null,
    maChucDanh: empTitleCodes(e),
    gmail: (e.gmail || '').toLowerCase() || null,
    trangThaiLamViec: String(e.workStatus || 'on').toLowerCase(),   // 'on' = đang làm · 'off' = đã nghỉ
    // Trống trả CHUỖI RỖNG chứ không phải null: bên nhận hay làm String(x).trim(), mà String(null)
    // = "null" (truthy, 4 ký tự) ⇒ họ tưởng người này ĐÃ khai Lada (bài học P262 ở hrLink).
    taiKhoanLada: {
      maLada: lada.ladaCode || '',
      tenLada: boSdt(ladaFullNameOf(lada.ladaName)),
    },
    quanLyTrucTiep: quanLy,
  }
}

async function handleHrApi(req, res) {
  // Chỉ ĐỌC. Method khác bị chặn ngay — API này không nhận lệnh ghi nào.
  res.set('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'GET') return res.status(405).json({ loi: 'Chỉ hỗ trợ GET' })

  const dsKhoa = docDanhSachKhoa()
  if (!dsKhoa.length) {
    // Chưa nạp secret ⇒ KHÔNG trả dữ liệu. Nói rõ để người quản trị biết phải làm gì.
    return res.status(503).json({ loi: 'API chưa được cấp khoá — liên hệ quản trị hệ thống ETX.' })
  }
  const khoa = layKhoa(req)
  const doiTac = khoa ? dsKhoa.find((k) => trungKhoa(k.khoa, khoa)) : null
  if (!doiTac) return res.status(401).json({ loi: 'Thiếu hoặc sai API key.' })

  const db = admin.firestore()
  const dem = await demVaChan(db, doiTac.ten, doiTac.tranNgay)
  if (!dem.ok) return res.status(429).json({ loi: `Vượt trần ${dem.tran} lượt gọi/ngày.`, daGoi: dem.da })

  // ── Dữ liệu: ảnh chụp trước; ảnh chụp không dùng được thì đọc thẳng (chậm nhưng không bao giờ trả sai) ──
  let all = await docAnhChup(db)
  let nguon = 'anh-chup'
  let duLieuLuc = null
  if (all) {
    const meta = await db.collection('aggregates').doc('nhanSuSnapshot').get().catch(() => null)
    duLieuLuc = meta && meta.exists ? (meta.data().updatedAt || null) : null
  } else {
    const snap = await db.collection('employees').get()
    all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    nguon = 'doc-thang'
    duLieuLuc = new Date().toISOString()
  }

  const tenTheoId = new Map(all.map((e) => [e.id, e]))
  // Tài khoản Lada: đọc bảng riêng khi dữ liệu đến từ ảnh chụp; đọc thẳng thì hồ sơ đã có sẵn trường.
  const ladaMap = nguon === 'anh-chup' ? await docLada(db) : null

  const tt = String(req.query.trangThai || 'on').toLowerCase()
  const maLoc = String(req.query.maNhanSu || '').trim().toUpperCase()
  let ds = all.filter((e) => {
    if (e.approvalStatus && e.approvalStatus !== 'approved') return false   // hồ sơ chưa duyệt: không ra ngoài
    const st = String(e.workStatus || 'on').toLowerCase()
    if (tt === 'on' && st !== 'on') return false
    if (tt === 'off' && st !== 'off') return false
    if (maLoc && String(e.code || '').toUpperCase() !== maLoc) return false
    return true
  })
  ds = ds.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))

  const co = Math.min(Math.max(1, Number(req.query.co) || CO_MAC_DINH), CO_TOI_DA)
  const soTrang = Math.max(1, Math.ceil(ds.length / co))
  const trang = Math.min(Math.max(1, Number(req.query.trang) || 1), soTrang)
  const phan = ds.slice((trang - 1) * co, trang * co)

  console.log(`[hrApi] ${doiTac.ten} · nguồn=${nguon} · trạng thái=${tt} · ${ds.length} hồ sơ · trang ${trang}/${soTrang} · lượt ${dem.da}/${dem.tran}`)
  return res.json({
    duLieuLuc,                      // ảnh chụp lúc nào (ISO) — bên nhận PHẢI biết dữ liệu tính đến bao giờ
    nguon,                          // 'anh-chup' | 'doc-thang'
    trangThaiLoc: tt,
    tong: ds.length,
    trang, soTrang, co,
    nhanSu: phan.map((e) => gonHoSo(e, tenTheoId, ladaMap)),
  })
}

module.exports = { handleHrApi }
