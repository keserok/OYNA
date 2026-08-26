import { supabase } from '../../supabaseClient';
import { auth } from '../../supabaseAuth';
import {
  classifyOutboxError, parseOutbox, serializeOutbox,
  OUTBOX_MAX_ITEMS, type OutboxItem, type OutboxOpType,
} from '../../shared/outboxModel';

// ════════════════════════════════════════════════════════════════════════
// P-OFFLINE — OUTBOX ÇALIŞMA ZAMANI (kasa kesintisiz)
// ------------------------------------------------------------------------
// Akış: işlem ÖNCE normal denenir; ağ hatasında kuyruğa yazılır ve çağırana
// {queued:true} döner (UI "bağlantı gelince işlenecek" gösterir). 'online'
// olayı / periyodik tetik / görünürlük değişimi kuyruğu FIFO boşaltır.
// Sunucu idempotent (client_request_id) → tekrar gönderim çift kayıt üretmez;
// yarıda kalan istek de güvenlidir (aynı id ile yeniden gönderilir).
// Kalıcı hatada (yetki/validasyon) öğe kuyruğdan düşer ve bildirilir —
// para işleminde sonsuz sessiz tekrar YOK.
// ════════════════════════════════════════════════════════════════════════

// KUYRUK KULLANICIYA BAĞLI (26 Ağu 2026). Eski tek anahtar 'oyna_owner_outbox_v1'
// uid içermiyordu: personel A'nın çevrimdışı aldığı nakit, cihazı sonra açan
// personel B'nin OTURUMUYLA sunucuya gidiyor ve B'nin üzerine kaydoluyordu.
// Anahtar artık uid'li; oturum yokken kuyruk OKUNMAZ ve YAZILMAZ.
const STORAGE_KEY_BASE = 'oyna_owner_outbox_v1';
const aktifUid = (): string | null => auth.currentUser?.uid ?? null;
const storageKey = (): string | null => {
  const uid = aktifUid();
  return uid ? `${STORAGE_KEY_BASE}.${uid}` : null;
};

/** Eski uid'siz anahtarda kalan kuyruk KİMSENİN oturumuyla gönderilmez —
 *  kime ait olduğu bilinemez. Karantinaya taşınır (veri silinmez; para izi
 *  gerekirse elle sunucu kayıtlarıyla karşılaştırılır). */
function eskiKuyruguKarantinayaAl(): void {
  if (typeof window === 'undefined') return;
  try {
    const eski = localStorage.getItem(STORAGE_KEY_BASE);
    if (eski === null) return;
    const karantina = `${STORAGE_KEY_BASE}.sahipsiz`;
    // Karantina doluysa ÜZERİNE YAZMA da SİLME de yok — iki liste BİRLEŞİR
    // (eski paketli açık bir sekme base anahtarı yeniden doldurabilir; para
    // kaydı hiçbir dalda kaybolmaz).
    const birlesik = [
      ...parseOutbox(localStorage.getItem(karantina)),
      ...parseOutbox(eski),
    ];
    localStorage.setItem(karantina, serializeOutbox(birlesik));
    localStorage.removeItem(STORAGE_KEY_BASE);
    console.warn('[Outbox] Eski uid\'siz kuyruk karantinaya taşındı (gönderilmeyecek):', karantina);
  } catch { /* depo erişilemedi — sonraki açılışta yeniden denenir */ }
}

type Listener = (items: OutboxItem[]) => void;
const listeners = new Set<Listener>();

/** Kalıcı hatayla düşen işlemler için tek seferlik bildirim kancası. */
type DropNotifier = (item: OutboxItem, error: string) => void;
let dropNotifier: DropNotifier | null = null;
export function setOutboxDropNotifier(fn: DropNotifier | null) { dropNotifier = fn; }

function readQueue(): OutboxItem[] {
  if (typeof window === 'undefined') return [];
  const key = storageKey();
  if (!key) return [];
  try { return parseOutbox(localStorage.getItem(key)); } catch { return []; }
}

function writeQueue(items: OutboxItem[]) {
  if (typeof window === 'undefined') return;
  const key = storageKey();
  if (!key) return;
  try { localStorage.setItem(key, serializeOutbox(items)); } catch { /* dolu/kapalı → kuyruk RAM'de kalır */ }
  listeners.forEach((l) => { try { l(items); } catch { /* dinleyici hatası akışı bozmasın */ } });
}

export function getOutboxItems(): OutboxItem[] { return readQueue(); }
export function getOutboxCount(): number { return readQueue().length; }

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  fn(readQueue());
  return () => { listeners.delete(fn); };
}

// ── Op yürütücüleri — her tür TEK RPC'ye, client_request_id İLE gider ───────
async function executeOp(item: OutboxItem): Promise<void> {
  if (item.type === 'RECORD_PAYMENT') {
    const { error } = await supabase.rpc('staff_record_payment', {
      p_booking_id: item.payload.bookingId,
      p_amount: item.payload.amount,
      p_method: item.payload.method,
      p_note: item.payload.note ?? null,
      p_client_request_id: item.id,
    });
    if (error) throw error;
    return;
  }
  if (item.type === 'DEBTOR_PAYMENT') {
    const { error } = await supabase.rpc('debtor_add_payment', {
      p_debtor_id: item.payload.debtorId,
      p_amount: item.payload.amount,
      p_method: item.payload.method,
      p_note: item.payload.note ?? null,
      p_client_request_id: item.id,
    });
    if (error) throw error;
    return;
  }
  throw new Error(`Bilinmeyen outbox op: ${(item as OutboxItem).type}`);
}

/**
 * İşlemi hemen dene; ağ yoksa kuyruğa al.
 * Dönüş: {queued:false} = sunucuda işlendi · {queued:true} = kuyruğa alındı.
 * Kalıcı sunucu hatası (OVER_PAYMENT, UNAUTHORIZED…) AYNEN fırlatılır.
 */
export async function enqueueOrRun(
  type: OutboxOpType,
  payload: Record<string, unknown>,
  label: string,
): Promise<{ queued: boolean }> {
  const item: OutboxItem = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type, payload, label,
    createdAt: new Date().toISOString(),
    tries: 0,
    ownerUid: aktifUid() ?? undefined,
  };
  try {
    await executeOp(item);
    return { queued: false };
  } catch (err) {
    if (classifyOutboxError(err) === 'NETWORK') {
      // Oturum yokken kuyruk YAZILAMAZ; "kuyruğa alındı" yalanı söylemek
      // yerine dürüst hata fırlat — para kaydı hiçbir yerde tutulmayacaktı.
      if (!storageKey()) throw new Error('Oturum doğrulanamadı — işlem KAYDEDİLMEDİ. Yeniden giriş yapıp tekrar dene.');
      const q = readQueue();
      if (q.length >= OUTBOX_MAX_ITEMS) throw new Error('Bekleyen işlem kuyruğu dolu. Bağlantıyı düzeltin.');
      item.tries = 1;
      item.lastError = String((err as Error)?.message ?? err);
      writeQueue([...q, item]);
      scheduleFlushSoon();
      return { queued: true };
    }
    throw err;
  }
}

// ── Flush — FIFO, tek uçuş (eşzamanlı iki flush çift-hız tekrar üretmesin) ──
let flushing = false;
export async function flushOutbox(): Promise<{ sent: number; dropped: number; remaining: number }> {
  if (flushing) return { sent: 0, dropped: 0, remaining: getOutboxCount() };
  flushing = true;
  let sent = 0; let dropped = 0;
  try {
    // Sıra korunur: baştaki başarısız (ağ) olursa dur — arkadakiler de bekler.
    for (;;) {
      const q = readQueue();
      const head = q[0];
      if (!head) break;
      // İkinci kemer: öğe başka kullanıcıya aitse GÖNDERME ve DÜŞÜRME —
      // kuyruk yerinde kalır, sahibi girince gönderilir. (uid'li anahtar
      // sayesinde normalde bu dala düşülmez; eski/elle taşınmış veri içindir.)
      if (head.ownerUid && head.ownerUid !== aktifUid()) break;
      try {
        await executeOp(head);
        sent += 1;
        writeQueue(readQueue().filter((it) => it.id !== head.id));
      } catch (err) {
        if (classifyOutboxError(err) === 'NETWORK') {
          const bumped = readQueue().map((it) =>
            it.id === head.id ? { ...it, tries: it.tries + 1, lastError: String((err as Error)?.message ?? err) } : it);
          writeQueue(bumped);
          break; // hâlâ çevrimdışı — sırayı bozma
        }
        // Kalıcı hata: öğeyi düşür + bildir (sonsuz tekrar yok; para izi sunucuda).
        dropped += 1;
        writeQueue(readQueue().filter((it) => it.id !== head.id));
        try { dropNotifier?.(head, String((err as Error)?.message ?? err)); } catch { /* yoksay */ }
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, dropped, remaining: getOutboxCount() };
}

// ── Otomatik tetikler ───────────────────────────────────────────────────────
let installed = false;
let timer: ReturnType<typeof setInterval> | null = null;

function scheduleFlushSoon() {
  // Kuyruk doluyken 20 sn'de bir dene (online olayı gelmeyen yarı-kopuk ağlar).
  if (timer || typeof window === 'undefined') return;
  timer = setInterval(() => {
    if (getOutboxCount() === 0) { if (timer) clearInterval(timer); timer = null; return; }
    void flushOutbox();
  }, 20_000);
}

/** Uygulama açılışında bir kez kur: online/görünürlük tetikleri + kalan kuyruk. */
export function installOutboxAutoFlush() {
  if (typeof window === 'undefined') return;
  eskiKuyruguKarantinayaAl();
  if (!installed) {
    installed = true;
    window.addEventListener('online', () => { void flushOutbox(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && getOutboxCount() > 0) void flushOutbox();
    });
  }
  // Açılış tekmesi HER panel girişinde çalışır ('installed' tekilliği yalnız
  // dinleyiciler içindir): kuyruk uid'li olduğundan, kuyruğu bekleyen kullanıcı
  // aynı cihazda yeniden giriş yaptığında bekleyen para kayıtları ilk fırsatta
  // gönderilmeli — 'online' olayı o sırada gelmeyebilir (26 Ağu inceleme).
  if (getOutboxCount() > 0) { scheduleFlushSoon(); void flushOutbox(); }
}
