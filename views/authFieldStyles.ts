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

/* ═══ E-POSTA + ŞİFRE AKIŞI (24 Ağustos 2026) ═══════════════════════════════
   Aşağıdakiler şifreli giriş geri geldiğinde eklendi. Yukarıdaki alan dilini
   (58px yükseklik, 18px köşe, marka renkli odak halkası) aynen sürdürürler. */

/* ── Sekme: GİRİŞ YAP · KAYIT OL ──
   Kullanıcı hangi işi yaptığını EKRANDA görmeli. Tek akışta birleştirmek
   ("numaranı yaz, hesabın yoksa açılır") telefon yolunda mümkündü; şifreyle
   mümkün değil — kayıt ad ister, giriş istemez ve yanlış şifre ile yeni hesap
   arasındaki farkı kullanıcıya söylemek gerekir. */
.au-tabs { display: flex; padding: 5px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.07); gap: 4px; }
.au-tab { flex: 1; min-height: 46px; border: none; border-radius: 12px; background: transparent; cursor: pointer; color: rgba(255,255,255,.5); font-size: 12.5px; font-weight: 800; letter-spacing: .06em; transition: background .22s ease, color .22s ease; }
.au-tab[aria-selected="true"] { background: var(--au-accent, #FACC15); color: #0A0E14; box-shadow: 0 2px 14px var(--au-accent-soft, rgba(255,255,255,.1)); }
.au-tab:not([aria-selected="true"]):hover { color: #fff; background: rgba(255,255,255,.04); }

/* ── Şifre göster/gizle ──
   Dokunma hedefi 44px; ikon 20px. Şifresini göremeyen kullanıcı yazım hatası
   yüzünden "şifrem yanlış" sanıp sıfırlama akışına giriyor. */
.au-eye { width: 44px; height: 44px; margin-right: -12px; border: none; background: transparent; color: #6b7684; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: color .2s, background .2s; flex-shrink: 0; }
.au-eye:hover { color: #fff; background: rgba(255,255,255,.06); }

/* ── Şifre gücü çubuğu ── KAPI DEĞİL, rehber. Tek zorunluluk uzunluktur. */
.au-guc { display: flex; gap: 5px; margin: 9px 4px 0; }
.au-guc-parca { flex: 1; height: 4px; border-radius: 999px; background: rgba(255,255,255,.1); transition: background .3s ease; }

/* ── BENİ HATIRLA — büyük anahtar ──
   Kurucu isteği (24 Ağu 2026): "büyük şekilde yer alsın". Bu yüzden küçük bir
   onay kutusu değil, tam satır kaplayan dokunulabilir bir kart + gerçek anahtar. */
.au-hatirla { width: 100%; min-height: var(--oy-tap-min, 48px); display: flex; align-items: center; gap: 14px; padding: 15px 16px; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.07); cursor: pointer; text-align: left; transition: background .22s ease, border-color .22s ease; }
.au-hatirla:hover { background: rgba(255,255,255,.06); }
.au-hatirla[aria-pressed="true"] { border-color: var(--au-accent, #FACC15); background: var(--au-accent-soft, rgba(255,255,255,.08)); }
.au-switch { width: 52px; height: 31px; border-radius: 999px; flex-shrink: 0; position: relative; background: rgba(255,255,255,.14); transition: background .26s cubic-bezier(.16,1,.3,1); }
.au-hatirla[aria-pressed="true"] .au-switch { background: var(--au-accent, #FACC15); }
.au-knob { position: absolute; top: 3px; left: 3px; width: 25px; height: 25px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); transition: transform .26s cubic-bezier(.16,1,.3,1); }
.au-hatirla[aria-pressed="true"] .au-knob { transform: translateX(21px); }

/* ── YASAL ONAY — büyük kart ──
   Eski hâli 10px puntoyla ekranın en altındaydı ve telefonun görüş alanına
   çoğu zaman hiç girmiyordu. KVKK açık rıza "açık, anlaşılır ve ayrı" olmayı
   şart koşar; 10px gri yazı bu şartı karşılamaz. */
.au-onay { width: 100%; min-height: var(--oy-tap-min, 48px); display: flex; align-items: flex-start; gap: 13px; padding: 16px; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.07); cursor: pointer; text-align: left; transition: background .22s ease, border-color .22s ease; }
.au-onay:hover { background: rgba(255,255,255,.06); }
.au-onay[aria-pressed="true"] { border-color: var(--au-accent, #FACC15); background: var(--au-accent-soft, rgba(255,255,255,.08)); }
.au-kutu { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; margin-top: 1px; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,.22); background: transparent; transition: background .2s, border-color .2s; }
.au-onay[aria-pressed="true"] .au-kutu { background: var(--au-accent, #FACC15); border-color: var(--au-accent, #FACC15); }
/* 12.5px: eski 10px'in aksine telefonda rahat okunur. KVKK metni okunabilir olmalı. */
.au-onay-metin { margin: 0; font-size: 12.5px; line-height: 1.6; font-weight: 600; color: #A8B2BD; }

/* ── Ayırıcı: "ya da" ── */
.au-ayirici { display: flex; align-items: center; gap: 14px; margin: 22px 0; }
.au-ayirici::before, .au-ayirici::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,.08); }
.au-ayirici span { font-size: 10.5px; font-weight: 800; letter-spacing: .18em; color: #59636e; }

/* ── Alan hatası — alanın hemen altında, kırmızı ── */
.au-alan-hata { margin: 7px 4px 0; font-size: 11.5px; font-weight: 700; line-height: 1.45; color: #FF6B6B; }
`;
