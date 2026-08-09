// ─── Davet (referans) kodu yardımcıları ─────────────────────────────────────
//
// B2 kararı (kurucu, 9 Ağustos 2026): davet zincirinin kopuk ucu kayıt
// ekranına değil, Ayarlar'a bağlandı. Kullanıcı kutuya kodun kendisini de
// yapıştırabilir, paylaşım mesajındaki tam bağlantıyı da
// (https://oyna.app/davet/<kod>). Sunucu zaten lower(trim(...)) yapıyor;
// burada yalnız bağlantıdan kodu ayıklayıp görünmez karakterleri süzüyoruz ki
// "geçersiz kod" hatası yanlış yere düşmesin.

/** Yapıştırılan metinden davet kodunu çıkarır: bağlantı, boşluk, tire, büyük
 *  harf hepsi tolere edilir. Geriye yalnız küçük harfli harf+rakam kalır. */
export const normalizeReferralCodeInput = (raw: string): string => {
  let s = (raw || '').trim();
  const link = s.match(/davet\/([A-Za-z0-9]+)/);
  if (link) s = link[1];
  return s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
};

/** Üretilen kodlar 8 karakterdir (get_or_create_referral_code: uuid'in ilk 8
 *  hanesi). Biçim sunucuda değişirse bu sabit de onunla birlikte güncellenir. */
export const REFERRAL_CODE_LENGTH = 8;
