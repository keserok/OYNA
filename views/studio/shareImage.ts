// Taktik paylaşım görseli — KÜTÜPHANESİZ SVG→PNG.
// Taktiği kendi-kendine yeten bir SVG "maç günü kartı"na çizer, sonra
// <canvas> üzerinden PNG Blob üretir. foreignObject/dış görsel YOK →
// canvas tainting olmaz; dış font gömülmez (sistem yazı tipi yığını).
import type { TacticState, Slot } from './types';
import { trUpper } from '../../utils/trUpper';
import { dosyaKaydetVeyaPaylas, type KaydetSonucu } from '../../utils/dosyaKaydet';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,Roboto,sans-serif";

// Kart ölçüleri (portre — story/indirme dostu)
const W = 1000;
const HEADER_H = 300;
const PITCH_PAD = 44;
const PITCH_X = PITCH_PAD;
const PITCH_W = W - PITCH_PAD * 2;                 // 912
const PITCH_H = Math.round((PITCH_W * 4) / 3);     // 1216 (3:4)
const PITCH_Y = HEADER_H + PITCH_PAD;
const FOOTER_H = 250;
const H = PITCH_Y + PITCH_H + PITCH_PAD + FOOTER_H;

const TOKEN_R = 40;
const OPP_R = 34;

// XML kaçışı (metin enjeksiyonu/parse hatası olmasın)
const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Saha yüzdesi (0-100) → kart koordinatı
const cxOf = (x: number) => PITCH_X + (x / 100) * PITCH_W;
const cyOf = (y: number) => PITCH_Y + (y / 100) * PITCH_H;

// Saha çizgileri — gerçek tahtanın 600x1000 viewBox'ını sahaya ölçekler
const mx = (v: number) => PITCH_X + (v / 600) * PITCH_W;
const my = (v: number) => PITCH_Y + (v / 1000) * PITCH_H;

const IDENTITY: Record<string, { label: string; color: string }> = {
  HIGH_PRESS: { label: 'ÖNDE BASKI', color: '#ef4444' },
  PARK_BUS: { label: 'KATI SAVUNMA', color: '#3b82f6' },
  COUNTER_ATTACK: { label: 'KONTRA ATAK', color: '#eab308' },
  BALANCED: { label: 'DENGELİ', color: '#ffffff' },
};

function pitchMarkings(): string {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const rect = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return `<g stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.28">
    ${rect(mx(10), my(10), mx(590) - mx(10), my(990) - my(10))}
    ${line(mx(10), my(500), mx(590), my(500))}
    <ellipse cx="${mx(300)}" cy="${my(500)}" rx="${mx(380) - mx(300)}" ry="${my(580) - my(500)}"/>
    ${rect(mx(150), my(10), mx(450) - mx(150), my(170) - my(10))}
    ${rect(mx(150), my(830), mx(450) - mx(150), my(990) - my(830))}
    <circle cx="${mx(300)}" cy="${my(500)}" r="4" fill="#ffffff" stroke="none"/>
    <circle cx="${mx(300)}" cy="${my(130)}" r="4" fill="#ffffff" stroke="none"/>
    <circle cx="${mx(300)}" cy="${my(870)}" r="4" fill="#ffffff" stroke="none"/>
  </g>`;
}

function tokenSvg(slot: Slot, captainId: string | null | undefined): string {
  const cx = cxOf(slot.x);
  const cy = cyOf(slot.y);
  const isGK = slot.role === 'GK';
  if (!slot.player) {
    return `<circle cx="${cx}" cy="${cy}" r="${TOKEN_R}" fill="rgba(0,0,0,0.28)" stroke="${isGK ? 'rgba(249,115,22,0.55)' : 'rgba(57,255,20,0.5)'}" stroke-width="3" stroke-dasharray="7 7"/>`;
  }
  const fill = isGK ? '#f97316' : '#141a24';
  const stroke = isGK ? '#fdba74' : 'rgba(255,255,255,0.4)';
  const initial = esc(trUpper((slot.player.name || '?').charAt(0)));
  const name = esc(slot.player.name || '');
  const nameW = Math.min(PITCH_W - 24, name.length * 15 + 26);
  const labelY = cy + TOKEN_R + 36;
  const cap = captainId && slot.player.id === captainId
    ? `<circle cx="${cx + TOKEN_R * 0.72}" cy="${cy - TOKEN_R * 0.72}" r="15" fill="#fbbf24" stroke="#161B22" stroke-width="3"/><text x="${cx + TOKEN_R * 0.72}" y="${cy - TOKEN_R * 0.72 + 6}" font-size="18" font-weight="900" fill="#000" text-anchor="middle" font-family="${FONT}">K</text>`
    : '';
  return `<circle cx="${cx}" cy="${cy}" r="${TOKEN_R}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${cx}" y="${cy + 12}" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="${FONT}">${initial}</text>
    ${cap}
    <rect x="${cx - nameW / 2}" y="${labelY - 23}" width="${nameW}" height="32" rx="16" fill="rgba(0,0,0,0.62)"/>
    <text x="${cx}" y="${labelY}" font-size="21" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="${FONT}">${name}</text>`;
}

function opponentSvg(o: Slot): string {
  const cx = cxOf(o.x);
  const cy = cyOf(o.y);
  const note = o.instruction ? esc(o.instruction) : '';
  const noteEl = note
    ? `<rect x="${cx - (note.length * 11 + 16) / 2}" y="${cy + OPP_R + 6}" width="${note.length * 11 + 16}" height="26" rx="13" fill="rgba(127,29,29,0.85)"/><text x="${cx}" y="${cy + OPP_R + 24}" font-size="17" font-weight="700" fill="#fecaca" text-anchor="middle" font-family="${FONT}">${note}</text>`
    : '';
  return `<circle cx="${cx}" cy="${cy}" r="${OPP_R}" fill="#7f1d1d" stroke="#ef4444" stroke-width="3"/>
    <path d="M ${cx - 11} ${cy - 11} L ${cx + 11} ${cy + 11} M ${cx + 11} ${cy - 11} L ${cx - 11} ${cy + 11}" stroke="#fecaca" stroke-width="4" stroke-linecap="round"/>
    ${noteEl}`;
}

export interface TacticImageOpts {
  teamName?: string | null;
  accent?: string | null;
  sizeLabel?: string;
}

/** Taktiği kendi-kendine yeten bir SVG kart string'ine çevirir. */
export function buildTacticSvg(t: TacticState, opts: TacticImageOpts = {}): string {
  const accent = opts.accent || '#39FF14';
  const sizeLabel = opts.sizeLabel || t.size;
  const ident = IDENTITY[t.identity as string] || IDENTITY.BALANCED;
  const crest = trUpper((opts.teamName || t.name || '?').trim().slice(0, 2));
  const notes = t.notes ? esc(t.notes) : '';

  const slots = (t.slots || []).map(s => tokenSvg(s, t.captainId)).join('');
  const opps = (t.opponents || []).map(opponentSvg).join('');

  const footerTop = PITCH_Y + PITCH_H + PITCH_PAD;
  const idY = footerTop + 96;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1f12"/><stop offset="0.5" stop-color="#0B2815"/><stop offset="1" stop-color="#081a0f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.7">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.10"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" rx="48" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="${H}" rx="48" fill="url(#glow)"/>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="46" fill="none" stroke="#161B22" stroke-width="8"/>

  <!-- Header -->
  <rect x="8" y="8" width="${W - 16}" height="${HEADER_H - 8}" rx="44" fill="rgba(0,0,0,0.42)"/>
  <rect x="60" y="30" width="${W - 120}" height="4" fill="${accent}" opacity="0.5"/>
  <text x="66" y="66" font-size="18" font-weight="900" fill="rgba(255,255,255,0.32)" letter-spacing="4">OFFICIAL LINEUP</text>
  <text x="${W - 66}" y="66" font-size="18" font-weight="900" fill="rgba(255,255,255,0.32)" letter-spacing="4" text-anchor="end">MATCH DAY</text>
  <rect x="${W / 2 - 52}" y="86" width="104" height="104" rx="28" fill="${accent}"/>
  <text x="${W / 2}" y="${86 + 68}" font-size="44" font-weight="900" fill="#04140a" text-anchor="middle">${esc(crest)}</text>
  <text x="${W / 2}" y="238" font-size="54" font-weight="900" fill="#ffffff" text-anchor="middle" font-style="italic">${esc(trUpper(t.name || 'TAKTİK'))}</text>
  <rect x="${W / 2 - 150}" y="256" width="300" height="34" rx="17" fill="rgba(57,255,20,0.12)" stroke="${accent}" stroke-opacity="0.35"/>
  <text x="${W / 2}" y="279" font-size="19" font-weight="900" fill="${accent}" text-anchor="middle" letter-spacing="3">${esc(trUpper(t.formation))} SİSTEMİ</text>

  <!-- Pitch -->
  <rect x="${PITCH_X}" y="${PITCH_Y}" width="${PITCH_W}" height="${PITCH_H}" rx="28" fill="#0B2815" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
  ${pitchMarkings()}
  ${opps}
  ${slots}

  <!-- Footer -->
  <rect x="8" y="${footerTop}" width="${W - 16}" height="${H - footerTop - 8}" rx="44" fill="rgba(0,0,0,0.6)"/>
  <text x="${W / 2}" y="${footerTop + 44}" font-size="18" font-weight="700" fill="#9ca3af" text-anchor="middle" letter-spacing="4">OYUN KİMLİĞİ</text>
  <text x="${W / 2}" y="${idY}" font-size="40" font-weight="900" fill="${ident.color}" text-anchor="middle" font-style="italic">${esc(ident.label)}</text>
  ${notes ? `<rect x="${PITCH_X}" y="${idY + 26}" width="${PITCH_W}" height="70" rx="16" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)"/><text x="${W / 2}" y="${idY + 68}" font-size="22" font-style="italic" fill="#d1d5db" text-anchor="middle">"${notes.length > 60 ? notes.slice(0, 60) + '…' : notes}"</text>` : ''}
  <text x="${PITCH_X + 8}" y="${H - 44}" font-size="18" font-weight="700" fill="#6b7280" letter-spacing="2">${esc(trUpper(t.formation))} · ${esc(sizeLabel)}</text>
  <text x="${W - PITCH_X - 8}" y="${H - 44}" font-size="18" font-weight="900" fill="${accent}" text-anchor="end" letter-spacing="2">POWERED BY OYNA</text>
</svg>`;
}

/** SVG string → PNG Blob (canvas üzerinden). */
export async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.width = W;
    img.height = H;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Görsel oluşturulamadı (SVG yüklenemedi).'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas kullanılamıyor.');
    ctx.drawImage(img, 0, 0, W, H);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png', 0.95));
    if (!blob) throw new Error('PNG üretilemedi.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Taktik → PNG Blob (tek adım). */
export const tacticToPngBlob = (t: TacticState, opts?: TacticImageOpts): Promise<Blob> =>
  svgToPngBlob(buildTacticSvg(t, opts));

/** Blob'u dosya olarak indirir. */
/**
 * Görseli kullanıcıya ver.
 *
 * Eskiden düz `<a download>` kullanıyordu; bu desen PAKETLENMİŞ uygulamada
 * (iOS WKWebView / Android Capacitor WebView) SESSİZCE hiçbir şey yapmaz —
 * "indirildi" toast'ı çıkar, dosya ortada yoktur. Artık ortak yardımcıdan
 * geçer: önce platformun paylaşım sayfası, olmazsa klasik indirme
 * (utils/dosyaKaydet.ts).
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<KaydetSonucu> {
  return dosyaKaydetVeyaPaylas(blob, filename, 'OYNA Taktik');
}

/** Dosya adı: taktik-adi.png (güvenli). */
export const tacticImageFilename = (t: TacticState): string =>
  `${(t.name || 'taktik').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'taktik'}.png`;
