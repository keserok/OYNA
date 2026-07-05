# OYNA — Design System (Tek Doğruluk Kaynağı)

> Bu dosya, **güncel main / Vercel'deki canlı uygulamanın** gerçek tasarım
> dilinin öz-kaynağıdır. Değerler `index.css` (@theme + custom class'lar) ve
> `components/`, `views/` içindeki **fiili kullanımdan** (kullanım sıklıklarıyla)
> çıkarılmıştır — tahmin değildir.
>
> **AI / Claude Design / vibecode araçları için:** Bir design system üretirken
> **bu dosyayı + `index.css` + `index.html` + gerçek ekran görüntülerini** kaynak
> al. **`arsiv/` klasörünü (eski onboarding prototipleri) YOK SAY** — orası güncel
> tasarım değildir.

---

## 1. Marka & Karakter

- **Platform:** Halı saha / maç bulma & saha rezervasyon uygulaması (mobil-öncelikli).
- **Ton:** Sportif, enerjik, "gece maçı" — koyu, neon vurgulu, yüksek kontrast.
- **Tema:** **Yalnızca koyu (dark-only).** Açık tema yok.
- **İmza öğeler:** animasyonlu mesh-gradient arka plan · glassmorphism kartlar ·
  neon glow gölgeler · canlı gradient "hero" kartlar · pill (rounded-full) formlar.

---

## 2. Renk Token'ları

### Zemin / Yüzey (dark)
| Token | Hex | Kullanım |
|-------|-----|----------|
| `bg/app` | `#0A0E14` | Ana uygulama zemini |
| `surface/card` | `#161B22` | **En çok kullanılan** kart/panel yüzeyi |
| `surface/card-glass` | `rgba(22,27,34,0.8)` → `#161B22`/80 | Glassmorphism kart (blur ile) |
| `surface/2` | `#121620` | İkincil panel |
| `surface/3` | `#0d1420` | Katman |
| `surface/deep` | `#070B10` | En koyu katman |
| `surface/elevated` | `#1e2532` / `#11151c` | Yükseltilmiş yüzey |

### Birincil — Neon Yeşil (primary / CTA / başarı vurgusu)
| Token | Hex |
|-------|-----|
| `primary` | `#39FF14` |
| `primary/dark` | `#1cb500` |
| `primary/light` | `#70ff56` |

### İkincil — Amber/Altın (secondary / hero / dikkat)
| Token | Hex | Not |
|-------|-----|-----|
| `secondary` | `#FACC15` | Ana sarı (Tailwind amber-400) — **@theme'de eksikti, gerçek uygulamanın 2. rengi** |
| `secondary/pure` | `#FFFF00` | Saf sarı vurgu |
| `gold` | `#FFD700` / `#d4a84b` | Gradient/altın geçişleri |

### Semantik durumlar
| Token | Hex |
|-------|-----|
| `error` | `#FF4D4D` |
| `warning` | `#FFAA00` (alt: `#FFC107`) |
| `success` | `#00E676` |
| `info` | `#00B0FF` |

### Metin
| Token | Hex |
|-------|-----|
| `text/main` | `#FFFFFF` |
| `text/muted` | `#8B949E` |
| `text/faint` | `rgba(255,255,255,0.4–0.6)` |

> **Not (renk kimliği):** Uygulama **yeşil + sarı** ikilisi üzerine kuruludur.
> Bir sistem yalnızca `@theme`'e bakarsa sarıyı ıskalar (orada tanımlı değil);
> bu tabloyu esas al.

---

## 3. Gradientler (fiili kombinasyonlar)

- **Koyu zemin geçişi:** `#0A0E14 → #161B22` (ve `via #0A0E14`)
- **Yeşil hero:** `#39FF14 → …` (koyu üstüne neon)
- **Sarı/altın hero:** `#FACC15 → via #d4a84b`
- **Ana Sayfa hero kartları:** sarı (Maç Bul), yeşil (Saha Vitrini), turuncu
  (Maç Oluştur), mavi (Hakem) — her biri koyu zemine oturan doygun gradient +
  eşleşen glow.

---

## 4. Gölge & Glow (fiili değerler)

| Amaç | Değer |
|------|-------|
| Yeşil glow (yumuşak) | `0 0 20px rgba(57,255,20,0.2)` |
| Yeşil glow (güçlü) | `0 0 30px rgba(57,255,20,0.3)` |
| Sarı glow | `0 0 15px rgba(250,204,21,0.3)` |
| Kart gölgesi | `0 8px 32px rgba(0,0,0,0.4)` |
| Ambient/derin | `0 -20px 50px rgba(0,0,0,0.8)` |
| İç gölge (vinyet) | `inset 0 0 60px rgba(0,0,0,0.8)` |
| İnce highlight | `0 0 5px rgba(255,255,255,0.5)` |

---

## 5. Tipografi

- **Sans / gövde:** **Inter** (`--font-sans`). Ağırlıklar: 300–800 + 900 (black).
- **Display face:** **Space Grotesk** yüklüdür (index.html); pratikte başlıklar
  çoğunlukla Inter Black ile çizilir → istenirse display'i Space Grotesk'e
  bağlamak net bir iyileştirme olur.
- **Display / büyük başlık:** `Inter 900 (black) · italic · UPPERCASE ·
  tracking-tighter` — ör. "TOP OYNA", "SAHAYA ÇIKMA VAKTİ".
- **Eyebrow / etiket:** `bold · UPPERCASE · tracking-wider (0.1–0.3em)`.
- **Gövde:** Inter 400/500; **muted** metin `#8B949E`.

> ⚠️ **Ekran görüntüsü uyarısı:** Ürettiğim mock ekran görüntülerinde başlıklar
> **serif** görünüyor olabilir — bu bir sandbox artefaktıdır (Google Fonts dış
> ağdan çekilemedi, tarayıcı serif'e düştü). **Gerçek font Inter'dir**, serif
> değil. Tipografi için bu bölümü esas al, görüntüdeki fontu değil.

---

## 6. Köşe Yarıçapı (radius)

Fiili dağılım (mobil, yumuşak):
- `rounded-full` → **baskın**: butonlar, pill/chip'ler, avatarlar, toggle'lar.
- `rounded-2xl` → kartlar (standart).
- `rounded-xl` → küçük kartlar / input'lar.
- `rounded-3xl` → büyük hero kartları.

---

## 7. Efektler & Hareket

- **Mesh-gradient arka plan:** sabit, animasyonlu blob'lar (`mesh-bg`, `mesh-blob`
  — `index.css`). Yavaş float animasyonu.
- **Glassmorphism:** `bg-[#161B22]/80` + `backdrop-blur-md` + `border-white/5`.
- **Neon glow:** yukarıdaki shadow token'ları.
- **Motion (framer-motion):** hover `scale 1.02`, tap `scale 0.98`, sayfa
  geçişleri (`AnimatePresence`).
- **Custom scrollbar** (ince, yarı saydam), **iOS safe-area** yardımcı sınıfları.

---

## 8. Çekirdek Bileşenler (gerçek reçeteler)

### GlassCard (`components/ui/GlassCard.tsx`)
```
bg-[#161B22]/80  backdrop-blur-md
border border-white/5
shadow-[0_8px_32px_rgba(0,0,0,0.4)]
rounded-2xl
glow (ops.): box-shadow 0 0 24px <hex>22
hover: scale 1.02 · tap: scale 0.98
```

### NeonButton (`components/ui/NeonButton.tsx`)
- Şekil: `border rounded-full font-bold tracking-wide`
- Varyantlar:
  - `primary` → `bg-[#39FF14]/10 border-[#39FF14]/40 text-[#39FF14] · glow 0 0 12px rgba(57,255,20,0.2)`
  - `secondary` → `bg-white/5 border-white/10 text-white`
  - `danger` → `bg-red-500/10 border-red-500/40 text-red-400`
  - `ghost` → `bg-transparent text-white/60`
- Boyutlar: `sm px-3 py-1.5 text-xs · md px-5 py-2.5 text-sm · lg px-7 py-3.5 text-base`

### Diğer örüntüler
- **Chip / filtre:** `rounded-full` + ince border; aktifken neon renk + glow (ör.
  "Tümü" yeşil, "KODLA KATIL" sarı).
- **Hero kart:** büyük gradient (sarı/yeşil/turuncu/mavi) + eyebrow etiket +
  dev italic başlık + sağda ikon rozet + eşleşen glow.
- **BottomNav (`components/BottomNav.tsx`):** 5 sekme (Ana Sayfa · Top Oyna ·
  **Sosyal** [ortada yükseltilmiş, yeşil halkalı] · Sahalar · Profil), glass yüzey,
  aktif sekme neon.

---

## 9. Kaynak dosyalar (Claude Design'a bunları ver)

| Ver | Neden |
|-----|-------|
| **bu `DESIGN_SYSTEM.md`** | Küraslanmış token seti (tek kaynak) |
| `index.css` | @theme + custom class'lar (mesh, glass, glow, scrollbar) |
| `index.html` | Font tanımları |
| Gerçek ekran görüntüleri | Görsel doğrulama (Splash, Auth, Dashboard, Maçlar, Sahalar, Profil, Sosyal) |
| `components/ui/*`, `BottomNav`, birkaç `views/*` | Bileşen örnekleri |

| **VERME** | Neden |
|-----------|-------|
| `arsiv/**` | Eski prototip — güncel tasarım değil, sistemi yanıltır |
| Repo'nun tamamı | Gürültü; 2470 gömülü hex sistemi bulanıklaştırır |
