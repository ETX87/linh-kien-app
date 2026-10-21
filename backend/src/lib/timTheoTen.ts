// Tim nguoi theo TEN (phan hoi 2026-09-28: "bổ sung tìm kiếm theo tên người gửi (tên KTV)") - o tim kiem
// cac danh sach truoc day chi so LIKE tren cot EMAIL (nguoi_tao/nguoi_nhan_hang), go ten KTV khong ra gi.
// So sanh o JS thay vi LIKE cua SQLite vi LIKE chi khong phan biet hoa/thuong voi chu ASCII va KHONG bo dau:
// go "le ngoc anh" / "LÊ NGỌC ANH" deu phai khop "Lê Ngọc Anh". Danh ba KTV + users chi vai tram dong nen
// doc het 1 lan moi request tim kiem la re.

export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Chu cai goc cua 1 ky tu (bo dau thanh/dau mu, đ -> d).
function goc(ch: string): string {
  return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}
function chuan(s: string): string {
  return s.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * `text` co chua `q`? q rong -> true. Ky tu KHONG dau trong q khop moi bien the co dau ("le" -> "Lê", "lẻ", "Telesale");
 * ky tu CO dau phai khop DUNG dau (sua 2026-09-30, phan hoi go "lẻ" ra ca "Telesale"/"Lê Thị Hường") - go "lẻ" chi ra
 * "Khách hàng lẻ", go "nguyễn van" khop "Nguyễn Văn". Ban sao cua frontend/src/lib/boDau.ts - doi 1 ben doi ca 2.
 */
export function khopTim(text: string | null | undefined, q: string): boolean {
  const qq = chuan(q);
  if (!qq) return true;
  if (!text) return false;
  const Q = [...qq];
  if (Q.every((c) => goc(c) === c)) return boDau(text).includes(boDau(q));
  const T = [...chuan(text)];
  const Tg = T.map(goc);
  for (let i = 0; i + Q.length <= T.length; i++) {
    let dung = true;
    for (let j = 0; j < Q.length && dung; j++) dung = goc(Q[j]) === Q[j] ? Tg[i + j] === Q[j] : T[i + j] === Q[j];
    if (dung) return true;
  }
  return false;
}

/**
 * Email (dang nhap) cua moi nguoi co ten/ma khop `q` (khong dau, khong phan biet hoa/thuong): KTV theo
 * ktv_lien_he.ten_hien_thi/ma_ktv, nhan vien van phong theo users.ten/ten_misa. Tra [] neu q qua ngan.
 */
export async function emailsTheoTen(db: D1Database, q: string): Promise<string[]> {
  const key = boDau(q);
  if (key.length < 2) return [];
  const [ktv, users] = await Promise.all([
    db.prepare("SELECT email_dang_nhap as email, ten_hien_thi, ma_ktv FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL").all<{ email: string; ten_hien_thi: string | null; ma_ktv: string }>(),
    db.prepare("SELECT email, ten, ten_misa FROM users").all<{ email: string; ten: string | null; ten_misa: string | null }>(),
  ]);
  const out = new Set<string>();
  for (const r of ktv.results) if ([r.ten_hien_thi, r.ma_ktv].some((v) => v && khopTim(v, q))) out.add(r.email);
  for (const r of users.results) if ([r.ten, r.ten_misa].some((v) => v && khopTim(v, q))) out.add(r.email);
  return [...out];
}

/** Ma KTV (ktv_lien_he.ma_ktv) co ten/ma khop `q` - cho cac danh sach theo KTV (danh ba, ton kho). */
export async function maKtvTheoTen(db: D1Database, q: string): Promise<string[]> {
  const key = boDau(q);
  if (key.length < 2) return [];
  const { results } = await db.prepare("SELECT ma_ktv, ten_hien_thi FROM ktv_lien_he").all<{ ma_ktv: string; ten_hien_thi: string | null }>();
  return results.filter((r) => [r.ten_hien_thi, r.ma_ktv].some((v) => v && khopTim(v, q))).map((r) => r.ma_ktv);
}

/**
 * Menh de SQL "OR <cot> IN (...)" cho tung cot - rong neu khong co ai khop. SUA 2026-09-29: truoc day 1 dau "?"
 * cho MOI email x MOI cot - go ho pho bien ("nguyen") khop vai chuc nguoi la vuot gioi han 100 tham so cua D1,
 * truy van loi -> o tim "khong tim duoc theo ten". Gio ca danh sach la 1 bind JSON (json_each), moi cot 1 bind.
 */
export function orEmailIn(cols: string[], emails: string[]): { sql: string; binds: string[] } {
  if (emails.length === 0) return { sql: "", binds: [] };
  const json = JSON.stringify(emails);
  return { sql: cols.map((c) => ` OR ${c} IN (SELECT value FROM json_each(?))`).join(""), binds: cols.map(() => json) };
}

/**
 * Tim theo MA YEU CAU SU CO (2026-09-29, "bổ sung tìm kiếm bằng mã yêu cầu sự cố bổ sung"): ma chinh
 * (`dat_don_hang.ma_yeu_cau_su_co`) + cac ma BO SUNG gan them vao don (`dat_don_case`). `a` = alias dat_don_hang.
 * + Mã Lada (`dat_don_hang.ma_lada`, 2026-09-30). Tra " OR ..." + 3 bind.
 */
export function orMaYcsc(a: string, q: string): { sql: string; binds: string[] } {
  return {
    sql: ` OR ${a}.ma_yeu_cau_su_co LIKE ? OR ${a}.ma_lada LIKE ? OR EXISTS (SELECT 1 FROM dat_don_case dc WHERE dc.dat_don_hang_id = ${a}.id AND dc.case_id LIKE ?)`,
    binds: [`%${q}%`, `%${q}%`, `%${q}%`],
  };
}

/** Cung y cho danh sach PXK: phieu co 1 dong don khop ma don / ma yeu cau su co (chinh hoac bo sung) / ma Lada. 4 bind. */
// Tim TEN LINH KIEN khong phan biet hoa/thuong (2026-10-21, v1.377 - "hỗ trợ tìm cả chữ hoa và chữ thường khi tìm tên linh kiện ở các mục
// đơn hàng hoặc phiếu"): LIKE cua SQLite chi bo qua hoa/thuong voi chu ASCII -> go "LÕI LỌC" khong ra "Lõi lọc". Tach tu khoa thanh tu
// (toi da 6), MOI tu phai khop 1 trong 3 dang viet thuong / VIET HOA / Viet hoa chu dau (cac tu AND nhau, khong can lien nhau). Chu ASCII
// LIKE da tu bo qua hoa/thuong. Ca bo tu + bien the di trong 1 BIND JSON ([[%a%,%A%,..],[..]]) - so tham so KHONG doi so voi 1 LIKE cu
// (/status-counts cua PXK lap lai WHERE 5 lan, D1 gioi han 100 tham so). Tra "(...)" de ghep OR voi cac cot khac.
export function tenLkKhopSql(col: string, q: string): { sql: string; binds: string[] } {
  const tu = q.normalize("NFC").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (tu.length === 0) return { sql: `${col} LIKE ?`, binds: [`%${q}%`] };
  const nhom = tu.map((w) => {
    const thuong = w.toLocaleLowerCase("vi");
    return [...new Set([w, thuong, w.toLocaleUpperCase("vi"), thuong.charAt(0).toLocaleUpperCase("vi") + thuong.slice(1)])].map((v) => `%${v}%`);
  });
  return {
    sql: `(NOT EXISTS (SELECT 1 FROM json_each(?) tlk_w WHERE NOT EXISTS (SELECT 1 FROM json_each(tlk_w.value) tlk_v WHERE ${col} LIKE tlk_v.value)))`,
    binds: [JSON.stringify(nhom)],
  };
}

export function orDonTrongPxk(q: string): { sql: string; binds: string[] } {
  // + ma / TEN linh kien cua dong trong phieu (2026-10-21, v1.377 - truoc day tim phieu theo ten LK khong ra gi).
  const ten = tenLkKhopSql("x.ten_lk_snapshot", q);
  return {
    sql: ` OR EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd JOIN dat_don_hang x ON x.id = pd.dat_don_hang_id
             WHERE pd.phieu_xuat_kho_id = pxk.id AND (x.id LIKE ? OR x.ma_yeu_cau_su_co LIKE ? OR x.ma_lada LIKE ? OR x.ma_lk LIKE ? OR ${ten.sql}
               OR EXISTS (SELECT 1 FROM dat_don_case dc WHERE dc.dat_don_hang_id = x.id AND dc.case_id LIKE ?)))`,
    binds: [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, ...ten.binds, `%${q}%`],
  };
}

// Chieu nguoc cua orDonTrongPxk (2026-10-03, "tìm kiếm theo mã đơn hàng, mã xuất trong đơn hàng"): don khop khi nam trong 1 PXK co
// ID phieu / Ma don hang (ma_xuat_kho) / Ma PXK MISA (ma_misa) / ma van don khop tu khoa. a = alias dat_don_hang.
export function orPxkCuaDon(a: string, q: string): { sql: string; binds: string[] } {
  return {
    sql: ` OR EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pd JOIN phieu_xuat_kho px ON px.id = pd.phieu_xuat_kho_id
             WHERE pd.dat_don_hang_id = ${a}.id AND (px.id LIKE ? OR px.ma_xuat_kho LIKE ? OR px.ma_misa LIKE ? OR px.ma_van_don LIKE ?))`,
    binds: [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`],
  };
}
