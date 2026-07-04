# ⚠️ ARŞİV — ESKİ TASARIM PROTOTİPLERİ (GÜNCEL DEĞİLDİR)

Bu klasördeki HTML dosyaları OYNA'nın **eski, yüksek-fideliteli oyuncu
onboarding prototipleridir** (v1 / v2 tasarım keşfi).

## ❌ Bunlar uygulamanın gerçek tasarımı DEĞİLDİR

- Kendi **inline stilleri** vardır; uygulamanın gerçek stil sistemini
  (`index.css` / `@theme` / Tailwind) **kullanmazlar**.
- Yalnızca **oyuncu onboarding** akışını kapsarlar — uygulamanın küçük bir kısmı.
- Paletleri bile güncel uygulamadan farklıdır (ör. altın `#FFD700`/`#FFC107` ve
  mavi `#00B0FF` ağırlıklı; oysa gerçek uygulama amber `#FACC15` + yüzey
  `#161B22` ağırlıklıdır).
- Yalnızca **tasarım geçmişini korumak** için tutulurlar.

## ✅ Uygulamanın GERÇEK tasarım kaynağı

| Kaynak | İçerik |
|--------|--------|
| `index.css` | `@theme` design token'ları + custom class'lar (mesh-bg, glassmorphism, neon glow, custom scrollbar, safe-area) |
| `index.html` | Fontlar (Inter + Space Grotesk) |
| `components/`, `views/` | Gerçek üretim bileşenleri |

## 🤖 AI / vibecode araçları için

Bir **design system** ya da tasarım referansı üretirken **bu klasörü
KULLANMAYIN**. Kök dizindeki `.cursorignore`, `.codeiumignore` ve `.aiexclude`
dosyaları `arsiv/` yolunu zaten hariç tutar.
