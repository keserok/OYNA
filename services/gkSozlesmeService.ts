import { supabase } from '../supabaseClient';

// ─── C3 — Kaleci hizmet sözleşmesi: TEK KAYNAK ───────────────────────────────
//
// SORUN: Sözleşme metni İKİ AYRI YERDE duruyordu.
//   1) Uygulamanın içine sabit yazılmış hâli — kalecinin gerçekten gördüğü
//   2) app_config.gk_service_contract — yönetici panelinin düzenlediği,
//      ama HİÇBİR YERİN OKUMADIĞI ikinci kopya
// Aynı ikilik teminat tutarında da vardı: kodda GK_MIN_TEMINAT = 500,
// veritabanında gk_min_balance = 500. Bugün aynı; biri değişse diğeri
// fark etmeyecekti.
//
// Bu bir SÖZLEŞME. Kaleci burada parasal yükümlülük altına giriyor.
// "Hangi metni onayladı?" sorusunun tek bir cevabı olmak zorunda.
//
// ARTIK: Metin ve tutar veritabanından okunur. Panelden değiştirilen metin,
// kalecinin gördüğü metindir.
//
// GÜVENLİK: Okuma başarısız olursa kaleci sözleşmesiz kalmaz — aşağıdaki
// yedek metin gösterilir. Yedek metin ASLA sessizce kullanılmaz; ekran
// "bağlantı kurulamadı" uyarısı gösterir (bkz. ServiceDashboard).

export interface GkSozlesme {
  metin: string;
  teminat: number;
  /** true = veritabanından okunamadı, yedek metin gösteriliyor. */
  yedekMi: boolean;
}

/** Veritabanı okunamazsa gösterilecek metin. Bugünkü canlı metinle aynıdır. */
export const YEDEK_SOZLESME =
  'OYNA Kaleci Hizmet Sözleşmesi: Kabul ettiğin maça ilan edilen saatte katılmayı ' +
  'taahhüt edersin. Mazeretsiz katılmama (no-show) durumunda, ilgili maçın kaleci ' +
  'slot ücreti hesabından otomatik tahsil edilir ve maç kaptanına tazminat olarak ' +
  'aktarılır. Bu tahsilata karşı 48 saat içinde itiraz edebilirsin; itiraz hâlinde ' +
  'durum OYNA yönetimi tarafından incelenir. Hizmet verebilmek için hesabında en az ' +
  '500 TL bakiye bulundurman gerekir (no-show teminatı); bu bakiye ceza tahsilatının ' +
  'güvencesidir.';

export const YEDEK_TEMINAT = 500;

export const getGkSozlesme = async (): Promise<GkSozlesme> => {
  try {
    const [metinRes, teminatRes] = await Promise.all([
      supabase.rpc('get_config_text', { p_key: 'gk_service_contract', p_default: null }),
      supabase.rpc('get_config_number', { p_key: 'gk_min_balance', p_default: YEDEK_TEMINAT }),
    ]);

    const metin = typeof metinRes.data === 'string' ? metinRes.data.trim() : '';
    const teminat = Number(teminatRes.data);

    // Metin boş/okunamadıysa yedeğe düş — kaleci sözleşmesiz kalmasın.
    if (metinRes.error || !metin) {
      return { metin: YEDEK_SOZLESME, teminat: Number.isFinite(teminat) && teminat > 0 ? teminat : YEDEK_TEMINAT, yedekMi: true };
    }

    return {
      metin,
      teminat: Number.isFinite(teminat) && teminat > 0 ? teminat : YEDEK_TEMINAT,
      yedekMi: false,
    };
  } catch (e) {
    console.warn('[gkSozlesme] okunamadı, yedek metin kullanılıyor:', e);
    return { metin: YEDEK_SOZLESME, teminat: YEDEK_TEMINAT, yedekMi: true };
  }
};
