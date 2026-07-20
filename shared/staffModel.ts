// ════════════════════════════════════════════════════════════════════════
// PERSONEL (STAFF) — saf yardımcılar (SSOT). UI ve servis katmanı bunları
// paylaşır; hepsi yan-etkisiz + birim-test edilebilir (Supabase bağımsız).
// ════════════════════════════════════════════════════════════════════════

/** RPC hataları 'KOD: Türkçe mesaj' fırlatır; Türkçe kısmı çıkarır, yoksa eşler. */
export function mapStaffError(err: unknown): string {
  const raw = (err as { message?: string })?.message || String(err ?? '');
  // 'INVALID_OR_EXPIRED: Kod geçersiz…' → ': ' sonrası Türkçe metin
  const m = raw.match(/:\s*(.+)$/);
  if (m && /[a-zçğıöşü]/i.test(m[1]) && m[1].trim().length > 3) return m[1].trim();
  if (/UNAUTHORIZED/.test(raw)) return 'Bu işlem için yetkiniz yok.';
  if (/ALREADY_MEMBER/.test(raw)) return 'Bu sahada zaten kayıtlısınız.';
  if (/ALREADY_ACTIVE/.test(raw)) return 'Bu personelin girişi zaten aktif.';
  if (/INVALID_OR_EXPIRED|INVALID_CODE/.test(raw)) return 'Kod geçersiz veya süresi dolmuş.';
  if (/OWNER_CANNOT_JOIN/.test(raw)) return 'Kendi sahanıza personel olamazsınız.';
  if (/LIMIT_REACHED/.test(raw)) return 'Ekip kaydı üst sınırına ulaşıldı.';
  if (/NAME_REQUIRED/.test(raw)) return 'İsim gerekli.';
  if (/network|fetch|Failed/i.test(raw)) return 'Bağlantı sorunu. Tekrar deneyin.';
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}

/** Davet kodu son kullanma → "36 saat geçerli" gibi kalan-süre metni.
 *  `now` enjekte edilebilir (test + determinizm). */
export function expiryText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ms = t - now;
  if (ms <= 0) return 'süresi doldu';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} gün ${h % 24} saat geçerli`;
  if (h >= 1) return `${h} saat geçerli`;
  return `${Math.max(1, Math.floor(ms / 60_000))} dk geçerli`;
}

/** 6 haneli davet kodunu normalize et (rakam-dışı temizle, 6 haneye kırp). */
export function normalizeInviteCode(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, 6);
}
