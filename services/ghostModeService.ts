// ════════════════════════════════════════════════════════════════════════════
// HAYALET MOD — oyuncu uygulaması tarafındaki İKİ küçük iş
// ════════════════════════════════════════════════════════════════════════════
//
// Hayalet mod (yöneticinin bir kullanıcıyı taklit ederek uygulamayı onun gözünden
// görmesi) panelde BAŞLAR, ama uygulamada AÇILIR: panel `app...?ghost=<id>`
// bağlantısını yeni sekmede açar, uygulama bu parametreyi görüp taklidi kurar.
//
// ── NEDEN AYRI DOSYA ───────────────────────────────────────────────────────
// Eskiden App.tsx bu iki iş için `admin-panel/services/adminService` modülünü
// (3400 satır) dinamik olarak import ediyordu. Tek bir bağlantı yüzünden panel
// kodu oyuncu uygulamasının paket grafiğine giriyordu. İhtiyaç duyulan iş ise
// yalnızca aşağıdaki iki fonksiyon kadar.
//
// ── GÜVENLİK ───────────────────────────────────────────────────────────────
// Buradaki hiçbir şey yetki VERMEZ; kapı sunucudadır:
//   • admin_log_impersonation → `is_platform_admin()` kapısından geçer.
//   • profiles okuması → RLS `profiles_select_own_or_admin`: bir kullanıcı
//     BAŞKASININ profilini yalnız yöneticiyse okuyabilir.
// Yani yönetici olmayan biri bu dosyayı çağırsa bile sunucudan veri ALAMAZ.
import { supabase } from '../supabaseClient';
import type { AdminUser, UserRole } from '../types';

/** Taklit girişimini denetim defterine yazar. Yönetici değilse sunucu reddeder. */
export async function taklidiKaydet(hedefKullaniciId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_log_impersonation', {
    p_target_user_id: hedefKullaniciId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Taklit edilecek kullanıcının profilini getirir.
 * Yetkisiz çağrıda RLS boş döndürür → `null`.
 */
export async function taklitProfiliGetir(kullaniciId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, name, email, avatar_url, role, match_count, is_verified, is_banned, created_at')
    .eq('id', kullaniciId)
    .maybeSingle();
  if (error || !data) return null;

  const satir = data as Record<string, unknown>;
  return {
    id: String(satir.id),
    name: (satir.full_name as string) || (satir.name as string) || 'Kullanıcı',
    email: (satir.email as string) ?? '',
    avatar: (satir.avatar_url as string) ?? '',
    role: ((satir.role as UserRole) ?? 'PLAYER') as UserRole,
    isVerified: satir.is_verified === true,
    isBanned: satir.is_banned === true,
    joinDate: (satir.created_at as string) ?? new Date().toISOString(),
    matchCount: Number(satir.match_count ?? 0),
  };
}
