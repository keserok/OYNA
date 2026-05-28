# OYNA App — Tasarım, Mimari ve Vizyon Kılavuzu
> **Sürüm:** 1.0.0  
> **Hedef Kitle:** Yazılım Mimarları, Gemini Geliştirici Ajanları ve Ürün Tasarımcıları

Bu belge, **OYNA** premium spor (futbol) ekosisteminin görsel kimliğini, teknik mimarisini, veri modellerini ve yazılım geliştirme prensiplerini detaylı olarak açıklar. Bu kılavuzun amacı, uygulamanın premium "Athletic-Tech" hissiyatını korumak ve Gemini ile yapılacak geliştirmelerin mimari standartlara %100 uyumlu olmasını sağlamaktır.

---

## 1. Ürün Vizyonu ve Konsept (The Perspective)

OYNA, sıradan bir halı saha veya maç bulma uygulaması değildir. Temel felsefesi sporculara kendilerini profesyonel birer futbolcu gibi hissettirmektir. 

*   **FUT (FIFA Ultimate Team) Estetiği:** Oyuncular sadece birer isim değil; ratingleri, kimyaları, oyun tarzları ve piyasa/elmas değerleri olan aktif "oyuncu kartlarıdır".
*   **Football Manager Taktiksel Derinliği:** Kullanıcılar takım kurabilir, taktik stüdyosunda diziliş ayarlayabilir (2-3-1, 3-2-1 vb.), oyuncuları sürükleyip bırakabilir ve gerçek zamanlı taktik tahtasını yönetebilir.
*   **Athletic-Tech & Hız:** Arayüz, futbolun dinamizmini, hızını ve rekabetini hissettirecek şekilde agresif, modern ve teknolojik olmalıdır.

---

## 2. Tasarım Manifestosu (OYNA Design System)

Geliştirilecek tüm yeni ekranlar ve bileşenler, aşağıdaki tasarım kurallarına **istisnasız** olarak uymak zorundadır.

### 2.1 Renk Paleti ve Zemin Mantığı (Dark & Neon)
*   **Ana Arka Planlar:** Koyu Lacivert/Siyah tonları kullanılmalıdır. Düz açık gri veya beyaz zeminler kesinlikle yasaktır.
    *   Sınıflar: `bg-[#0A0E14]`, `bg-[#06080A]`, veya saf `bg-black`.
*   **Mesh Gradient ve Ambiyans:** Statik koyu renkler yerine, arkada CSS blur (`blur-3xl`) ile yavaşça dalgalanan derin mavi, mor ve yeşil yansımalar olmalıdır (`mesh-bg` sınıfı ve `mesh-blob` yapısı).
*   **Glassmorphism (Cam Tasarımı):** Kartlar ve paneller düz gri veya siyah renk yerine, arkasını hafif gösteren ve bulanıklaştıran cam efektiyle tasarlanır:
    *   Sınıflar: `bg-[#161B22]/80` veya `bg-black/40` ile birlikte `backdrop-blur-md` ve ince saydam kenarlık `border border-white/5` veya `border border-white/10`.
*   **Neon Accent (Vurgu) Renkler:**
    *   **Neon Yeşili (`#39FF14`):** Canlı eylemler, aktif butonlar, onaylar ve saha çizgileri için kullanılır.
    *   **Neon Sarısı (`#FFFF00`):** VIP statüler, premium özellikler, parlayan elmas değerleri ve dikkat çekmesi gereken veriler için kullanılır.
    *   **Zümrüt Yeşili (Emerald), Parlak Kırmızı (Red-600) ve Indigo:** Durumsal derinlikler (galibiyet/mağlubiyet, alarm, buton ikincil varyasyonları) için tercih edilir.

### 2.2 Tipografi (Dinamik ve Agresif)
*   **Yazı Tipi:** Google Fonts **Inter** (`font-sans`).
*   **Büyük Başlıklar ve Vurgular:** Futbolun agresifliğini ve hızını yansıtmak amacıyla kalın, eğik ve dar harf aralıklı büyük harfler tercih edilir:
    *   Sınıflar: `font-black`, `uppercase`, `italic`, `tracking-tighter`, `leading-none`.
*   **Alt Etiketler ve Veri Başlıkları:** Çok küçük, kalın, büyük harfli ve harfler arası boşluğu maksimuma çıkarılmış şekilde tasarlanır:
    *   Sınıflar: `text-[10px]` veya `text-xs`, `font-bold`, `uppercase`, `tracking-widest`, `text-gray-400`.

### 2.3 Geometri ve Parlamalar (Glow Effect)
*   **Köşe Yumuşatma:** Sivri köşeler yasaktır. Yumuşak geçişler premium algısını artırır:
    *   Sınıflar: Buton ve kartlar için `rounded-2xl` veya `rounded-[32px]`, dairesel alanlar için `rounded-full`.
*   **Neon Glow (Parlama):** Önemli elemanlara hafif renkli neon gölgeler eklenir:
    *   Örnek: `shadow-[0_0_15px_rgba(57,255,20,0.15)]` (Neon yeşil) veya `shadow-[0_0_15px_rgba(255,255,0,0.15)]` (Neon sarı).

### 2.4 Animasyonlar ve Etkileşimler (Framer Motion)
*   Uygulamadaki tüm geçişler organik olmalıdır. Ekrana giren elemanlar aniden belirmek yerine yaylanarak (spring physics) ve sırayla (staggered) gelmelidir.
*   **Etkileşim Sınıfları:**
    *   Hover: `whileHover={{ scale: 1.02, translateY: -2 }}`
    *   Click/Tap: `whileTap={{ scale: 0.97 }}`
*   **Sayfa Geçişleri (Page Transitions):** `App.tsx` içerisindeki `AnimatePresence` yapısı kullanılarak sayfadan sayfaya geçerken hafif bir yukarı kayma (`y: 12` -> `y: 0`) ve fade-in efekti tetiklenir.

---

## 3. Teknoloji Yığını ve Bağımlılıklar

OYNA istemci uygulaması modern, performanslı ve modüler bir yapıda kurulmuştur:

*   **Core Framework:** React 18, TypeScript, Vite (Derleme ve geliştirme sunucusu).
*   **Styling:** Tailwind CSS (Modern `@theme` mimarisiyle entegre).
*   **Icons:** `lucide-react` (Emoji kullanımı yasaktır; tüm görsel semboller bu ikon setiyle çözülür).
*   **Animations:** `framer-motion` (Yay tabanlı animasyonlar, sayfa geçişleri, taktik tahtası sürükle-bırak işlemleri).
*   **State Management:** Zustand (Performanslı, hafif ve reactive global store).
*   **Database & Backend:** Firebase Client SDK (Authentication + Realtime Cloud Firestore sync).
*   **Build/Platform Entegrasyonları:** Capacitor.config.ts (Mobil cihazlar için native iOS ve Android paketleme altyapısı).

---

## 4. Yazılım Mimarisi ve Dizin Yapısı

Proje dizini temiz ve modüler bir organizasyona sahiptir:

```
OYNA_APP_ROOT/
├── App.tsx                    # Ana Giriş, Görünüm Seçici (Router) ve Firebase Auth Dinleyicisi
├── index.tsx                  # React DOM Mount Noktası
├── index.css                  # Global Tailwind Tanımları, Mesh Gradient ve Micro-animasyonlar
├── store.ts                   # Zustand Global Store (State, Actions, UI Seçimleri)
├── types.ts                   # TypeScript Arayüzleri, Enumlar ve Veri Tipleri
├── constants.ts               # Statik Mock Veriler (Saha listesi, kaleciler, hakemler, varsayılan formasyonlar)
├── firebase.ts                # Firebase App & SDK İlklendirmesi
├── firebaseSync.ts            # Firestore Realtime Koleksiyon Sync Mantığı
├── firebaseMutations.ts       # Firestore Yazma/Güncelleme Fonksiyonları (İş Kuralları)
├── components/                # Yeniden Kullanılabilir Premium UI Bileşenleri
│   ├── BottomNav.tsx          # Mobil Uyumlu Alt Navigasyon Barı
│   ├── FifaCard.tsx           # FUT tarzı Premium Oyuncu Kartı
│   ├── PlayerCard.tsx         # Standart ve Kompakt Oyuncu Profil Kartları
│   ├── LiveTacticBoard.tsx    # Sürüklenebilir Canlı Taktik Sahası
│   └── TeamCreatorWizard.tsx  # Adım adım Takım Oluşturma Sihirbazı
├── views/                     # Bağımsız Ekranlar (Lazy-loaded Views)
│   ├── Dashboard.tsx          # Ana Sayfa (Oyuncu Profili, Maçlarım, Aktif Kampanyalar)
│   ├── MatchJoin.tsx          # Bireysel Maç Katılım Ekranı (Taktik Saha + Kaleci/Hakem Kiralama)
│   ├── Studio.tsx             # Taktik Stüdyosu (Formasyon düzenleyici ve kadro yönetimi)
│   ├── PitchDiscovery.tsx     # Halı Saha Arama, Harita ve Rezervasyon Ekranı
│   ├── MyTeam.tsx             # Takımlarım Görünümü (Kategoriler, Kadro ve Profil Kartları)
│   ├── TransferCenter.tsx     # Oyuncu Arama, Takım Arama ve Transfer Listesi
│   └── OwnerPanel.tsx         # B2B Halı Saha Sahibi Yönetim Paneli
└── utils/                     # Matematiksel ve Yardımcı Fonksiyonlar
```

---

## 5. Durum Yönetimi (State Management)

### 5.1 Zustand Global Store (`store.ts`)
Zustand, uygulamanın beynidir. `useAppStore` aracılığıyla hem lokal arayüz durumu (seçili maç, aktif sayfa, yüklenme durumu) hem de Firestore'dan senkronize edilen veriler yönetilir.

*   **Görünüm Yönlendirmesi (Routing):** `view` parametresi (`AppView` tipi) hangi ekranın çizileceğini belirler. `setView(viewName)` çağrılarak ekranlar arasında geçiş yapılır.
*   **İmitasyon Modu (Impersonation):** Admin veya kaptanların, diğer rollerdeki kullanıcıların ekranlarını test edebilmesi için `impersonatedUser` ve `originalRole` durumları store üzerinden yönetilir.
*   **Uygulama Ayarları:** `settings` nesnesi (`AppSettings` tipi) üzerinden AI Coach, Taktik Stüdyosu gibi sistemlerin aktif olup olmadığı dinamik olarak kontrol edilir.

### 5.2 Gerçek Zamanlı Firebase Senkronizasyonu (`firebaseSync.ts`)
Uygulama açıldığında `firebaseSync.ts` içindeki `startFirebaseSync` tetiklenir. 
*   Firestore'daki `matches`, `users`, `teams`, `pitches` koleksiyonları `onSnapshot` ile dinlenir.
*   Gelen güncellemeler Zustand store'daki set metotları ile yerel state'e yazılır. Böylece başka bir kullanıcının yaptığı hamle (örneğin maç slotuna katılması veya taktik sahasında oyuncunun yerini değiştirmesi) ekrana anında yansır.

---

## 6. Önemli Modüllerin Detayları

### 6.1 Bireysel Maça Katılma (`MatchJoin.tsx`)
Bu modül, oyuncuların tek başlarına veya arkadaşlarıyla bir maça dahil olmalarını sağlayan, en karmaşık etkileşimlerin döndüğü alandır.
*   **Taktik Saha Görünümü:** Maçtaki oyuncuları klasik bir liste yerine, sahada pozisyonlarına göre yerleşmiş kartlar halinde gösterir.
*   **Slot Sistemi:** Boş pozisyonlara tıklanarak maça dahil olunabilir.
*   **Hizmet Kiralama (Kiralık Kaleci & Resmi Hakem):** Maçta kaleci veya hakem eksikse, sistem üzerinden sertifikalı goalkeepers/referees kiralanabilir. Kiralama yayına alındığında buton üzerinde **Sonar Dalgası** animasyonu ve kartta **Pulsing Dot** (yanıp sönen nokta) gösterilir.

### 6.2 Taktik Stüdyosu (`Studio.tsx` & `LiveTacticBoard.tsx`)
Takım kaptanlarının maç öncesi taktiksel dizilişi belirlediği alandır.
*   **Formasyon Seçenekleri:** `5+1`, `6+1` veya `7+1` saha boyutuna göre taktik dizilişler (`2-3-1`, `3-2-1`, `2-2-2`, `3-1-2`) uygulanır.
*   **Sürükle - Bırak (Drag & Drop):** `framer-motion`'ın `drag` ve `dragConstraints` özellikleri kullanılarak, oyuncular saha üzerinde koordinat bazlı (yüzdelik `x` ve `y` değerleri) hareket ettirilir. Konumlar gerçek zamanlı olarak veritabanına kaydedilir.

### 6.3 Takımlarım ve Oyuncu Profili (`MyTeam.tsx` & `PlayerCard.tsx`)
Takımların organize edildiği ve kadronun incelendiği modüldür.
*   **Kategorizasyon:** Takımlar, oluşturulan kategorilere (Sınıflara) göre filtrelenebilir. Kategori ekleme ve silme özellikleri Kaptan ve Admin yetkisindedir.
*   **Kadro Görünümü:** Arkadaş listesindeki şık, dikey listeleme şablonuyla aynıdır.
*   **Oyuncu Profil Kartı (FUT / FIFA Card Esintisi):** Bir oyuncunun adına tıklandığında açılan detay kartıdır. Şu bilgileri içerir:
    *   Yaş, Boy, Kilo, Tercih Ettiği Ayak.
    *   Galibiyet / Mağlubiyet oranı (W/L Ratio).
    *   **Elmas Değeri:** Oyuncunun transfer pazarındaki prestij değeri.
    *   **Altılı İstatistik Grafiği:** Pace (Hız), Shooting (Şut), Passing (Pas), Dribbling (Dripling), Defense (Defans), Physical (Fizik).

---

## 7. Temel Veri Modelleri (Types & Schema)

Gemini ile kod yazarken aşağıdaki veri tiplerini temel referans olarak kullanın (`types.ts` dosyasından alınmıştır):

### 7.1 AdminUser (Kullanıcı / Oyuncu Profili)
```typescript
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  role: UserRole;             
  roles?: UserRole[];        
  rating: number;            
  isVerified: boolean;       
  isBanned: boolean;         
  isShadowBanned?: boolean;
  isMuted?: boolean;
  isPro: boolean;            
  joinDate: string;          
  matchCount: number;        
  wallet?: number;           
  reliabilityScore?: number; 
  banExpiresAt?: string | null; 
  communities?: string[];    
  playerCard?: PlayerCardData;
  oynaId?: string; // Benzersiz OYNA Kimliği Örn: #KER532
  friends?: string[]; // Onaylanmış arkadaşların User ID'leri
  isLookingForTeam?: boolean; // Transfer Merkezi Görünürlüğü
}
```

### 7.2 PlayerCardData (FUT İstatistik Kartı)
```typescript
export interface PlayerStat {
  value: number;
  videoUrl: string | null;
}

export interface PlayerCardData {
  overall: number;
  tier: 'gold' | 'silver' | 'bronze';
  isStatsVerified: boolean;
  diamondValue: number;
  flatModifier?: number; 
  winCount: number;
  totalMatches: number;
  cardImage?: string;
  stats: {
    pace: PlayerStat;
    shooting: PlayerStat;
    passing: PlayerStat;
    dribbling: PlayerStat;
  };
}
```

### 7.3 ITeam (Takım Veri Yapısı)
```typescript
export interface ITeam {
  id: string;
  name: string;
  color: string; // Tailwind renk sınıfı (örn: text-emerald-400)
  communityId?: string;
  captainId: string;
  category?: string; // Takımın bağlı olduğu kategori (Sınıf)
  formation: '5+1' | '6+1' | '7+1';
  stats: {
    wins: number;
    losses: number;
    fairPlayScore: number;
  };
  roster: {
    userId: string;
    position: string;
    fairPlayScore: number;
  }[];
}
```

---

## 8. Gemini Entegrasyon & Geliştirme Yönergesi

Gemini ile yeni bir özellik geliştirirken veya mevcut kodu düzenlerken bu kuralları prompt olarak verin:

1.  **Direct DOM Değişikliği Yapmayın:** Tüm durum güncellemelerini React state'leri ve Zustand store aksiyonları üzerinden gerçekleştirin.
2.  **CSS Dosyalarına Bağımlı Kalmayın:** Animasyonlar için Tailwind sınıfları yerine `framer-motion` bileşenlerini (`motion.div`, `motion.button` vb.) tercih edin.
3.  **İkonları Sadece `lucide-react` Üzerinden Çekin:** Başka ikon paketi yüklemeyin veya SVG'leri doğrudan kodun içine gömmeyin.
4.  **Hata Yönetimine Dikkat Edin:** Firebase işlemlerini mutlaka `try-catch` blokları içine alın ve kullanıcıya premium uyarı pencereleriyle (toast) geri bildirim verin.
5.  **Arayüz Metinleri:** Kullanıcıya gösterilen tüm metinler akıcı bir Türkçe ile yazılmalıdır. Kod içi değişkenler ve veritabanı şemaları ise İngilizce olmalıdır.
6.  **Tasarım Tutarlılığı:** Yeni bir buton eklediğinizde dahi `rounded-2xl`, `backdrop-blur-md` ve `border-white/5` cam efektlerini uyguladığınızdan emin olun.
