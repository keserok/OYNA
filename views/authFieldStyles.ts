// ═══════════════════════════════════════════════════════════════════════════
// GİRİŞ AKIŞI ALAN STİLLERİ — TEK KAYNAK
//
// Giriş ekranı (AuthScreen) ile numara bağlama ekranı (PhoneLinkScreen) aynı
// alan dilini kullanır: aynı yükseklik, aynı odak halkası, aynı buton.
// İki dosyaya kopyalansaydı biri 58px, öteki 56px olurdu ve kullanıcı iki ekran
// arasında geçerken "bir yerde bir şey kaydı" hissederdi.
//
// NEDEN CSS DEĞİL DE DİZE: bu sınıflar yalnız giriş akışında yaşar. index.css'e
// konsaydı her ekranın paketine girerdi; burada duruyor ve yalnız bu iki ekran
// render edilirken <style> ile basılıyor.
// ═══════════════════════════════════════════════════════════════════════════

export const AUTH_FIELD_CSS = `
@keyframes auRing { to { transform: rotate(360deg); } }

/* Alanlar: yükseklik 58px (rahat dokunma), yumuşak köşe, odakta marka rengiyle
   ince bir halka. Odak halkası kenarlığı kalınlaştırmaz — kutu titremesin. */
.au-field { height: 58px; padding: 0 18px; border-radius: 18px; background: rgba(8,11,17,.85); border: 1px solid rgba(255,255,255,.07); display: flex; align-items: center; gap: 12px; transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }
.au-field:focus-within { border-color: var(--au-accent, rgba(255,255,255,.4)); background: rgba(8,11,17,1); box-shadow: 0 0 0 3px var(--au-accent-soft, rgba(255,255,255,.08)); }
/* Metin 16px: iOS'ta bundan küçük yazı alanına dokununca Safari sayfayı
   otomatik yakınlaştırır ve düzen bozulur. Güven veren okunaklılık da bu boyutta. */
.au-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #fff; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
/* Yer tutucu (ör. "532 123 45 67") BİÇİM İPUCUDUR, veri değil: kurucu
   isteğiyle (21 Ağu 2026) belirgin griden saydam beyaza indirildi —
   girilmiş numarayla karışmasın, ekran sakin dursun. */
.au-input::placeholder { color: rgba(255,255,255,.18); font-weight: 500; letter-spacing: 0; }
/* Alan başlığı — küçük, harf aralıklı, sakin. Formu "okunur" hâle getirir. */
.au-label { display: block; margin: 0 0 8px 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #6b7684; }
.au-cta { width: 100%; height: 58px; border-radius: 999px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px; font-size: 13px; font-weight: 900; letter-spacing: .1em; transition: box-shadow .35s cubic-bezier(.16,1,.3,1), transform .35s cubic-bezier(.16,1,.3,1); }
.au-cta:not(:disabled):hover { transform: translateY(-2px) scale(1.01); }
.au-cta:not(:disabled):active { transform: scale(.98); }
.au-cta:disabled { cursor: default; }
.au-ghost { width: 100%; height: 50px; border-radius: 999px; cursor: pointer; background: transparent; border: 1px solid rgba(255,255,255,.1); color: #8B949E; font-size: 11px; font-weight: 900; letter-spacing: .12em; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .25s, color .25s; }
.au-ghost:hover:not(:disabled) { background: rgba(255,255,255,.05); color: #fff; }
.au-ghost:disabled { opacity: .45; cursor: default; }
.au-link { background: none; border: none; padding: 2px; cursor: pointer; font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.au-spin { width: 15px; height: 15px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: auRing .7s linear infinite; flex-shrink: 0; }
`;
