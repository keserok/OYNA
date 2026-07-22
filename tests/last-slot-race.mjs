// OYNA — SON SLOT yarış durumu regresyon testi (SG-5).
//
// Amaç: join_public_match_slot'un FOR UPDATE satır kilidinin "son boş slota
// aynı anda 2 katılım" senaryosunda overbooking'i engellediğini kanıtlamak.
// (Kilit: join_public_match_slot__inner — 20260723000000000 baseline.)
//
// Senaryo:
//   1) oyuncu01 (SDK) 6 slotlu test maçı yaratır: 5 slot sentetik oyuncularla
//      TAKEN, yalnız 'last1' OPEN — yani gerçek bir "son slot" durumu.
//   2) oyuncu02 ve oyuncu03 AYNI 'last1' slotuna Promise.all ile EŞZAMANLI
//      join_public_match_slot çağırır.
//   3) Assert A: tam 1 başarı + 1 ret ('Bu slot zaten dolu!').
//   4) Assert B: DB'de 'last1' slotunda yalnız kazanan var; kaybeden kadroda,
//      deplasmanda ve yedeklerde HİÇ yok (çift yazım/overbooking yok).
//   5) Assert C: kazanan tüm listelerde tam 1 kez geçiyor (mükerrer kayıt yok).
//   6) Temizlik: maç CANCELLED yapılır (oyuncu01).
//
// ÇALIŞTIRMA (canlıya karşı — match-concurrency.mjs ile aynı düzen, shim gerekir):
//   NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/last-slot-race.mjs
// ÇALIŞTIRMA (lokal supabase stack — CI / db-race-gate.yml):
//   SMOKE_SB=http://127.0.0.1:54321 SMOKE_ANON=<lokal anon> \
//   SMOKE_SERVICE=<lokal service_role> node tests/last-slot-race.mjs
//   (SMOKE_SERVICE verilirse eksik demo hesaplar GoTrue admin API ile açılır.)

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SB = process.env.SMOKE_SB || 'http://localhost:54321';
const ANON = process.env.SMOKE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';
const SERVICE = process.env.SMOKE_SERVICE || ''; // yalnız lokal stack bootstrap'ı
const PASS = process.env.SMOKE_PASS || 'password123';

const TITLE = `SONSLOT YARIS ${Date.now().toString(36).toUpperCase()}`;
const results = [];
const assert = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
const mkClient = () => createClient(SB, ANON, { auth: { persistSession: false } });
const login = async (email) => {
  const c = mkClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`${email} login: ${error.message}`);
  return { c, email, session: data.session, uid: data.user.id };
};
// Lokal stack'te demo hesap yoksa (SMOKE_SERVICE verilmişse) GoTrue admin API
// ile oluştur — profiles satırını handle_new_user trigger'ı açar.
const ensureUser = async (email) => {
  try { return await login(email); } catch (e) {
    if (!SERVICE) throw e;
    const res = await fetch(`${SB}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASS, email_confirm: true }),
    });
    if (!res.ok && res.status !== 422) throw new Error(`admin create ${email}: ${res.status} ${await res.text()}`);
    return await login(email);
  }
};

// ── 1) Hesaplar + maç (oyuncu01) ────────────────────────────────────────────
const o1 = await ensureUser('oyuncu01@oyna.app');
const o2 = await ensureUser('oyuncu02@oyna.app');
const o3 = await ensureUser('oyuncu03@oyna.app');

// Bugün +2 saat (gün taşarsa yarın 21:00) — B8 zaman filtresine takılmasın.
const now = new Date();
let target = new Date(now.getTime() + 2 * 3600 * 1000);
if (target.getDate() !== now.getDate()) target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 21, 0);
const dateIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
const timeStr = `${String(target.getHours()).padStart(2, '0')}:00`; // tek saat (H-B1)

// Sentetik dolu slot: duplicate kontrolü player.id'yi UUID'e cast ettiği için
// geçerli rastgele UUID şart; test hesaplarının id'leriyle çakışmaz.
const takenSlot = (id, role, x, y) => ({
  id, role, x, y, status: 'TAKEN',
  player: { id: randomUUID(), name: `Dolgu ${id.toUpperCase()}`, avatar: 'https://i.pravatar.cc/150', rating: 4.5, position: role, x, y, paymentStatus: 'UNPAID' },
});
const slots = [
  takenSlot('f1', 'FWD', 50, 22),
  takenSlot('f2', 'MID', 28, 45),
  takenSlot('f3', 'MID', 72, 45),
  takenSlot('f4', 'DEF', 30, 68),
  takenSlot('f5', 'GK', 50, 86),
  { id: 'last1', role: 'DEF', x: 70, y: 68, status: 'OPEN' }, // SON boş slot
];

// Koordinatlı saha varsa bağla (canlı); lokal boş DB'de null kalır.
const { data: pitch } = await o1.c.from('pitches').select('id').not('latitude', 'is', null).limit(1).maybeSingle();
const { data: matchId, error: createErr } = await o1.c.rpc('player_create_match', {
  p_payload: {
    title: TITLE, location: TITLE, date: dateIso, time: timeStr,
    price: 0, difficulty: 'Rahat', status: 'ACTIVE', format: '4v4',
    // isDemo:false ŞART — matches SELECT RLS'i demo satırları gizleyebilir.
    minRating: 0, visibility: 'OPEN', creatorId: o1.uid, isDemo: false,
    pitch_id: pitch?.id || null,
    badges: [], missingPositions: [], slots, awaySlots: [], reservePlayers: [], chatMessages: [],
  },
});
if (createErr || !matchId) { console.error('Maç yaratılamadı:', createErr?.message); process.exit(1); }
console.log('Test maçı:', matchId, '|', TITLE);

const readMatch = async () => {
  const { data } = await o1.c.from('matches').select('slots, "awaySlots", "reservePlayers"').eq('id', matchId).single();
  return { slots: data?.slots || [], away: data?.awaySlots || [], reserve: data?.reservePlayers || [] };
};
// uid bir listede kaç kez geçiyor (slot.player.id VEYA yedeklerdeki düz id)
const countIn = (arr, uid) => arr.filter((s) => s?.player?.id === uid || s?.id === uid).length;

try {
  // ── 2) EŞZAMANLI: o2 ve o3 AYNI son slota ─────────────────────────────────
  const joinAs = (o) => o.c.rpc('join_public_match_slot', {
    p_match_id: matchId, p_slot_id: 'last1', p_user_id: o.uid, p_is_away: false,
  });
  const [r2, r3] = await Promise.all([joinAs(o2), joinAs(o3)]);
  const errs = [r2.error, r3.error].filter(Boolean);
  console.log('  o2:', r2.error ? `RET (${r2.error.message})` : 'BAŞARILI');
  console.log('  o3:', r3.error ? `RET (${r3.error.message})` : 'BAŞARILI');

  assert('A: tam 1 başarı + 1 ret', errs.length === 1, `ret=${errs.length}/2`);

  // ── 3) DB doğrulaması ─────────────────────────────────────────────────────
  const m = await readMatch();
  const winner = r2.error ? o3 : o2;
  const loser = r2.error ? o2 : o3;
  const lastSlot = m.slots.find((s) => s?.id === 'last1');

  const winnerTotal = countIn(m.slots, winner.uid) + countIn(m.away, winner.uid) + countIn(m.reserve, winner.uid);
  const loserTotal = countIn(m.slots, loser.uid) + countIn(m.away, loser.uid) + countIn(m.reserve, loser.uid);

  assert('B: son slotta yalnız kazanan var', lastSlot?.status === 'TAKEN' && lastSlot?.player?.id === winner.uid,
    `slot.player=${lastSlot?.player?.id?.slice(0, 8)} kazanan=${winner.uid.slice(0, 8)}`);
  assert('B2: kaybeden hiçbir listede yok (overbooking yok)', loserTotal === 0, `kaybeden sayısı=${loserTotal}`);
  assert('C: kazanan tam 1 kez kayıtlı (mükerrer yok)', winnerTotal === 1, `kazanan sayısı=${winnerTotal}`);
  assert('D: sentetik 5 slot bozulmadı', m.slots.filter((s) => s?.status === 'TAKEN').length === 6,
    `TAKEN=${m.slots.filter((s) => s?.status === 'TAKEN').length}/6`);
} finally {
  // ── 4) Temizlik ───────────────────────────────────────────────────────────
  const { error: cancelErr } = await o1.c.rpc('player_update_match', { p_match_id: matchId, p_payload: { status: 'CANCELLED' } });
  console.log('Temizlik:', cancelErr ? 'CANCELLED yapılamadı: ' + cancelErr.message : 'maç CANCELLED');
}

const failed = results.filter((r) => !r).length;
console.log(`\n=== SON SLOT YARIŞI: ${results.length - failed}/${results.length} geçti ===`);
process.exit(failed ? 1 : 0);
