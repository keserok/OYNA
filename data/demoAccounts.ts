// ─── Demo hesap kataloğu — kaynak: docs/OYNA_DEMO_HESAPLARI.md ───────────────
// Bu modül, `docs/OYNA_DEMO_HESAPLARI.md` dosyasını ham metin olarak
// (`?raw`) içe aktarıp içindeki hesap tablolarını ayrıştırır. Böylece demo hesap
// listesinin TEK KAYNAĞI o Markdown dosyasıdır: satır ekl/çıkar → giriş
// ekranındaki demo seçici otomatik güncellenir (aynı e-posta Supabase Auth'ta da
// mevcut olmak kaydıyla). Ayrıştırıcı sözleşmesi md dosyasında belgelidir:
//   | Rol | E-posta | İsim | Açıklama |
// Denetim bulgusu 1: md dosyası (adlar + ortak şifre) SABİT import edilmez —
// yalnız VITE_DEMO_ACCOUNTS='true' iken aşağıdaki dinamik import ile yüklenir;
// bayrak kapalı build'de bu dal derlemede ölü koda dönüşüp paketten düşer.

export type DemoRole = 'PLAYER' | 'OWNER' | 'GOALKEEPER' | 'REFEREE';

export interface DemoAccount {
  email: string;
  name: string;
  role: DemoRole;
  note: string;
  /** Ortak demo şifresi (md'den okunur, yedeği 'password123'). */
  password: string;
}

const DEMO_DOMAIN = '@oyna.app';
const VALID_ROLES: DemoRole[] = ['PLAYER', 'OWNER', 'GOALKEEPER', 'REFEREE'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** md'deki "Ortak şifre" satırından paylaşılan şifreyi çıkarır. */
function parsePassword(md: string): string {
  const line = md.split('\n').find((l) => /ortak şifre/i.test(l));
  const m = line?.match(/`([^`]+)`/);
  return (m?.[1] ?? '').trim() || 'password123';
}

/** "| a | b | c |" biçimli bir satırı hücrelere böler (baş/son boşları atar). */
function splitRow(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => !(c === '' && (i === 0 || i === arr.length - 1)));
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function normalizeRole(raw: string): DemoRole {
  const up = raw.trim().toUpperCase();
  return (VALID_ROLES as string[]).includes(up) ? (up as DemoRole) : 'PLAYER';
}

/** md metnindeki tüm hesap tablolarını tek listede ayrıştırır. */
function parseAccounts(md: string): DemoAccount[] {
  const password = parsePassword(md);
  const out: DemoAccount[] = [];
  const seen = new Set<string>();

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 3 || isSeparator(cells)) continue;

    // E-posta hücresini bul (başlık/başka satırlar böylece elenir).
    const ei = cells.findIndex((c) => EMAIL_RE.test(c) && c.toLowerCase().endsWith(DEMO_DOMAIN));
    if (ei === -1) continue;

    const email = cells[ei].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const role = normalizeRole(ei > 0 ? cells[0] : 'PLAYER');
    const name = cells[ei + 1] ?? email.split('@')[0];
    const note = cells[ei + 2] ?? '';
    out.push({ email, name, role, note, password });
  }

  return out;
}



/** UI gruplaması: rol → başlık/renk/aksan. Sıra listede görüneceği sıradır. */
export interface DemoRoleGroup {
  role: DemoRole;
  label: string;
  color: string;
  accounts: DemoAccount[];
}

const ROLE_META: Record<DemoRole, { label: string; color: string }> = {
  PLAYER: { label: 'Oyuncular', color: '#FACC15' },
  OWNER: { label: 'Saha Sahipleri', color: '#3388FF' },
  GOALKEEPER: { label: 'Kaleciler', color: '#39FF14' },
  REFEREE: { label: 'Hakemler', color: '#FF3333' },
};

/** Rol bazında gruplanmış demo hesaplar — YALNIZ bayrak açıkken yüklenir. */
export async function loadDemoAccountGroups(): Promise<DemoRoleGroup[]> {
  if (import.meta.env.VITE_DEMO_ACCOUNTS !== 'true') return [];
  const { default: rosterMd } = await import('../docs/OYNA_DEMO_HESAPLARI.md?raw');
  const accounts = parseAccounts(rosterMd);
  return VALID_ROLES
    .map((role) => ({
      role,
      label: ROLE_META[role].label,
      color: ROLE_META[role].color,
      accounts: accounts.filter((a) => a.role === role),
    }))
    .filter((g) => g.accounts.length > 0);
}
