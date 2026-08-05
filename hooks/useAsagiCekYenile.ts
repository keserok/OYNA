// ════════════════════════════════════════════════════════════════════════════
// AŞAĞI ÇEKİP YENİLE — ekran tarafındaki tek kaynak
// ════════════════════════════════════════════════════════════════════════════
//
// Kullanıcı kararı (4 Ağustos 2026): "Çoğu ekran aşağıya çekilip yenilensin;
// tesis sahibi, kaleci ve hakem arayüzleri de dâhil."
//
// NEDEN AYRI BİR DİNLEYİCİ YOK: Uygulamada zaten uçtaki çekişi devralan ve
// esnemeyi ölçen bir kaydırma motoru var (utils/scrollSystem.ts). İkinci bir
// `touchmove` dinleyicisi aynı parmağı ikinci kez yorumlar; ikisi de yarım
// çalışır ve jest "bazen tutuyor" hâline gelir. Bu yüzden ekran yalnız
// KAYDOLUR — ölçüm, eşik ve karar motorda kalır.
//
// KULLANIMI (tek satır):
//     const yenileniyor = useAsagiCekYenile(yukle);
//
// `yukle` bir Promise döndürürse gösterge o bitene kadar durur; döndürmezse
// kısa bir taban süre boyunca görünür (yanıp sönen gösterge kullanıcıya
// "çalıştı mı?" dedirtir).
//
// HANGİ KAYDIRICI: Ekranın söylemesine GEREK YOK. Motor parmağı hangi
// kaydırıcıda devraldığını zaten biliyor; üstten aşağı çekiş eşiği aşarsa bu
// kaydı çalıştırır. Böylece hem sayfa-akışı ekranları hem de kendi listesi olan
// ekranlar (Cüzdan, Sosyal, Maçlarım, Profil) aynı satırla çalışır.

import { useCallback, useEffect, useRef, useState } from 'react';
import { asagiCekYenileKaydet } from '../utils/scrollSystem';

/** Gösterge en az bu kadar durur — anlık biten yenileme "hiç olmamış" gibi görünmesin. */
const TABAN_SURE_MS = 550;

export interface AsagiCekSecenek {
  /** false ise jest hiç kurulmaz (ör. salt-okunur/misafir bağlam). */
  etkin?: boolean;
}

/**
 * Ekranı "aşağı çekilince yenilenir" yapar.
 * @returns Yenileme sürüyor mu — göstergeyi çizmek için.
 */
export function useAsagiCekYenile(
  yukle: () => void | Promise<unknown>,
  secenek: AsagiCekSecenek = {},
): boolean {
  const { etkin = true } = secenek;
  const [yenileniyor, setYenileniyor] = useState(false);

  // `yukle` her render'da yeni bir işlev olabilir; kaydı her seferinde
  // kurup yıkmamak için son hâlini bir kutuda tutuyoruz.
  const yukleRef = useRef(yukle);
  yukleRef.current = yukle;

  // Aynı anda ikinci bir yenileme başlamasın (parmak iki kez çekilirse).
  const suruyorRef = useRef(false);

  const calistir = useCallback(() => {
    if (suruyorRef.current) return;
    suruyorRef.current = true;
    setYenileniyor(true);
    const basladi = Date.now();

    const bitir = () => {
      const gecen = Date.now() - basladi;
      const kalan = Math.max(0, TABAN_SURE_MS - gecen);
      window.setTimeout(() => {
        suruyorRef.current = false;
        setYenileniyor(false);
      }, kalan);
    };

    try {
      const sonuc = yukleRef.current();
      if (sonuc && typeof (sonuc as Promise<unknown>).then === 'function') {
        (sonuc as Promise<unknown>).then(bitir, bitir);
      } else {
        bitir();
      }
    } catch {
      // Yenileme patlarsa gösterge sonsuza dek dönmemeli.
      bitir();
    }
  }, []);

  useEffect(() => {
    if (!etkin) return;
    return asagiCekYenileKaydet(calistir);
  }, [etkin, calistir]);

  return yenileniyor;
}

export default useAsagiCekYenile;
