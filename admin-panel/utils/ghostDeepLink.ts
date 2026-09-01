// ghostDeepLink.ts — Godview → Consumer App Ghost Mode URL oluşturucu

// İzin verilen hedef origin'ler — Ghost Mode bağlantısı yalnızca bu köklere oluşturulur.
// Bilinmeyen bir VITE_APP_URL değeri ile açık yönlendirme (open redirect) saldırısı engellenir.
const ALLOWED_BASE_ORIGINS = [
  'https://app.oyna.com',
  'https://oyna.com',
  'https://www.oyna.com',
];

function resolveGhostBase(): string {
  const envUrl = import.meta.env.VITE_APP_URL as string | undefined;
  if (envUrl) {
    try {
      const origin = new URL(envUrl).origin;
      if (ALLOWED_BASE_ORIGINS.includes(origin)) return origin;
      console.warn('[GhostDeepLink] VITE_APP_URL izin listesinde değil, window.origin kullanılıyor.');
    } catch {
      console.warn('[GhostDeepLink] VITE_APP_URL geçersiz URL formatı.');
    }
  }
  // Fallback: admin.html path'ini temizle
  return window.location.origin.replace('/admin.html', '');
}

/** Standalone Godview → consumer app ghost mode deep link */
export function buildGhostDeepLink(userId: string, userName?: string): string {
  const base = resolveGhostBase();
  const params = new URLSearchParams({
    ghost: userId,
    ...(userName ? { name: userName } : {}),
  });
  return `${base}/?${params.toString()}`;
}

export function openGhostInConsumerApp(userId: string, userName?: string): void {
  const url = buildGhostDeepLink(userId, userName);
  window.open(url, '_blank', 'noopener,noreferrer');
}
