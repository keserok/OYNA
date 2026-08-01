// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak: onaylı tasarım teslimi (OYNA-AnaSayfa-teslim.html) — dört durum
// (Normal · Yükleniyor · Boş · Hata), 390×844. Ölçüler, sıra, renkler ve
// metinler oradan birebir alındı.
//
// ── TEK EKRAN, KAYDIRMA YOK ────────────────────────────────────────────────
// Ekran kaydırılmaz: altı kutu ekrana SIĞAR. Bunun için yükseklikler sabit
// piksel değil ORAN'dır (hero 1.42, tam kartlar 1, ikili sıra 1, şerit 0.62)
// ve her birinin bir alt sınırı (min-height) vardır. Punto/boşluk `clamp()` +
// container query (`cqw`/`cqh`) ile kapsayıcının ölçüsüne bağlıdır. Kök öğedeki
// `containerType: 'size'` bu birimlerin çözüldüğü bağlamdır — KALDIRILAMAZ,
// yoksa tüm clamp'ler alt sınırlarına çöker.
// Doğrulandığı aralık: iPhone SE (667px) → iPhone 16 Pro Max (932px).
//
// ── STİL NEDEN SATIR İÇİ ───────────────────────────────────────────────────
// Tasarımın gradyanları, çok katmanlı gölgeleri ve `clamp()`li ölçüleri
// Tailwind token'ı olmayan değerler. Projedeki yerleşik desen de bu (kart
// görselleri hep satır içi `style`). Token'ı OLAN her şey (renk rolleri,
// punto basamakları, ekran adları) token'dan gelir; elle yazılmaz.
//
// ── ALT MENÜ BURADA ÇİZİLMEZ ───────────────────────────────────────────────
// Teslim HTML'i alt menüyü de içeriyordu çünkü tek dosyalık maketti. Gerçek
// uygulamada alt menü App.tsx'in çizdiği `components/BottomNav.tsx`'tir.
// Buradaki tek sorumluluk ona YER AYIRMAK: en alttaki `pb-safe-nav` bloğu.
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Bell, CalendarCheck, ChevronRight, CircleAlert, Flame, Target } from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { UserAvatar } from '../components/common/UserAvatar';
import { useDashboardCounts } from '../hooks/useDashboardCounts';
import { CARD, SCREEN, WAIT } from '../ui/labels';
import {
  KeeperGloveMark,
  MatchCreateMark,
  OynaMark,
  PitchPinMark,
  RefereeWhistleMark,
} from '../components/dashboard/OynaMarks';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onBack: () => void;
  onRoleSelect?: (role: any) => void;
}

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

// ── Ortak ölçüler ───────────────────────────────────────────────────────────
// Tasarımdaki değerler; birden çok kartta tekrar ettikleri için burada bir kez
// yazılır. Elle ikinci kez yazılan bir ölçü, er geç sapan bir ölçüdür.
const PAGE_X = 'clamp(16px,5.6cqw,24px)';
const ROW_RADIUS = 'clamp(20px,6.6cqw,26px)';
const ROW_BG = 'linear-gradient(135deg,#11161d 0%,#0a0e14 55%,#05070a 100%)';
const ROW_MIN_H = 82;
const ROW_MAX_H = 'clamp(104px,11.9cqh,113px)';

/** Kartların basılı hâli — tasarımda `transform:scale(0.985)`. */
const pressable: React.CSSProperties = { transition: 'transform .12s ease' };

/**
 * Kart = tıklanabilir kap. Buton stili İSTENMİYOR (görsel tamamen kartın
 * kendisi), ama davranışı tam bir butonun olmalı: klavyeyle odaklanır,
 * Enter/Space ile açılır, ekran okuyucu "düğme" diye duyurur.
 */
interface CardShellProps {
  onClick: () => void;
  label: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}

const CardShell: React.FC<CardShellProps> = ({ onClick, label, style, children }) => (
  <div
    role="button"
    tabIndex={0}
    aria-label={label}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    }}
    className="oy-dash-card outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14]"
    style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', ...pressable, ...style }}
  >
    {children}
  </div>
);

/**
 * Kartın üstündeki 2px kategori ışığı — kart kimliğinin taşıyıcısı.
 * Aksan rengi YALNIZ burada, ikon halkasında ve bölüm etiketinde kullanılır.
 */
const AccentLine: React.FC<{ from: string; to: string; glow: string }> = ({ from, to, glow }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 2,
      background: `linear-gradient(90deg,${from} 0%,${to} 55%,transparent 100%)`,
      boxShadow: `0 0 14px ${glow}`,
    }}
  />
);

/**
 * YÜKLENİYOR durumunun iskelet çubuğu.
 *
 * Başlıklar YERİNDE KALIR, yalnız veri alanı çubuğa döner — böylece veri
 * gelince kartlar zıplamaz. `role="status"` + `aria-live="polite"`: ekran
 * okuyucu kullanıcısı beklendiğini duyar.
 */
const SkeletonBar: React.FC<{ width: string; height: number; onLight?: boolean }> = ({
  width, height, onLight = false,
}) => (
  <div
    role="status"
    aria-live="polite"
    aria-label={WAIT.loading}
    style={{
      height, width, borderRadius: height / 2 + 0.5,
      background: onLight
        ? 'linear-gradient(90deg,rgba(0,0,0,0.10),rgba(0,0,0,0.24),rgba(0,0,0,0.10))'
        : 'linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.15),rgba(255,255,255,0.05))',
      backgroundSize: '200% 100%',
      animation: 'oyna-shimmer 1.5s linear infinite',
    }}
  />
);

/**
 * Kart altı yazısı: yükleniyorsa iskelet çubuğu, yoksa metnin kendisi.
 *
 * Hata metnini BU BİLEŞEN SEÇMEZ — her kartın hata karşılığı farklıdır
 * (hero "Maçlar yüklenemedi" der, diğerleri "—"). Kararı aşağıdaki metin
 * fonksiyonları verir; burada tek iş çizmektir.
 */
const CardMeta: React.FC<{
  loading: boolean;
  text: string;
  skeletonWidth: string;
  skeletonHeight?: number;
  onLight?: boolean;
}> = ({ loading, text, skeletonWidth, skeletonHeight = 11, onLight }) => {
  if (loading) return <SkeletonBar width={skeletonWidth} height={skeletonHeight} onLight={onLight} />;
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: onLight ? 'rgba(0,0,0,0.7)' : 'var(--color-ink-3)',
      }}
    >
      {text}
    </span>
  );
};

// ── Kart altı metinleri ─────────────────────────────────────────────────────
// Tek/çoğul/sıfır ve hata karşılıkları tasarımda birebir verildi.
// Türkçede sayıdan sonra çoğul eki KULLANILMAZ ("6 maç", "6 maçlar" değil) —
// bu yüzden tek fark sıfır hâlidir.
// `n === null` = kullanıcının henüz konumu/bölgesi yok, sayı SORULMADI. Bu
// durum tasarımda yoktu; metinleri tasarımdakilerle AYNI uzunlukta tutuyoruz
// (tek satır) — uzun bir cümle hero kartında ikinci satıra kırılıp küçük
// ekranlarda kartın dışına taşıyordu.
const heroText = (error: boolean, n: number | null): string => {
  if (error) return 'Maçlar yüklenemedi';
  if (n === null) return 'Yakınındaki maçları gör.';
  return n === 0 ? 'Bugün yakınında maç yok.' : `Bugün için ${n} maç var.`;
};
const pitchText = (error: boolean, n: number | null): string => {
  if (error) return '—';
  if (n === null) return 'Yakındaki sahaları gör';
  return n === 0 ? 'Yakında müsait saha yok' : `Çevrende ${n} halı saha`;
};
// Kaleci/Hakem kartları dar (yan yana iki kart) — metin TEK SATIRDA kalmalı.
// 'Şu an müsait yok' iki satıra kırılıp kartı sıkıştırıyordu.
const providerText = (error: boolean, n: number | null): string => {
  if (error) return '—';
  if (n === null) return 'Listeye göz at';
  return n === 0 ? 'Müsait yok' : `${n} müsait`;
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const globalTexts = useAppStore((s) => s.globalTexts);
  const unreadNotificationsCount = useAppStore((s) => s.unreadNotificationsCount);
  const adminUsers = useAppStore((s) => s.adminUsers);
  const sessionProfile = useAppStore((s) => s.currentUserProfile);
  const setIsNotificationsOpen = useAppStore((s) => s.setIsNotificationsOpen);

  const counts = useDashboardCounts();
  const { loading, error } = counts;

  // MOB-S4: sol üst avatar Profil ekranıyla AYNI kaynaktan beslenir
  // (profiles.avatar_url; girişte store'a yazılır, profil düzenlemesi anında
  // günceller). Oturum profili gelmemişse admin listesindeki kayda düşer.
  const currentUserUid = auth.currentUser?.uid ?? '';
  const currentUserProfile = React.useMemo(
    () => (currentUserUid ? adminUsers.find((u) => u.id === currentUserUid) : undefined),
    [adminUsers, currentUserUid],
  );
  const displayName = sessionProfile?.name || currentUserProfile?.name;
  const avatarUrl = sessionProfile?.avatar || currentUserProfile?.avatar;

  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        containerType: 'size',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* ── BAŞLIK ────────────────────────────────────────────────────────── */}
      <header
        className="dash-safe-top"
        style={{
          // DİKKAT: `padding` KISAYOLU KULLANMA. Satır içi kısayol,
          // `.dash-safe-top` sınıfının verdiği `padding-top`u ezer ve üst
          // güvenli alan sıfırlanır (başlık çentiğin altına girer, tüm düzen
          // 58px yukarı kayar). Uzun yazımlar üst boşluğa dokunmaz.
          paddingLeft: PAGE_X,
          paddingRight: PAGE_X,
          paddingBottom: 'clamp(9px,1.5cqh,14px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => onNavigate('PROFILE')}
            aria-label={SCREEN.profile}
            style={{
              width: 'clamp(42px,11.9cqw,48px)', height: 'clamp(42px,11.9cqw,48px)',
              borderRadius: 9999, background: 'linear-gradient(135deg,#161B22,#0A0E14)',
              border: '1px solid rgba(255,255,255,0.1)', padding: 2,
              boxShadow: '0 0 20px rgba(57,255,20,0.15)', flex: 'none',
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
          >
            <UserAvatar
              name={displayName}
              avatarUrl={avatarUrl}
              className="w-full h-full rounded-full"
              textClassName="text-[0.875rem] font-extrabold italic"
            />
          </button>
          <h1
            style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1rem,4.4cqw,1.125rem)', lineHeight: 1.05,
              fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.02em',
              color: 'var(--color-ink)', whiteSpace: 'nowrap',
            }}
          >
            {upper(globalTexts?.dashboardTitle || SCREEN.dashboard)}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {/* Rezervasyonlar kısayolu — Maçlarım'ı REZERVASYONLAR segmentinde açar. */}
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setMyMatchesInitialSegment('BOOKINGS');
              onNavigate('MY_MATCHES');
            }}
            aria-label="Rezervasyonlarım"
            style={{
              width: 'clamp(42px,11.9cqw,48px)', height: 'clamp(42px,11.9cqw,48px)',
              borderRadius: 9999, background: 'rgba(22,27,34,0.8)',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)', flex: 'none',
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
          >
            <CalendarCheck size={20} color="#39FF14" />
          </button>

          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            aria-label="Bildirimler"
            style={{
              position: 'relative',
              width: 'clamp(42px,11.9cqw,48px)', height: 'clamp(42px,11.9cqw,48px)',
              borderRadius: 9999, background: 'rgba(22,27,34,0.8)',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)', flex: 'none',
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
          >
            <Bell size={20} color="#D1D5DB" />
            {unreadNotificationsCount > 0 ? (
              <span
                style={{
                  position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
                  padding: '0 4px', borderRadius: 9999, background: 'var(--color-error-fill)',
                  border: '3px solid var(--color-bg)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontSize: '0.6875rem',
                  fontWeight: 800, color: 'var(--color-on-error-fill)',
                }}
              >
                {unreadNotificationsCount}
              </span>
            ) : (
              <span
                aria-hidden
                style={{
                  position: 'absolute', top: 12, right: 12, width: 10, height: 10,
                  borderRadius: 9999, background: 'var(--color-primary)',
                  border: '2px solid #161B22', boxShadow: '0 0 10px rgba(57,255,20,0.8)',
                }}
              />
            )}
          </button>
        </div>
      </header>

      {/* ── HATA ŞERİDİ ───────────────────────────────────────────────────── */}
      {/* Kartlar TIKLANABİLİR KALIR: sayı gelmedi diye kapılar kapanmaz. */}
      {error && (
        <div
          role="alert"
          style={{
            margin: `0 ${PAGE_X} clamp(7px,1.25cqh,11px)`,
            padding: '8px 12px', borderRadius: 12,
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-line)',
            display: 'flex', alignItems: 'center', gap: 9, flex: 'none',
          }}
        >
          <CircleAlert size={15} color="var(--color-error)" style={{ flex: 'none' }} />
          <span
            style={{
              flex: 1, minWidth: 0, fontFamily: 'var(--font-body)',
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-ink-2)',
            }}
          >
            Bağlantı kurulamadı
          </span>
          <button
            type="button"
            onClick={counts.retry}
            style={{
              fontFamily: 'var(--font-display)', fontSize: '0.625rem', fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--color-error)', background: 'none', border: 0,
              padding: '4px 2px', cursor: 'pointer', flex: 'none',
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] rounded"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* ── KAPI KARTLARI ─────────────────────────────────────────────────── */}
      <main
        style={{
          padding: `0 ${PAGE_X}`,
          display: 'flex', flexDirection: 'column',
          gap: 'clamp(7px,1.25cqh,11px)',
          flex: 1, minHeight: 0,
        }}
      >
        {/* ═══ 1 · TOP OYNA — ekranın TEK dolu birincil bloğu ═══ */}
        <CardShell
          onClick={() => onNavigate('MATCH_DISCOVERY')}
          label={`${CARD.matchDiscovery} — maç bul`}
          style={{
            flex: '1.42 1 0', minHeight: 112,
            maxHeight: 'clamp(142px,16.3cqh,154px)',
            borderRadius: 'clamp(25px,8cqw,32px)',
            border: '1px solid rgba(0,0,0,0.2)',
            boxShadow: '0 0 60px rgba(250,204,21,0.35),0 0 120px rgba(255,215,0,0.15),inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#FACC15 0%,#FFD700 22%,#EAB308 46%,#1a1600 75%,#000000 100%)' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.4, background: 'radial-gradient(ellipse at 80% 50%,rgba(57,255,20,0.25) 0%,transparent 60%)' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(250,204,21,0.15) 0%,transparent 50%)' }} />

          <div
            style={{
              position: 'absolute', inset: 0,
              padding: 'clamp(15px,2.5cqh,22px) clamp(102px,31.5cqw,132px) clamp(15px,2.5cqh,22px) clamp(18px,5.6cqw,24px)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Flame size={16} color="#000000" style={{ flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.2em', color: '#000000' }}>
                  MAÇ BUL
                </span>
              </div>
              <h2
                style={{
                  margin: 0, fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.375rem,6.8cqw,1.75rem)', lineHeight: 0.94,
                  fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.035em',
                  color: '#000000', textShadow: '0 2px 8px rgba(250,204,21,0.3)',
                }}
              >
                TOP<br />OYNA
              </h2>
              <div style={{ marginTop: 8 }}>
                <CardMeta
                  loading={loading}
                  text={heroText(error, counts.todayMatches)}
                  skeletonWidth="62%"
                  onLight
                />
              </div>
            </div>

            <div
              aria-hidden
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 'clamp(90px,27cqw,112px)', height: 'clamp(90px,27cqw,112px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, borderRadius: 9999, background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)', boxShadow: '0 0 30px rgba(0,0,0,0.8),inset 0 0 20px rgba(0,0,0,0.5)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: 9999, border: '2px solid rgba(250,204,21,0.6)', boxShadow: '0 0 20px rgba(250,204,21,0.4),inset 0 0 10px rgba(250,204,21,0.1)' }} />
              <div style={{ position: 'absolute', inset: -6, borderRadius: 9999, border: '1px solid rgba(250,204,21,0.2)' }} />
              <OynaMark
                width="clamp(66px,19.4cqw,84.7px)"
                height="clamp(65.1px,19.15cqw,83.6px)"
                style={{
                  color: 'var(--color-cat-play)', position: 'relative', zIndex: 10,
                  filter: 'drop-shadow(0 0 14px rgba(250,204,21,0.75))',
                }}
              />
            </div>
          </div>
        </CardShell>

        {/* ═══ 2 · SAHALAR ═══ */}
        <CardShell
          onClick={() => onNavigate('PITCH_DISCOVERY')}
          label={`${CARD.pitchDiscovery} — rezervasyon`}
          style={{
            flex: '1 1 0', minHeight: ROW_MIN_H, maxHeight: ROW_MAX_H,
            borderRadius: ROW_RADIUS, background: ROW_BG,
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <AccentLine from="#10B981" to="#059669" glow="rgba(16,185,129,0.5)" />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 92% 50%,rgba(16,185,129,0.13) 0%,transparent 58%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: '0 clamp(13px,4.5cqw,18px)', display: 'flex', alignItems: 'center', gap: 'clamp(10px,4cqw,16px)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.8cqh,6px)' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em', color: 'var(--color-cat-pitch)' }}>
                REZERVASYON
              </span>
              <h3
                style={{
                  margin: 0, fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.125rem,5.9cqw,1.375rem)', lineHeight: 0.98,
                  whiteSpace: 'nowrap', fontWeight: 800, fontStyle: 'italic',
                  letterSpacing: '-0.03em', color: 'var(--color-ink)',
                }}
              >
                {upper(CARD.pitchDiscovery)}
              </h3>
              <CardMeta loading={loading} text={pitchText(error, counts.pitches)} skeletonWidth="58%" />
            </div>
            <div
              aria-hidden
              style={{
                width: 'clamp(54px,16cqw,66px)', height: 'clamp(54px,16cqw,66px)', flex: 'none',
                borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)',
                border: '2px solid rgba(16,185,129,0.75)',
                boxShadow: '0 0 26px rgba(16,185,129,0.35),inset 0 0 14px rgba(16,185,129,0.12)',
              }}
            >
              <PitchPinMark
                width="clamp(20.3px,3.12cqh,25.3px)"
                height="clamp(28px,4.3cqh,34.9px)"
                style={{ color: 'var(--color-cat-pitch)' }}
              />
            </div>
          </div>
        </CardShell>

        {/* ═══ 3 · MAÇ KUR ═══ */}
        <CardShell
          onClick={() => onNavigate('MATCH_CREATE')}
          label={CARD.matchCreate}
          style={{
            flex: '1 1 0', minHeight: ROW_MIN_H, maxHeight: ROW_MAX_H,
            borderRadius: ROW_RADIUS, background: ROW_BG,
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <AccentLine from="#FF7A00" to="#E64A19" glow="rgba(255,122,0,0.55)" />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 92% 50%,rgba(255,122,0,0.13) 0%,transparent 58%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: '0 clamp(13px,4.5cqw,18px)', display: 'flex', alignItems: 'center', gap: 'clamp(10px,4cqw,16px)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(4px,0.8cqh,6px)' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em', color: 'var(--color-cat-create)' }}>
                ORGANİZASYON
              </span>
              <h3
                style={{
                  margin: 0, fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.125rem,5.9cqw,1.375rem)', lineHeight: 0.98,
                  whiteSpace: 'nowrap', fontWeight: 800, fontStyle: 'italic',
                  letterSpacing: '-0.03em', color: 'var(--color-ink)',
                }}
              >
                {upper(CARD.matchCreate)}
              </h3>
              {/* Bu kartın altı SABİT metindir — sayıya bağlı değil, bu yüzden
                  yükleniyor/hata durumlarında da olduğu gibi kalır. */}
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-ink-3)' }}>
                Sahayı seç, kadroyu davet et
              </span>
            </div>
            <div
              aria-hidden
              style={{
                width: 'clamp(54px,16cqw,66px)', height: 'clamp(54px,16cqw,66px)', flex: 'none',
                borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)',
                border: '2px solid rgba(255,122,0,0.75)',
                boxShadow: '0 0 26px rgba(255,122,0,0.35),inset 0 0 14px rgba(255,122,0,0.12)',
              }}
            >
              <MatchCreateMark
                width="clamp(22px,6.7cqw,27.6px)"
                height="clamp(23px,6.99cqw,28.8px)"
                style={{ color: 'var(--color-cat-create)' }}
              />
            </div>
          </div>
        </CardShell>

        {/* ═══ 4 · KALECİ + HAKEM (yan yana) ═══ */}
        <div style={{ display: 'flex', gap: 'clamp(7px,2.4cqw,11px)', flex: '1 1 0', minHeight: ROW_MIN_H, maxHeight: ROW_MAX_H }}>
          <CardShell
            onClick={() => onNavigate('MARKETPLACE_GK')}
            label={SCREEN.marketplaceGk}
            style={{
              flex: '1 1 0', height: '100%', borderRadius: ROW_RADIUS, background: ROW_BG,
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <AccentLine from="#39FF14" to="#1a7a20" glow="rgba(57,255,20,0.5)" />
            <div style={{ position: 'absolute', inset: 0, padding: '0 clamp(10px,3.5cqw,14px)', display: 'flex', alignItems: 'center', gap: 'clamp(7px,2.5cqw,10px)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.6cqh,5px)' }}>
                <h3
                  style={{
                    margin: 0, fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1rem,4.1cqw,1.125rem)', lineHeight: 1,
                    fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.032em',
                    color: 'var(--color-ink)',
                  }}
                >
                  {upper(CARD.marketplaceGk)}
                </h3>
                <CardMeta loading={loading} text={providerText(error, counts.goalkeepers)} skeletonWidth="70%" skeletonHeight={10} />
              </div>
              <div
                aria-hidden
                style={{
                  width: 'clamp(37px,10.9cqw,44px)', height: 'clamp(37px,10.9cqw,44px)', flex: 'none',
                  borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)',
                  border: '2px solid rgba(57,255,20,0.7)', boxShadow: '0 0 20px rgba(57,255,20,0.3)',
                }}
              >
                <KeeperGloveMark
                  width="clamp(23px,6.9cqw,28.3px)"
                  height="clamp(16.5px,4.95cqw,20.3px)"
                  style={{ color: 'var(--color-cat-keeper)' }}
                />
              </div>
            </div>
          </CardShell>

          <CardShell
            onClick={() => onNavigate('MARKETPLACE_REF')}
            label={SCREEN.marketplaceRef}
            style={{
              flex: '1 1 0', height: '100%', borderRadius: ROW_RADIUS, background: ROW_BG,
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <AccentLine from="#60a5fa" to="#2563EB" glow="rgba(59,130,246,0.5)" />
            <div style={{ position: 'absolute', inset: 0, padding: '0 clamp(10px,3.5cqw,14px)', display: 'flex', alignItems: 'center', gap: 'clamp(7px,2.5cqw,10px)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.6cqh,5px)' }}>
                <h3
                  style={{
                    margin: 0, fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1rem,4.1cqw,1.125rem)', lineHeight: 1,
                    fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.032em',
                    color: 'var(--color-ink)',
                  }}
                >
                  {upper(CARD.marketplaceRef)}
                </h3>
                <CardMeta loading={loading} text={providerText(error, counts.referees)} skeletonWidth="70%" skeletonHeight={10} />
              </div>
              <div
                aria-hidden
                style={{
                  width: 'clamp(37px,10.9cqw,44px)', height: 'clamp(37px,10.9cqw,44px)', flex: 'none',
                  borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'radial-gradient(circle,#0A0E14 0%,#000000 100%)',
                  border: '2px solid rgba(59,130,246,0.7)', boxShadow: '0 0 20px rgba(59,130,246,0.3)',
                }}
              >
                <RefereeWhistleMark
                  width="clamp(22px,6.7cqw,27.4px)"
                  height="clamp(16.1px,4.91cqw,20.1px)"
                  style={{ color: 'var(--color-cat-ref)' }}
                />
              </div>
            </div>
          </CardShell>
        </div>

        {/* ═══ 5 · TAKTİK STÜDYO (şerit) ═══ */}
        <CardShell
          onClick={() => onNavigate('STUDIO')}
          label={CARD.studio}
          style={{
            flex: '0.62 1 0', minHeight: 52, maxHeight: 'clamp(64px,7.4cqh,70px)',
            borderRadius: 'clamp(17px,5.6cqw,22px)', background: ROW_BG,
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <AccentLine from="#F87171" to="#B23B3B" glow="rgba(248,113,113,0.45)" />
          <div style={{ position: 'absolute', inset: 0, padding: '0 clamp(12px,4.2cqw,16px)', display: 'flex', alignItems: 'center', gap: 'clamp(10px,3.4cqw,13px)' }}>
            <div
              aria-hidden
              style={{
                width: 'clamp(29px,8.4cqw,34px)', height: 'clamp(29px,8.4cqw,34px)', flex: 'none',
                borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#000', border: '1.5px solid rgba(248,113,113,0.6)',
                boxShadow: '0 0 16px rgba(248,113,113,0.25)',
              }}
            >
              <Target size={17} color="var(--color-cat-studio)" style={{ flex: 'none' }} />
            </div>
            <span
              style={{
                flex: 1, fontFamily: 'var(--font-display)',
                fontSize: 'clamp(0.8125rem,3.8cqw,0.875rem)', fontWeight: 800,
                fontStyle: 'italic', letterSpacing: '-0.015em', color: 'var(--color-ink)',
              }}
            >
              {upper(CARD.studio)}
            </span>
            <ChevronRight size={18} color="var(--color-ink-4)" style={{ flex: 'none' }} />
          </div>
        </CardShell>
      </main>

      {/* ── ALT MENÜYE AYRILAN YER ────────────────────────────────────────────
          BottomNav'ı App.tsx çizer ve `fixed` durur; bu boş blok onun altında
          kart kalmasını engeller. `pb-safe-nav` = güvenli alan + 7.5rem, yani
          projedeki standart alt menü payı. */}
      <div aria-hidden className="pb-safe-nav" style={{ flex: 'none' }} />
    </div>
  );
};

export default Dashboard;
