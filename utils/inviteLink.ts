// inviteLink.ts — Maç daveti / "arkadaşını indirmeye çağır" bağlantısı + paylaşım
//
// Kaptan bir maç kurunca (saha vitrini → "Maç Oluştur" ya da klasik maç akışı),
// lobiden arkadaşlarını davet eder. Davet bağlantısı, uygulamayı AÇAR (kuruluysa
// evrensel bağlantı ile) ya da uygulamayı olmayanları web/indirme akışına düşürür;
// her iki durumda da doğru maça yönlendirir (App.tsx ?match= yönlendirmesi).

// İzin verilen hedef origin'ler — davet bağlantısı yalnızca bu köklere kurulur.
// (ghostDeepLink ile aynı allowlist; bilinmeyen VITE_APP_URL ile açık yönlendirme
//  saldırısı engellenir.)
const ALLOWED_BASE_ORIGINS = [
  'https://app.oyna.com',
  'https://oyna.com',
  'https://www.oyna.com',
];

/** Davet bağlantısının kök origin'ini çöz (VITE_APP_URL allowlist'te ise onu, değilse window.origin). */
export function resolveAppBase(): string {
  const envUrl = import.meta.env.VITE_APP_URL as string | undefined;
  if (envUrl) {
    try {
      const origin = new URL(envUrl).origin;
      if (ALLOWED_BASE_ORIGINS.includes(origin)) return origin;
    } catch {
      /* geçersiz format — window.origin'e düş */
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace('/admin.html', '');
  }
  return ALLOWED_BASE_ORIGINS[0];
}

/**
 * Maça özel evrensel davet bağlantısı: `${base}/?match=<id>[&join=<code>]`.
 * Sorgu-parametre biçimi bilinçli tercih — SPA açılışta okur (ghost ile aynı desen),
 * sunucu tarafı path rewrite'ına gerek kalmaz.
 */
export function buildMatchInviteUrl(matchId: string, joinCode?: string): string {
  const base = resolveAppBase();
  const params = new URLSearchParams({ match: matchId });
  if (joinCode) params.set('join', joinCode);
  return `${base}/?${params.toString()}`;
}

export interface MatchInviteInfo {
  matchId: string;
  matchTitle?: string;
  pitchName?: string;
  dateLabel?: string;
  timeLabel?: string;
  /** Özel maç katılım kodu (varsa mesaja ve bağlantıya eklenir). */
  joinCode?: string;
  /** Kişi başı ücret (₺) — "herkes payını öder" vurgusu için. */
  costPerPerson?: number;
}

/** Davet mesajının gövdesi (bağlantı HARİÇ) — native paylaşımda url ayrı alanda gider. */
function buildInviteBody(info: MatchInviteInfo): string {
  const lines: string[] = ['⚽ OYNA — maçıma katıl!', ''];
  if (info.matchTitle) lines.push(`🏟️ ${info.matchTitle}`);
  if (info.pitchName) lines.push(`📍 ${info.pitchName}`);
  const when = [info.dateLabel, info.timeLabel].filter(Boolean).join(' · ');
  if (when) lines.push(`🗓️ ${when}`);
  if (typeof info.costPerPerson === 'number' && info.costPerPerson > 0) {
    lines.push(`💸 Kişi başı ₺${info.costPerPerson} — herkes kendi payını öder`);
  }
  if (info.joinCode) lines.push(`🔑 Katılım kodu: ${info.joinCode}`);
  lines.push('', 'Uygulamayı indir, kadrodaki yerini kap ve payını öde 👇');
  return lines.join('\n');
}

/** Panoya/klasik paylaşıma uygun TAM mesaj (gövde + bağlantı). */
export function buildInviteMessage(info: MatchInviteInfo): string {
  return `${buildInviteBody(info)}\n${buildMatchInviteUrl(info.matchId, info.joinCode)}`;
}

export type ShareResult = 'shared' | 'copied' | 'failed';

// Web Share API / Clipboard — DOM lib sürümünden bağımsız, yalnız kullandığımız
// alanları içeren minimal tip (navigator.share her ortamda tanımlı değildir).
interface WebShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

/**
 * Daveti paylaş: önce yerel paylaşım sayfası (Web Share API — mobil/Capacitor
 * webview + destekleyen tarayıcılar), yoksa panoya kopyala. Sonucu döndürür ki
 * çağıran uygun toast'ı göstersin.
 */
export async function shareMatchInvite(info: MatchInviteInfo): Promise<ShareResult> {
  const body = buildInviteBody(info);
  const url = buildMatchInviteUrl(info.matchId, info.joinCode);
  const title = info.matchTitle || info.pitchName || 'OYNA Maç Daveti';
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as WebShareNavigator) : undefined;

  // 1) Native paylaşım sayfası — text (gövde) + url ayrı gider; url tekrarı olmaz.
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, text: body, url });
      return 'shared';
    } catch (e) {
      // Kullanıcı iptal ettiyse zorlama yok — paylaşım sayfası açıldı, iş bitti.
      if ((e as { name?: string })?.name === 'AbortError') return 'shared';
      // Diğer hatalar → panoya düş.
    }
  }

  // 2) Panoya kopyala (fallback) — tam mesaj (gövde + bağlantı).
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(`${body}\n${url}`);
      return 'copied';
    } catch {
      /* pano da başarısız — aşağıda failed döner */
    }
  }

  return 'failed';
}
