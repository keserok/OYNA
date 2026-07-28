import { supabase } from '../supabaseClient';

// ════════════════════════════════════════════════════════════════════════════
// Maç escrow yaşam-döngüsü servis sarmalayıcıları (20260716000001 migration).
//   blockMatchDeposit  → kaptan kaporayı BLOKE eder, maç ACTIVE olur,
//                         ertelenmiş kaleci/hakem talepleri gönderilir.
//   checkMatchThreshold→ eşik (toplam−2) dolunca maçı LIVE yapar + kaporayı capture eder.
//   cancelMatchByCaptain → 24s kuralı + no-show politikası.
//   adminMatchDepositAction → admin panel TAM YETKİ (CAPTURE|VOID|REFUND).
//
// Eşik artık sunucu tetikleyicisiyle de yakalanır (20260716000003) — checkMatchThreshold
//   istemci çağrısı yedek/idempotent'tir.
// ⚠️ FIXME [IYZICO-TODO / go-live]: RPC'ler SIMULATION'da DB durumunu değiştirir. Gerçek
//   iyzico kart işlemleri için `capture-payment` / `void-payment` / `refund-payment` edge
//   function'ları HAZIR; yalnız sistem bağlamından (PAYMENT_EDGE_SECRET) çağrılmalı — bu
//   sarmalayıcılar tarayıcıdan edge'i ÇAĞIRMAZ (secret sızmasın; admin_refund_intent kalıbı).
//   Prod'a almadan staging/Pro-branch'te SIMULATION ile uçtan uca test edin.
// ════════════════════════════════════════════════════════════════════════════

export type ProviderKind = 'GK' | 'REF';
/** Aktivasyonda gönderilecek teklif seçimi: belirli sağlayıcılar veya "tümüne". */
export interface DeferredProvider { type: ProviderKind; providerIds: string[]; all: boolean }

/** Kaptan kaporayı bloke eder (çekilmez) → maç ACTIVE + sağlayıcı talepleri gönderilir. */
export const blockMatchDeposit = async (
  matchId: string,
  amount: number,
  providers: DeferredProvider[] = [],
): Promise<{ ok: boolean; intent_id?: string; deposit_status?: string; min_players?: number }> => {
  const { data, error } = await supabase.rpc('match_block_deposit', {
    p_match_id: matchId,
    p_amount: amount,
    p_providers: providers,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};

/**
 * Ertelenmiş kaleci/hakem tekliflerini KAPORA OLMADAN gönderir.
 *
 * Kaporalı akışta bu iş sunucuda `match_block_deposit` içinde yapılır: seçimler
 * `deferred_providers` alanına yazılır ve oradaki döngü teklifleri dağıtır.
 * Kaporasız maçta (ücretsiz/fiyatsız saha) ödeme ekranı hiç açılmadığı için o
 * döngüye HİÇ girilmiyordu — kullanıcı "hakem çağırdım" sanıyor, sunucuda tek
 * bir talep bile oluşmuyordu. Burada aynı döngü istemciden koşturulur.
 *
 * Yetki sunucuda: `send_match_service_offers` yalnız maçı kuran kaptana (veya
 * admin'e) izin verir. Tek bir tipin başarısız olması diğerini engellemesin
 * diye hatalar sunucudaki `RAISE WARNING` davranışıyla aynı şekilde yutulur.
 */
export const sendDeferredProviderOffers = async (
  matchId: string,
  providers: DeferredProvider[],
): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;
  for (const prov of providers) {
    if (prov.type !== 'GK' && prov.type !== 'REF') continue;
    // all=true → sunucu uygun tüm sağlayıcıları kendi bulur (p_provider_ids NULL).
    const ids = prov.all ? null : (prov.providerIds ?? []);
    if (ids !== null && ids.length === 0) continue;
    try {
      const { error } = await supabase.rpc('send_match_service_offers', {
        p_match_id: matchId,
        p_provider_type: prov.type,
        p_provider_ids: ids,
      });
      if (error) throw error;
      sent += 1;
    } catch (err) {
      console.error('sendDeferredProviderOffers:', prov.type, err);
      failed += 1;
    }
  }
  return { sent, failed };
};

/** Katılım/ayrılış sonrası eşiği kontrol eder; dolduysa maç LIVE + kapora capture. */
export const checkMatchThreshold = async (
  matchId: string,
): Promise<{ live: boolean; filled: number; min_players: number; total: number }> => {
  const { data, error } = await supabase.rpc('match_check_threshold', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? { live: false, filled: 0, min_players: 0, total: 0 }) as any;
};

/** Kaptan maçı iptal eder — 24s kuralı: ≥24s iade (komisyon hariç) / <24s no-show. */
export const cancelMatchByCaptain = async (matchId: string): Promise<{ ok: boolean; outcome?: string }> => {
  const { data, error } = await supabase.rpc('match_cancel_by_captain', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};

/** ADMIN — tam yetkiyle kapora işlemi (CAPTURE | VOID | REFUND). */
export const adminMatchDepositAction = async (
  matchId: string,
  action: 'CAPTURE' | 'VOID' | 'REFUND',
  reason?: string,
): Promise<{ ok: boolean; deposit_status?: string }> => {
  const { data, error } = await supabase.rpc('admin_match_deposit_action', {
    p_match_id: matchId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};
