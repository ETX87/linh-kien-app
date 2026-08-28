import { useCallback, useEffect, useRef, useState } from "react";
import { popTopOverlay } from "../lib/overlayStack";

// Nut/vuot "Quay lai" cua he dieu hanh (Android, ke ca khi cai dat PWA standalone) khong duoc SPA nay
// dieu khien (khong dung React Router, khong tung pushState o dau ca - xem App.tsx) nen mac dinh
// thoat thang ung dung ngay lan bam dau tien du dang o man hinh nao - "an nham thoat luon rat bat
// tien" (phan hoi nguoi dung 2026-08-27). Ky thuat "back-button trap" chuan: day san 1 entry lich su
// gia luc mount; nut Quay lai lan dau chi pop ve entry that (khong roi trang - browser TU lui truoc
// khi popstate ban ra, nen luc handler chay la DA DUNG vi tri "that su lui 1 buoc" roi), popstate bat
// duoc de hoi xac nhan thay vi thoat am tham.
//
// FIX (phan hoi 2026-08-28: "popup hỏi thoát app lúc hỏi lúc không, ấn Thoát bị đơ không thoát") -
// BAN CU day lai 1 trap NGAY trong popstate (truoc ca khi biet nguoi dung se chon gi), roi leave() bu
// lai bang go(-2). Loi: go(-2) gia dinh LUON co it nhat 2 entry lich su phia sau (1 trap + 1 "that")
// de lui qua - PWA standalone moi mo (hoac tab moi, chua tung dieu huong) co the CHI CO DUNG 1 entry,
// khien go(-2) vuot qua dau lich su va bi trinh duyet AM THAM BO QUA (khong bao loi) - dialog dong
// nhung app khong thoat, nhin nhu "đơ". Sua: popstate KHONG con day lai trap ngay nua - luc handler
// chay la DA DUNG vi tri "lui 1 buoc that" roi, nen leave() chi can lui THEM DUNG 1 buoc nua (khong
// phai 2) de hoan tat - it hay du lich su den dau cung khong bi vuot qua dau. leavingRef van can giu
// (khac voi 1 ban sua truoc) vi buoc lui nay cua leave() TU no cung ban ra popstate - phai bao handler
// bo qua popstate do, neu khong dialog se hien lai ngay sau khi vua bam "Thoát". Trap CHI duoc day lai
// khi nguoi dung chon "Ở lại" (stay()) - luc do moi can bay tiep cho lan back ke tiep.
export function useExitConfirm(enabled: boolean) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    leavingRef.current = false;
    window.history.pushState({ exitTrap: true }, "");

    function onPopState() {
      if (leavingRef.current) return;
      // Neu co Drawer/Modal dang mo (xem overlayStack.ts), nut Back chi DONG lop do + day lai trap de
      // bay tiep, KHONG hien hop thoai xac nhan thoat (phan hoi 2026-08-28 lan 1).
      if (popTopOverlay()) {
        window.history.pushState({ exitTrap: true }, "");
        return;
      }
      setConfirmOpen(true);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled]);

  const stay = useCallback(() => {
    setConfirmOpen(false);
    window.history.pushState({ exitTrap: true }, "");
  }, []);
  const leave = useCallback(() => {
    leavingRef.current = true;
    setConfirmOpen(false);
    window.history.back();
    // FIX (phan hoi 2026-08-28: "ấn thoát app thì vẫn không thoát") - history.back() co the AM THAM
    // khong lam gi (khong ban popstate, khong bao loi) khi khong con entry lich su nao phia sau de
    // lui qua (PWA standalone moi mo/tab moi chua tung dieu huong). Neu vay, leavingRef se ket "true"
    // VINH VIEN vi khong co popstate nao chay de tu nhien reset no ve false trong onPopState - moi
    // nut Back SAU DO trong ca phien (ke ca de dong Drawer/Modal binh thuong) se bi onPopState bo qua
    // ngay tu dong dau ("if (leavingRef.current) return;"), day moi la nguyen nhan that cua cam giac
    // "đơ" (khong chi thoat khong duoc, ma nut Back con hong luon). Tu phuc hoi sau 1 khoang ngan neu
    // van con o day: thu window.close() (chi thuc su dong duoc tab do script tu mo, da so khong co
    // tac dung nhung vo hai) roi tra leavingRef ve false de nut Back hoat dong binh thuong tro lai.
    setTimeout(() => {
      if (!leavingRef.current) return;
      window.close();
      leavingRef.current = false;
    }, 400);
  }, []);

  return { confirmOpen, stay, leave };
}
