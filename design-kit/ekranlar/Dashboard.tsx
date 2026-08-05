/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: views/Dashboard.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak: onaylı tasarım teslimi (OYNA Ana Sayfa, 390×844). Ölçüler, sıra,
// renkler ve metinler oradan birebir alındı. Teslim edilen statik HTML TEK
// DOĞRU KAYNAKTIR: bir değer HTML'de neyse odur.
//
// ── ÖNCEKİ SÜRÜMDEN FARK: EKRAN ARTIK KAYDIRILIR ───────────────────────────
// Eski ana sayfa "her şey tek ekrana sığar" ilkesiyle kuruluydu; yükseklikler
// oran + `clamp()` + container query ile hesaplanıyordu. Yeni tasarım bunu
// bıraktı: içerik SABİT piksel yüksekliklerinde kartlar hâlinde dizilir ve
// ekran kaydırılır. Bu yüzden köke `containerType: 'size'` KOYULMADI ve
// `cqw`/`cqh` birimleri KULLANILMADI — ölçüler artık @theme token'larıdır
// (`--oy-*`), kapsayıcıya göre çözülen değerler değil.
//
// ── BAŞLIK KAYDIRICININ DIŞINDA ─────────────────────────────────────────────
// Başlık `flex: none` ile kaydırıcının KARDEŞİdir, çocuğu değil. Kaydırılan
// içerik başlığın yanından ya da köşesinden geçemez — alt köşelerdeki 24px
// kavis ancak böyle temiz görünür.
//
// ── STİL NEDEN SATIR İÇİ ───────────────────────────────────────────────────
// Tasarımın gradyanları, çok katmanlı gölgeleri ve maskeleri Tailwind token'ı
// olmayan değerler. Projedeki yerleşik desen de bu. Token'ı OLAN her şey
// (renk rolleri, punto basamakları, boşluk/köşe/yükseklik ölçeği, ekran
// adları) token'dan gelir; elle yazılmaz.
//
// ── ALT MENÜ BU EKRANDA ÇİZİLMEZ ───────────────────────────────────────────
// Kullanıcı kararı: alt menü kapı ekranlarında görünür, ana sayfaya dönüş
// oradan olur. Ana sayfanın kendisinde çubuk yoktur. Kararın uygulandığı yer
// `App.tsx` (`showBottomNav`); burada yalnız alt boşluk güvenli alana bırakılır.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Bell, ChevronRight, CircleAlert, CloudOff, Loader2, MapPin, Wallet } from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { UserAvatar } from '../components/common/UserAvatar';
import TeamCrest from '../components/social/TeamCrest';
import { useDashboardHome } from '../hooks/useDashboardHome';
import { useMyMatches, parseMatchDate } from '../hooks/useMyMatches';
import { CARD, SCREEN } from '../ui/labels';
import { TYPE_PX } from '../ui/type';
import { formatTRYAmount } from '../utils/formatTRY';
import { Accent, Photo, Skeleton, Tap } from '../components/dashboard/HomePieces';
import {
  KeeperGloveMark,
  MatchCreateMark,
  OynaMark,
  RefereeWhistleMark,
} from '../components/dashboard/OynaMarks';
import arenaLines from '../assets/dashboard/arena-lines-white.png';
import studioBackdrop from '../assets/dashboard/studio-backdrop.png';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onBack: () => void;
  onRoleSelect?: (role: any) => void;
}

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

// ── Tasarımın tekrar eden değerleri ─────────────────────────────────────────
// Bir ölçü birden çok kartta geçiyorsa burada BİR KEZ yazılır. Elle ikinci kez
// yazılan ölçü, er geç sapan ölçüdür.
const PAGE_X = 'var(--oy-space-6)';
const CARD_BG = 'linear-gradient(135deg,#11161d 0%,#0a0e14 55%,#05070a 100%)';
const CARD_BORDER = '1px solid rgba(255,255,255,0.08)';
const CARD_SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.05)';
const BOX_BORDER = '1px solid rgba(255,255,255,0.16)';

/** Tasarımda arena çizimi ÜÇ kartın arkasına bölünmüş tek görseldir. */
const ARENA_SIZE = '470px 197px';
const ARENA_POS = { create: '-64px 4px', keeper: '-64px -116px', ref: '-243px -116px' } as const;

const px = (step: keyof typeof TYPE_PX) => `${TYPE_PX[step] / 16}rem`;

// ════════════════════════════════════════════════════════════════════════════
// METİN KURALLARI
// ════════════════════════════════════════════════════════════════════════════
//
// SAYI KURALI (tasarım kararı): canlı veri yoksa rakam BASILMAZ → "—".
// Sıfırsa metin değişir ("Müsait yok"). Bayat sayı asla gösterilmez.
// Türkçede sayıdan sonra çoğul eki KULLANILMAZ ("6 maç", "6 maçlar" değil).

const heroText = (error: boolean, total: number | null, hasScope: boolean): string => {
  if (error) return 'Maçlar yüklenemedi';
  if (!hasScope) return 'Yakınındaki maçları gör';
  if (total === null) return '—';
  return total === 0 ? 'Bugün yakınında maç yok' : `${total} maç · bugün ve yarın`;
};

const pitchText = (error: boolean, n: number | null, hasScope: boolean): string => {
  if (error) return '—';
  if (!hasScope) return 'Yakındaki sahaları gör';
  if (n === null) return '—';
  return n === 0 ? 'Yakında müsait saha yok' : `Çevrende ${n} halı saha · haritada gör`;
};

/** Kaleci/Hakem kartları dar — metin TEK SATIRDA kalmalı. */
const providerText = (error: boolean, n: number | null, hasScope: boolean): string => {
  if (error) return '—';
  if (!hasScope) return 'Göz at';
  if (n === null) return '—';
  return n === 0 ? 'Müsait yok' : `${n} müsait`;
};

/**
 * Bakiye biçimi.
 *
 * TASARIMDAN BİLİNÇLİ SAPMA: teslim edilen HTML "₺340" yazıyor (simge önde),
 * uygulamanın kanonik biçimi ise "340₺"dir (simge sonda) — `utils/formatTRY.ts`
 * ve onu kilitleyen `tests/unit/formatTRY.test.ts`. Ana sayfada tek başına
 * farklı bir para biçimi kullanmak, kullanıcının aynı akışta iki ayrı yazım
 * görmesi demekti; o modül tam olarak bunu önlemek için var. Veri yoksa
 * `formatTRYAmount` zaten "—" döndürür (sayı kuralı).
 */
const money = (n: number | null, error: boolean): string =>
  formatTRYAmount(error ? null : n);

const GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Bugün" · "Yarın" · "Cmt" · "12 Ağu" — kısa ve tek satır. */
export const dayLabel = (d: Date, now: Date = new Date()): string => {
  const yarin = new Date(now);
  yarin.setDate(yarin.getDate() + 1);
  if (sameDay(d, now)) return 'Bugün';
  if (sameDay(d, yarin)) return 'Yarın';
  const fark = (d.getTime() - now.getTime()) / 86400000;
  if (fark > 0 && fark < 7) return GUN[d.getDay()];
  return `${d.getDate()} ${AY[d.getMonth()]}`;
};

const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * "3 saat kaldı" — bilet sayısı değil, KALAN SÜRE.
 *
 * İstemcide hesaplanır: sunucudan gelen bir "kalan süre" saniyesi telefonun
 * saatiyle kayar ve ekranda donuk kalırdı. Tek gereken maçın başlangıç anı;
 * gerisini cihazın saati söyler.
 *
 * Maç BAŞLADIKTAN sonra geri sayım yazılmaz — "-2 saat kaldı" saçmadır.
 * Onun yerine oynandığı söylenir; iki saatlik pay dolunca maç zaten
 * "yaklaşan" listesinden düşer ve kutu bir sonraki maça geçer.
 */
export const remainingText = (start: Date, now: Date = new Date()): string => {
  const ms = start.getTime() - now.getTime();
  if (ms <= 0) return 'Şu an oynanıyor';
  const dk = Math.floor(ms / 60000);
  if (dk < 60) return `${Math.max(1, dk)} dakika kaldı`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `${saat} saat kaldı`;
  return `${Math.floor(saat / 24)} gün kaldı`;
};

/** "4 dk önce güncellendi" — çevrimdışı şeridinin ikinci yarısı. */
export const agoText = (at: number | null, now: number = Date.now()): string => {
  if (!at) return 'önbellekten';
  const dk = Math.max(0, Math.floor((now - at) / 60000));
  if (dk < 1) return 'önbellekten · az önce güncellendi';
  if (dk < 60) return `önbellekten · ${dk} dk önce güncellendi`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `önbellekten · ${saat} sa önce güncellendi`;
  return `önbellekten · ${Math.floor(saat / 24)} gün önce güncellendi`;
};

// ════════════════════════════════════════════════════════════════════════════

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const unread = useAppStore((s) => s.unreadNotificationsCount);
  const sessionProfile = useAppStore((s) => s.currentUserProfile);
  const adminUsers = useAppStore((s) => s.adminUsers);
  const setIsNotificationsOpen = useAppStore((s) => s.setIsNotificationsOpen);
  const setSelectedMatch = useAppStore((s) => s.setSelectedMatch);
  const adminMatches = useAppStore((s) => s.adminMatches);

  const home = useDashboardHome();
  const { loading, error, offline, refreshing, hasScope } = home;

  // Yaklaşan maç Maçlarım ekranıyla AYNI listeden okunur — iki ekran farklı
  // maç göstermesin.
  const { closest } = useMyMatches();
  const nextMatchAt = React.useMemo(
    () => (closest ? parseMatchDate(closest.date, closest.time) : null),
    [closest],
  );

  // Geri sayım dakikada bir tazelenir: "3 saat kaldı" ekran açıkken donmasın.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, []);
  void tick;

  // Sol üst avatar Profil ekranıyla AYNI kaynaktan beslenir; oturum profili
  // gelmemişse admin listesindeki kayda düşer.
  const uid = auth.currentUser?.uid ?? '';
  const fallbackProfile = React.useMemo(
    () => (uid ? adminUsers.find((u) => u.id === uid) : undefined),
    [adminUsers, uid],
  );
  const name = home.profile?.name || sessionProfile?.name || fallbackProfile?.name || '';
  const avatarUrl = home.profile?.avatarUrl || sessionProfile?.avatar || fallbackProfile?.avatar || null;
  const firstName = name.trim().split(/\s+/)[0] || '';

  const openMatch = React.useCallback(
    async (matchId: string) => {
      // Maç mağazada varsa anında aç; yoksa ayrıntısını çekip öyle aç.
      const local = adminMatches.find((m) => m.id === matchId);
      if (local) {
        setSelectedMatch(local);
        onNavigate('MATCH_JOIN');
        return;
      }
      try {
        const { getMatchDetails } = await import('../services/matchService');
        const m = await getMatchDetails(matchId);
        if (m) { setSelectedMatch(m); onNavigate('MATCH_JOIN'); return; }
      } catch { /* aşağıdaki yedeğe düş */ }
      // Maç açılamadı — kullanıcıyı boş ekranda bırakmaktansa listeye götür.
      onNavigate('MATCH_DISCOVERY');
    },
    [adminMatches, setSelectedMatch, onNavigate],
  );

  const hasNextMatch = !!closest && !!nextMatchAt;

  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ═══ BAŞLIK — KAYDIRMAZ ═════════════════════════════════════════════
          Zemin yukarı doğru koyulaşır: üst yarısı düz, %50'den sonra telefon
          dışı zemine doğru yumuşar. Alt köşelerdeki kavis, ince çizgi ve
          gölgeyle okunur hâle gelir — yoksa kaydırılan içerik köşeyi yiyor
          gibi görünüyordu. */}
      <header
        className="dash-safe-top"
        style={{
          flex: 'none',
          zIndex: 20,
          background: 'linear-gradient(to top,#0A0E14 0%,#0A0E14 50%,#090c12 78%,#080b11 100%)',
          borderRadius: '0 0 var(--oy-radius-lg) var(--oy-radius-lg)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 12px 20px -14px rgba(0,0,0,0.95)',
        }}
      >
        <div
          style={{
            height: 'var(--oy-header-h)',
            padding: '11px var(--oy-space-6) 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block', fontSize: px('caption'), fontWeight: 600,
                letterSpacing: '0.14em', color: 'var(--color-ink-4)',
              }}
            >
              {upper(SCREEN.dashboard)}
            </span>
            <h1
              style={{
                display: 'block', margin: '2px 0 0', fontFamily: 'var(--font-display)',
                fontSize: px('headline'), fontWeight: 800, fontStyle: 'italic',
                lineHeight: 1.1, letterSpacing: '-0.035em', color: 'var(--color-ink)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {firstName ? `MERHABA, ${upper(firstName)}` : 'MERHABA'}
            </h1>
          </div>

          {/* Bildirim: sayı GÖSTERİLMEZ, yalnız beyaz nokta. Dokunma alanı
              tasarımda 48px'e çıkarıldı (erişilebilirlik tabanı); ikon ve
              noktanın GÖRÜNEN yeri tasarımdakiyle birebir aynı kalır. */}
          <div
            role="button"
            tabIndex={0}
            data-tap=""
            aria-label={unread > 0 ? `Bildirimler · ${unread} yeni` : 'Bildirimler'}
            onClick={() => setIsNotificationsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsNotificationsOpen(true); }
            }}
            style={{
              position: 'relative', width: 'var(--oy-tap-min)', height: 'var(--oy-tap-min)',
              flex: 'none', marginRight: -12, borderRadius: 'var(--oy-radius-pill)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Bell size={19} color="var(--color-ink-2)" strokeWidth={1.7} aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute', top: 13, right: 14, width: 7, height: 7,
                  borderRadius: 'var(--oy-radius-pill)', background: 'var(--color-ink)',
                  boxShadow: '0 0 0 2.5px var(--color-bg)',
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/* ═══ DURUM ŞERİTLERİ ════════════════════════════════════════════════
          Üçü de başlığın ALTINDA, kaydırıcının DIŞINDA durur: kaydırırken
          kaybolmazlar ve içeriği itmezler (kart yüksekliği değişmez). */}

      {/* Yenileniyor — içerik yerinde kalır, üstte 64px açılır. */}
      {refreshing && !loading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            flex: 'none', height: 64, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10, background: 'var(--color-bg)',
          }}
        >
          <Loader2 size={16} color="var(--color-cat-play)" className="animate-spin" aria-hidden />
          <span
            style={{
              fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.14em',
              color: 'var(--color-ink-3)',
            }}
          >
            YENİLENİYOR
          </span>
        </div>
      )}

      {/* Çevrimdışı — HATA DEĞİL. Önbellek içeriği olduğu gibi durur. */}
      {offline && (
        <div
          role="status"
          style={{
            flex: 'none', margin: `0 ${PAGE_X} var(--oy-space-2)`,
            padding: '8px 12px', borderRadius: 'var(--oy-radius-sm)',
            background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-line)',
            display: 'flex', alignItems: 'center', gap: 9,
          }}
        >
          <CloudOff size={15} color="var(--color-warning)" style={{ flex: 'none' }} aria-hidden />
          <span style={{ flex: 1, minWidth: 0, fontSize: px('footnote'), color: 'var(--color-ink-2)' }}>
            Çevrimdışı · {agoText(home.updatedAt)}
          </span>
        </div>
      )}

      {/* Hata — kartlar TIKLANABİLİR KALIR: sayı gelmedi diye kapılar kapanmaz. */}
      {error && !offline && (
        <div
          role="alert"
          style={{
            flex: 'none', margin: `0 ${PAGE_X} var(--oy-space-2)`,
            padding: '8px 12px', borderRadius: 'var(--oy-radius-sm)',
            background: 'var(--color-error-bg)', border: '1px solid var(--color-error-line)',
            display: 'flex', alignItems: 'center', gap: 9,
          }}
        >
          <CircleAlert size={15} color="var(--color-error)" style={{ flex: 'none' }} aria-hidden />
          <span style={{ flex: 1, minWidth: 0, fontSize: px('footnote'), color: 'var(--color-ink-2)' }}>
            Bağlantı kurulamadı
          </span>
          <button
            type="button"
            onClick={home.refresh}
            style={{
              fontFamily: 'var(--font-display)', fontSize: px('microLabel'), fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-error)',
              background: 'none', border: 0, padding: '4px 2px', cursor: 'pointer', flex: 'none',
            }}
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* ═══ KAYDIRICI ══════════════════════════════════════════════════════ */}
      <div
        data-oy-scroll=""
        style={{
          flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
          paddingBottom: 'calc(var(--safe-bottom) + var(--oy-space-2))',
        }}
      >
        {/* ── PROFİL + CÜZDAN / MAÇLARIM ─────────────────────────────────── */}
        <div style={{ padding: `var(--oy-space-6) ${PAGE_X} 0`, display: 'flex', gap: 'var(--oy-space-3)' }}>
          {/* Profil kartı esner (`flex: 1 1 auto; min-width: 0`) — 360px'lik
              cihazlarda taşmaz. Aksan çizgisi YOKTUR: bu kart bir kapı değil,
              kullanıcının kendisidir. */}
          <Tap
            onClick={() => onNavigate('PROFILE')}
            label={SCREEN.profile}
            style={{
              flex: '1 1 auto', minWidth: 0, height: 'var(--oy-card-tall)',
              position: 'relative', overflow: 'hidden', borderRadius: 'var(--oy-radius-lg)',
              background: CARD_BG, border: CARD_BORDER,
              boxShadow: `0 8px 24px rgba(0,0,0,0.4), ${CARD_SHADOW}`,
            }}
          >
            <div
              style={{
                position: 'relative', height: '100%', padding: '18px 16px 16px',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                {/* Yuvarlağın içi ŞEFFAF, çerçeve ince, harfler BEYAZ
                    (Montserrat 800 italik — yazı tipi buradan miras alınır).
                    UserAvatar kendi yedek renklerini taşır; onları `!important`
                    ile değil, `.oy-home-avatar` altındaki eleman seçicisiyle
                    eziyoruz (index.css) — Tailwind v4'te `!` öneki geçersizdir
                    ve sınıf sırası da güvenilir değildir. */}
                <div
                  className="oy-home-avatar"
                  style={{
                    width: 'var(--oy-avatar)', height: 'var(--oy-avatar)', flex: 'none',
                    borderRadius: 'var(--oy-radius-pill)', overflow: 'hidden',
                    border: '1.5px solid rgba(255,255,255,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  <UserAvatar
                    name={name}
                    avatarUrl={avatarUrl}
                    className="w-full h-full rounded-full"
                    textClassName="text-[1rem]"
                  />
                </div>

                <div
                  style={{
                    flex: 'none', display: 'flex', flexDirection: 'column',
                    alignItems: 'flex-end', gap: 3, paddingTop: 3,
                  }}
                >
                  {loading ? (
                    <Skeleton w={62} h={11} />
                  ) : home.profile?.position ? (
                    <span
                      style={{
                        fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.1em',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {upper(home.profile.position)}
                    </span>
                  ) : (
                    // Yeni kullanıcı: etiket YERİNDE kalır, veri yerine çağrı gelir.
                    <span
                      style={{
                        fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.1em',
                        color: 'var(--color-ink-3)',
                      }}
                    >
                      POZİSYON · SEÇ →
                    </span>
                  )}
                  {loading ? (
                    <Skeleton w={44} h={13} />
                  ) : home.profile?.age !== null && home.profile?.age !== undefined ? (
                    <span
                      style={{
                        fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: px('bodyXl'),
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-2)',
                      }}
                    >
                      {home.profile.age} yaş
                    </span>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {loading && !name ? (
                  <Skeleton w={128} h={19} />
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                      fontSize: px('titleXl'), lineHeight: 1.05, letterSpacing: '-0.04em',
                      color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {name || 'Profilim'}
                  </span>
                )}
                {/* İnce ayırıcı — ad ile takım satırını ayırır. */}
                <div
                  style={{
                    marginTop: 3, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
                  }}
                >
                  {loading ? (
                    <Skeleton w={96} h={13} />
                  ) : home.profile?.team ? (
                    <>
                      <TeamCrest
                        config={home.profile.team.crestConfig}
                        color1={home.profile.team.color1}
                        color2={home.profile.team.color2}
                        size={22}
                        className="shrink-0"
                      />
                      <span
                        style={{
                          fontSize: px('footnoteLg'), fontWeight: 500, color: 'var(--color-ink)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {home.profile.team.name}
                      </span>
                    </>
                  ) : (
                    <span
                      style={{
                        fontSize: px('footnoteLg'), fontWeight: 500, color: 'var(--color-ink-3)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      Takımın yok · Kur
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Tap>

          {/* Cüzdan + Maçlarım — sabit 128px kolon.
              Maçı YOKSA Maçlarım kutusu HİÇ ÇİZİLMEZ ve cüzdan 176px'in
              tamamını alır; tutar 26 → 34px büyür. Boş kutu göstermek yerine
              yer vermemek bilinçli: ekranda "eksik bir şey var" hissi olmaz. */}
          <div
            style={{
              flex: '0 0 var(--oy-wallet-w)', height: 'var(--oy-card-tall)',
              display: 'flex', flexDirection: 'column', gap: 'var(--oy-space-2)',
            }}
          >
            <Tap
              onClick={() => onNavigate('WALLET')}
              label={SCREEN.wallet}
              style={{
                flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
                borderRadius: 'var(--oy-radius-lg)', border: BOX_BORDER,
              }}
            >
              <div
                style={{
                  height: '100%', padding: 'var(--oy-space-3)', display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 'var(--oy-space-2)', textAlign: 'center', boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wallet size={15} color="var(--color-ink-2)" strokeWidth={2} style={{ flex: 'none' }} aria-hidden />
                  <span
                    style={{
                      fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.1em',
                      color: 'var(--color-ink-4)',
                    }}
                  >
                    CÜZDANIM
                  </span>
                </div>
                {loading ? (
                  <Skeleton w={72} h={22} />
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-display)', fontWeight: 300,
                      fontSize: hasNextMatch ? px('amount') : px('amountLg'),
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                      // Yeni kullanıcıda bakiye ₺0'dır ve NÖTR tonda durur:
                      // para rengiyle yazılan bir sıfır, olmayan parayı
                      // varmış gibi öne çıkarır.
                      color: home.balance && home.balance > 0
                        ? 'var(--color-money-balance)'
                        : 'var(--color-ink-2)',
                    }}
                  >
                    {money(home.balance, error)}
                  </span>
                )}
              </div>
            </Tap>

            {hasNextMatch && (
              <Tap
                onClick={() => onNavigate('MY_MATCHES')}
                label={SCREEN.myMatches}
                style={{
                  flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
                  borderRadius: 'var(--oy-radius-lg)', border: BOX_BORDER,
                }}
              >
                <div
                  style={{
                    height: '100%', padding: 'var(--oy-space-3)', display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 7, textAlign: 'center', boxSizing: 'border-box',
                  }}
                >
                  <span
                    style={{
                      fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.1em',
                      color: 'var(--color-ink-4)',
                    }}
                  >
                    MAÇ
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                      fontSize: px('bodyXl'), lineHeight: 1.15, letterSpacing: '-0.03em',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {dayLabel(nextMatchAt as Date)} {clock(nextMatchAt as Date)}
                  </span>
                  {/* Bilet sayısı DEĞİL, kalan süre. */}
                  <span
                    style={{
                      fontSize: px('captionLg'), fontVariantNumeric: 'tabular-nums',
                      color: 'var(--color-ink-2)',
                    }}
                  >
                    {remainingText(nextMatchAt as Date)}
                  </span>
                </div>
              </Tap>
            )}
          </div>
        </div>

        {/* ── TOP OYNA + MAÇ ŞERİDİ ──────────────────────────────────────────
            İkisi KAYNAKLANMIŞTIR: aralarında 10px'lik "sonsuzluk çizgisi"
            durur ve şeridi çevreleyen bir kutu YOKTUR. Kartlar ekranın
            kenarından taşarak kaybolur — devam ettiğini kutu değil, kesilme
            anlatır. */}
        <div style={{ margin: 'var(--oy-space-8) 0 0', display: 'flex', flexDirection: 'column' }}>
          <Tap
            onClick={() => onNavigate('MATCH_DISCOVERY')}
            label={`${CARD.matchDiscovery} — maç bul`}
            style={{
              margin: `0 ${PAGE_X}`, position: 'relative', overflow: 'hidden',
              height: 'var(--oy-card-hero)', borderRadius: 'var(--oy-radius-xl)',
              border: '1px solid rgba(0,0,0,0.2)',
              boxShadow: '0 0 50px rgba(250,204,21,0.26), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#FACC15 0%,#FFD700 22%,#EAB308 46%,#1a1600 75%,#000000 100%)' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.4, background: 'radial-gradient(ellipse at 80% 50%,rgba(57,255,20,0.25) 0%,transparent 60%)' }} />
            <div
              style={{
                position: 'absolute', inset: 0, padding: '0 104px 0 20px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.18em', color: 'var(--color-on-primary)' }}>
                MAÇ BUL
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                  fontSize: px('headlineXl'), lineHeight: 0.94, letterSpacing: '-0.045em',
                  color: 'var(--color-on-primary)',
                }}
              >
                {upper(CARD.matchDiscovery)}
              </span>
              {loading ? (
                <Skeleton w={150} h={12} light />
              ) : (
                <span style={{ fontSize: px('body'), fontWeight: 500, color: 'rgba(10,14,20,0.75)' }}>
                  {heroText(error, home.matchTotal, hasScope)}
                </span>
              )}
            </div>
            <div
              aria-hidden
              style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--oy-radius-pill)', background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)', boxShadow: '0 0 24px rgba(0,0,0,0.8)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--oy-radius-pill)', border: '2px solid rgba(250,204,21,0.6)', boxShadow: 'inset 0 0 18px rgba(250,204,21,0.35)' }} />
              <OynaMark width={64} height={63.2} style={{ color: 'var(--color-cat-play)', position: 'relative', zIndex: 10 }} />
            </div>
          </Tap>

          {/* Sonsuzluk çizgisi — iki uçta şeffaflığa sönümlenir, ekranı
              kenardan kenara kat eder. Şeridin "buradan devam ediyor"
              işareti budur. */}
          <div
            aria-hidden
            style={{
              height: 2, marginTop: 10,
              background: 'linear-gradient(90deg,transparent 0%,#FACC15 14%,#EAB308 62%,rgba(250,204,21,0.15) 92%,transparent 100%)',
              boxShadow: '0 0 14px rgba(250,204,21,0.45)',
            }}
          />

          {loading ? (
            <StripSkeleton />
          ) : home.strip.length > 0 ? (
            <div
              data-oy-strip=""
              style={{
                padding: `var(--oy-space-4) ${PAGE_X}`, display: 'flex', gap: 'var(--oy-space-3)',
                overflowX: 'auto', scrollSnapType: 'x proximity', scrollPaddingLeft: 'var(--oy-space-6)',
              }}
            >
              {home.strip.map((m) => (
                <Tap
                  key={m.id}
                  onClick={() => { void openMatch(m.id); }}
                  label={`${m.pitchName} · ${dayLabel(m.startsAt)} ${clock(m.startsAt)}`}
                  style={{
                    scrollSnapAlign: 'start', flex: '0 0 auto',
                    width: 'var(--oy-matchcard-w)', maxWidth: '52vw',
                    borderRadius: 'var(--oy-radius-md)', overflow: 'hidden',
                    background: CARD_BG, border: CARD_BORDER,
                  }}
                >
                  <div style={{ position: 'relative', height: 'var(--oy-matchphoto-h)', background: 'var(--color-surface-1)' }}>
                    {/* Fotoğraf = O MAÇIN OYNANACAĞI SAHANIN fotoğrafı.
                        Yoksa yüzey rengi + saha amblemi kalır (uydurma
                        görsel YOK). */}
                    <Photo url={m.photo?.url} variants={m.photo?.variants} alt="" />
                    {!m.photo && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <MapPin size={22} color="var(--color-ink-4)" strokeWidth={1.8} />
                      </div>
                    )}
                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(10,14,20,0.88) 0%,transparent 62%)' }} />
                    {/* Kalan kontenjan — sağ üst, tümü beyaz. Sayı yoksa
                        rozet hiç çizilmez (bkz. sayı kuralı). */}
                    {m.openCount !== null && m.openCount > 0 && (
                      <span
                        style={{
                          position: 'absolute', right: 8, top: 8, display: 'flex',
                          alignItems: 'center', gap: 5, padding: '5px 9px',
                          borderRadius: 'var(--oy-radius-pill)', background: 'rgba(10,14,20,0.84)',
                          border: '1px solid rgba(255,255,255,0.28)',
                        }}
                      >
                        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 'var(--oy-radius-pill)', background: 'var(--color-ink)' }} />
                        <span style={{ fontSize: px('caption'), fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)' }}>
                          {m.openCount} yer kaldı
                        </span>
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '12px 13px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                          fontSize: px('headline'), lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.045em', color: 'var(--color-cat-play)',
                        }}
                      >
                        {clock(m.startsAt)}
                      </span>
                      <span style={{ fontSize: px('footnoteLg'), color: 'var(--color-ink)' }}>
                        {dayLabel(m.startsAt)}
                      </span>
                    </div>
                    <span
                      style={{
                        display: 'block', marginTop: 7, fontFamily: 'var(--font-display)',
                        fontWeight: 800, fontStyle: 'italic', fontSize: px('bodyLg'),
                        letterSpacing: '-0.03em', color: 'var(--color-ink)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {m.pitchName}
                    </span>
                    {m.distanceKm !== null && (
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={12} color="var(--color-ink-3)" strokeWidth={2.2} style={{ flex: 'none' }} aria-hidden />
                        <span style={{ fontSize: px('footnoteLg'), fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)' }}>
                          {m.distanceKm.toFixed(1)} km
                        </span>
                      </div>
                    )}
                  </div>
                </Tap>
              ))}

              {/* Şeridin sonu: TÜM MAÇLAR — şeffaf zemin, beyaz kesikli çerçeve. */}
              <Tap
                onClick={() => onNavigate('MATCH_DISCOVERY')}
                label="Tüm maçlara göz at"
                style={{
                  scrollSnapAlign: 'start', flex: 'none', width: 'var(--oy-allcard-w)',
                  alignSelf: 'stretch', borderRadius: 'var(--oy-radius-md)',
                  border: '1px dashed rgba(255,255,255,0.45)', display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '16px 12px', boxSizing: 'border-box',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 42, height: 42, borderRadius: 'var(--oy-radius-pill)',
                    border: '1px solid rgba(255,255,255,0.4)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ChevronRight size={19} color="var(--color-ink)" strokeWidth={2.2} />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                    fontSize: px('bodyLg'), lineHeight: 1.1, letterSpacing: '-0.03em',
                    color: 'var(--color-ink)', textAlign: 'center',
                  }}
                >
                  TÜM<br />MAÇLAR
                </span>
                {home.matchTotal !== null && (
                  <span style={{ fontSize: px('footnote'), fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)', textAlign: 'center' }}>
                    {home.matchTotal} maç
                  </span>
                )}
              </Tap>
            </div>
          ) : (
            <StripEmpty
              error={error}
              hasScope={hasScope}
              onCreate={() => onNavigate('MATCH_CREATE')}
              onBrowse={() => onNavigate('MATCH_DISCOVERY')}
            />
          )}
        </div>

        {/* ── KAPI KARTLARI ──────────────────────────────────────────────── */}
        <div
          style={{
            margin: `var(--oy-space-8) ${PAGE_X} var(--oy-space-8)`,
            display: 'flex', flexDirection: 'column', gap: 'var(--oy-space-4)',
          }}
        >
          {/* SAHA KİRALA — sağda fotoğraf bandı. Fotoğraf sola doğru YUMUŞAK
              PERDEYLE sönümlenir: hem çok kademeli bir gradyan hem de
              `mask-image` var. Gradyan tek başına kenarı kesiyordu; maske tek
              başına eski WebView'larda çalışmıyordu. İkisi birlikte hem
              kesintisiz hem güvenli. Öneksiz `mask-image` ile
              `-webkit-mask-image` BİRLİKTE yazılmalı. */}
          <Tap
            onClick={() => onNavigate('PITCH_DISCOVERY')}
            label={`${CARD.pitchDiscovery} — rezervasyon`}
            style={{
              position: 'relative', overflow: 'hidden', height: 'var(--oy-card-wide)',
              borderRadius: 'var(--oy-radius-lg)', background: CARD_BG,
              border: CARD_BORDER, boxShadow: CARD_SHADOW,
            }}
          >
            <Accent from="#10B981" to="#059669" glow="rgba(16,185,129,0.5)" />
            {home.banner && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, ...BANNER_MASK }}>
                <Photo url={home.banner.sourceUrl} variants={home.banner.variants} alt="" style={{ objectPosition: 'right center' }} />
              </div>
            )}
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right,rgba(10,14,20,0.6) 0%,rgba(10,14,20,0.3) 46%,rgba(10,14,20,0.07) 74%,transparent 100%)',
              }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'stretch', zIndex: 2 }}>
              <div
                style={{
                  flex: 1, minWidth: 0, padding: '0 0 0 18px', display: 'flex',
                  flexDirection: 'column', justifyContent: 'center', gap: 7,
                }}
              >
                <span style={{ fontSize: px('caption'), fontWeight: 600, letterSpacing: '0.14em', color: 'var(--color-cat-pitch)' }}>
                  REZERVASYON
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                    fontSize: px('headlineLg'), lineHeight: 0.98, letterSpacing: '-0.04em',
                    color: 'var(--color-ink)',
                  }}
                >
                  {upper(CARD.pitchDiscovery)}
                </span>
                {loading ? (
                  <Skeleton w={168} h={12} />
                ) : (
                  <span style={{ fontSize: px('body'), lineHeight: 1.3, color: 'var(--color-ink-2)' }}>
                    {pitchText(error, home.pitches, hasScope)}
                  </span>
                )}
              </div>
            </div>
          </Tap>

          {/* MAÇ KUR — arka plandaki arena çizimi ÜÇ kartın arkasına
              bölünmüştür (tek görsel, farklı `background-position`).
              SIRA DEĞİŞİRSE DESEN KIRILIR: dizilim sabittir. */}
          <Tap
            onClick={() => onNavigate('MATCH_CREATE')}
            label={CARD.matchCreate}
            style={{
              position: 'relative', overflow: 'hidden', height: 'var(--oy-card-row)',
              borderRadius: 'var(--oy-radius-lg)', background: CARD_BG,
              border: CARD_BORDER, boxShadow: CARD_SHADOW,
            }}
          >
            <Accent from="#FF7A00" to="#E64A19" glow="rgba(255,122,0,0.5)" />
            <ArenaLayer position={ARENA_POS.create} />
            <div style={{ position: 'absolute', inset: 0, padding: '0 var(--oy-space-4)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                    fontSize: px('headline'), lineHeight: 1, letterSpacing: '-0.035em',
                    color: 'var(--color-ink)',
                  }}
                >
                  {upper(CARD.matchCreate)}
                </span>
                {/* Bu satır SABİT metindir — sayıya bağlı değil, bu yüzden
                    yükleniyor/hata durumlarında da olduğu gibi kalır. */}
                <span style={{ fontSize: px('body'), lineHeight: 1.3, color: 'var(--color-ink-2)' }}>
                  Sahayı seç, kadroyu davet et
                </span>
              </div>
              <IconRing size={66} color="rgba(255,122,0,0.75)">
                <MatchCreateMark width={28} height={29.3} />
              </IconRing>
            </div>
          </Tap>

          {/* KALECİ + HAKEM — yan yana, arena deseninin devamı. */}
          <div style={{ display: 'flex', gap: 'var(--oy-space-4)' }}>
            <Tap
              onClick={() => onNavigate('MARKETPLACE_GK')}
              label={SCREEN.marketplaceGk}
              style={{
                flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
                height: 'var(--oy-card-duo)', borderRadius: 'var(--oy-radius-lg)',
                background: CARD_BG, border: CARD_BORDER, boxShadow: CARD_SHADOW,
              }}
            >
              <Accent from="#39FF14" to="#1a7a20" glow="rgba(57,255,20,0.5)" />
              <ArenaLayer position={ARENA_POS.keeper} />
              <div style={{ position: 'absolute', inset: 0, padding: '0 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                      fontSize: px('titleLg'), lineHeight: 1, letterSpacing: '-0.032em',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {upper(CARD.marketplaceGk)}
                  </span>
                  {loading ? (
                    <Skeleton w={64} h={11} />
                  ) : (
                    <span style={{ fontSize: px('body'), lineHeight: 1.3, color: 'var(--color-ink-2)' }}>
                      {providerText(error, home.goalkeepers, hasScope)}
                    </span>
                  )}
                </div>
                <IconRing size={44} color="rgba(57,255,20,0.75)" glow="rgba(57,255,20,0.35)">
                  <KeeperGloveMark width={26} height={18.7} style={{ color: 'var(--color-cat-keeper)' }} />
                </IconRing>
              </div>
            </Tap>

            <Tap
              onClick={() => onNavigate('MARKETPLACE_REF')}
              label={SCREEN.marketplaceRef}
              style={{
                flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
                height: 'var(--oy-card-duo)', borderRadius: 'var(--oy-radius-lg)',
                background: CARD_BG, border: CARD_BORDER, boxShadow: CARD_SHADOW,
              }}
            >
              <Accent from="#60a5fa" to="#2563EB" glow="rgba(96,165,250,0.5)" />
              <ArenaLayer position={ARENA_POS.ref} />
              <div style={{ position: 'absolute', inset: 0, padding: '0 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
                      fontSize: px('titleLg'), lineHeight: 1, letterSpacing: '-0.032em',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {upper(CARD.marketplaceRef)}
                  </span>
                  {loading ? (
                    <Skeleton w={64} h={11} />
                  ) : (
                    <span style={{ fontSize: px('body'), lineHeight: 1.3, color: 'var(--color-ink-2)' }}>
                      {providerText(error, home.referees, hasScope)}
                    </span>
                  )}
                </div>
                <IconRing size={44} color="rgba(96,165,250,0.75)" glow="rgba(96,165,250,0.35)">
                  <RefereeWhistleMark width={26} height={19} style={{ color: 'var(--color-cat-ref)' }} />
                </IconRing>
              </div>
            </Tap>
          </div>

          {/* TAKTİK STÜDYO — ikon yok, yuvarlak yok, ok yok. Yazı ortalı.
              Ekranın en altında tek başına durduğu için ayrı bir ses tonu
              taşır: Open Sans 700 ve kendi kırmızısı. */}
          <Tap
            onClick={() => onNavigate('STUDIO')}
            label={CARD.studio}
            style={{
              position: 'relative', overflow: 'hidden', height: 'var(--oy-card-strip)',
              borderRadius: 'var(--oy-radius-lg)', background: CARD_BG,
              border: CARD_BORDER, boxShadow: CARD_SHADOW,
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, opacity: 0.75,
                background: `url(${studioBackdrop}) center bottom/115% auto no-repeat`,
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse at 50% 52%,rgba(10,14,20,0.92) 0%,rgba(10,14,20,0.62) 32%,rgba(10,14,20,0.14) 64%,transparent 100%)',
              }}
            />
            <Accent from="#FF0000" to="#8f0000" glow="rgba(255,0,0,0.45)" />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%,rgba(255,0,0,0.12) 0%,transparent 62%)' }} />
            <div style={{ position: 'absolute', inset: 0, padding: '0 15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: px('bodyXl'),
                  letterSpacing: '0.02em', color: 'var(--color-cat-studio)',
                }}
              >
                {upper(CARD.studio)}
              </span>
            </div>
          </Tap>
        </div>
      </div>
    </div>
  );
};

// ── YARDIMCI PARÇALAR ───────────────────────────────────────────────────────

/**
 * Perdenin OPAK ucu yazının sağında biter — fotoğraf "SAHA KİRALA" yazısına
 * binmez. Yüzdeler tasarımdan birebir; `-webkit-` önekli ve öneksiz sürüm
 * BİRLİKTE yazılır (eski WebView'lar yalnız önekliyi tanır).
 */
const MASK = 'linear-gradient(to right, transparent 34%, rgba(0,0,0,0.06) 46%, rgba(0,0,0,0.22) 57%, rgba(0,0,0,0.48) 68%, rgba(0,0,0,0.74) 79%, rgba(0,0,0,0.92) 89%, #000 100%)';
const BANNER_MASK: React.CSSProperties = {
  WebkitMaskImage: MASK,
  maskImage: MASK,
};

/** İkon halkası — içi `#161B22`. Siyah DEĞİL: kartın gradyanının koyu ucunda
 *  siyah halka "delik" gibi görünüyordu. */
const IconRing: React.FC<{ size: number; color: string; glow?: string; children: React.ReactNode }> = ({
  size, color, glow, children,
}) => (
  <div
    aria-hidden
    style={{
      width: size, height: size, flex: 'none', borderRadius: 'var(--oy-radius-pill)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-surface-1)', border: `2px solid ${color}`,
      ...(glow ? { boxShadow: `0 0 26px ${glow}` } : null),
    }}
  >
    {children}
  </div>
);

/** Arena çizimi katmanı — tek görselin ilgili parçası. */
const ArenaLayer: React.FC<{ position: string }> = ({ position }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 0, opacity: 0.3,
      backgroundImage: `url(${arenaLines})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: ARENA_SIZE,
      backgroundPosition: position,
    }}
  />
);

/** Şeridin yükleniyor hâli — kart ÖLÇÜSÜ değişmez, yalnız içi iskelet olur. */
const StripSkeleton: React.FC = () => (
  <div style={{ padding: `var(--oy-space-4) ${PAGE_X}`, display: 'flex', gap: 'var(--oy-space-3)', overflow: 'hidden' }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          flex: '0 0 auto', width: 'var(--oy-matchcard-w)', maxWidth: '52vw',
          borderRadius: 'var(--oy-radius-md)', overflow: 'hidden',
          background: CARD_BG, border: CARD_BORDER,
        }}
      >
        <div style={{ height: 'var(--oy-matchphoto-h)', background: 'var(--color-surface-1)' }} />
        <div style={{ padding: '12px 13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w={78} h={20} />
          <Skeleton w={116} h={13} />
          <Skeleton w={54} h={11} />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Şeridin boş hâli — TEK BLOK.
 *
 * Boş bir şerit yerine tek bir blok gelir; kullanıcıya "burada bir şey
 * eksik" değil "burada şunu yapabilirsin" denir. İki çıkış: kendi maçını
 * kur, ya da tüm maçlara bak.
 */
const StripEmpty: React.FC<{
  error: boolean;
  hasScope: boolean;
  onCreate: () => void;
  onBrowse: () => void;
}> = ({ error, hasScope, onCreate, onBrowse }) => (
  <div style={{ padding: `var(--oy-space-4) ${PAGE_X}` }}>
    <div
      style={{
        borderRadius: 'var(--oy-radius-md)', border: '1px dashed rgba(255,255,255,0.28)',
        padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 'var(--oy-space-3)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontStyle: 'italic',
          fontSize: px('bodyLg'), letterSpacing: '-0.03em', color: 'var(--color-ink)',
        }}
      >
        {error
          ? 'MAÇLAR YÜKLENEMEDİ'
          : hasScope ? 'BUGÜN YAKININDA MAÇ YOK' : 'ÖNCE BÖLGENİ SEÇ'}
      </span>
      <div style={{ display: 'flex', gap: 'var(--oy-space-2)' }}>
        <Tap
          onClick={onCreate}
          label={CARD.matchCreate}
          style={{
            flex: 1, minHeight: 'var(--oy-tap-min)', borderRadius: 'var(--oy-radius-sm)',
            border: BOX_BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: px('footnote'), fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-ink)' }}>
            {upper(CARD.matchCreate)}
          </span>
        </Tap>
        <Tap
          onClick={onBrowse}
          label="Bu haftanın maçları"
          style={{
            flex: 1, minHeight: 'var(--oy-tap-min)', borderRadius: 'var(--oy-radius-sm)',
            border: BOX_BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: px('footnote'), fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-ink)' }}>
            BU HAFTA
          </span>
        </Tap>
      </div>
    </div>
  </div>
);

export default Dashboard;
