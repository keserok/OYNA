// ─── Demo hesap kataloğu — kaynak: docs/OYNA_DEMO_HESAPLARI.md ───────────────
// Bu modül, `docs/OYNA_DEMO_HESAPLARI.md` dosyasını ham metin olarak
// (`?raw`) içe aktarıp içindeki hesap tablolarını ayrıştırır. Böylece demo hesap
// listesinin TEK KAYNAĞI o Markdown dosyasıdır: satır ekl/çıkar → giriş
// ekranındaki demo seçici otomatik güncellenir (aynı e-posta Supabase Auth'ta da
// mevcut olmak kaydıyla). Ayrıştırıcı sözleşmesi md dosyasında belgelidir:
//   | Rol | E-posta | İsim | Açıklama |
// ÜRETİM PAKETİNE GİRMEZ (17 Ağu 2026 — mağaza öncesi denetim).
//
// SORUN: bu dosya demo hesap kataloğunu `?raw` ile içe aktarıyordu; katalog
// GERÇEK üretim hesaplarının e-postalarını (saha1..4 = SAHA SAHİBİ rolü) ve
// ORTAK ŞİFREYİ taşıyor. Statik içe aktarma, mağaza paketinin JS'ine harfi
// harfine gömülüyordu — paketi açan herkes bu kimlikleri okuyup web/API
// üzerinden gerçek hesaplara girebilirdi. Arayüzdeki native kapı bunu
// KAPATMAZ; kimlik pakette olduğu sürece açık kalır.
//
// ÇÖZÜM: katalog yalnız AÇIKÇA `VITE_DEMO_ACCOUNTS=true` ile derlenen
// geliştirici paketlerine girer. Sabit derleme zamanında değişmez bir değere
// indiği için, üretim derlemesinde aşağıdaki koşul `false` olur ve toplayıcı
// (Rollup) hem katalogu hem ayrıştırıcıyı ölü kod olarak ATAR.
// İNCELEME İSTİSNASI KALDIRILDI (21 Ağu 2026 — Apple 5.6 reddi): mağaza
// paketine demo kataloğu GİRMEZ. Tek kapı geliştirme bayrağıdır.
const KATALOG_PAKETE_GIRSIN = import.meta.env.VITE_DEMO_ACCOUNTS === 'true';

// Not: glob, statik `import ... from` gibi koşulsuz gömme yapmaz; `eager`
// olsa bile yukarıdaki sabit false iken erişilen hiçbir yer kalmadığından
// içerik üretim çıktısına taşınmaz.
const rosterModulleri = import.meta.glob('../docs/OYNA_DEMO_HESAPLARI.md', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const rosterMd: string = KATALOG_PAKETE_GIRSIN
  ? (Object.values(rosterModulleri)[0] ?? '')
  : '';

export type DemoRole = 'PLAYER' | 'OWNER' | 'GOALKEEPER' | 'REFEREE';

export interface DemoAccount {
  email: string;
  name: string;
  role: DemoRole;
  note: string;
  /** Ortak demo şifresi — YALNIZ katalog pakete girdiğinde dolar (üretimde boş). */
  password: string;
}

const DEMO_DOMAIN = '@oyna.app';
const VALID_ROLES: DemoRole[] = ['PLAYER', 'OWNER', 'GOALKEEPER', 'REFEREE'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** md'deki "Ortak şifre" satırından paylaşılan şifreyi çıkarır. */
function parsePassword(md: string): string {
  const line = md.split('\n').find((l) => /ortak şifre/i.test(l));
  const m = line?.match(/`([^`]+)`/);
  // Yedek sabit KALDIRILDI: üretim paketine gömülen bir şifre, demo hesap
  // e-postalarıyla birlikte gerçek hesaplara giriş anahtarına dönüşüyordu.
  // Katalog yoksa boş döner; demo yolları zaten kapalıdır.
  return (m?.[1] ?? '').trim();
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

/** md dosyasından ayrıştırılan tüm demo hesapları (giriş ekranı seçicisinin kaynağı). */
export const DEMO_ACCOUNTS: DemoAccount[] = parseAccounts(rosterMd);

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

/** Rol bazında gruplanmış demo hesaplar (boş gruplar atlanır). */
export const DEMO_ACCOUNT_GROUPS: DemoRoleGroup[] = VALID_ROLES
  .map((role) => ({
    role,
    label: ROLE_META[role].label,
    color: ROLE_META[role].color,
    accounts: DEMO_ACCOUNTS.filter((a) => a.role === role),
  }))
  .filter((g) => g.accounts.length > 0);
