/**
 * MAÇ LOBİSİ BAŞLIK AYNASI — kullanıcı lobisinin (MatchJoin "Minimalist Maç
 * Başlığı") admin kokpitindeki birebir, DÜZENLENEBİLİR karşılığı.
 *
 * Görsel dil uygulamayla aynı: VS şeridi + bilgi/badge şeridi (konum · tarih ·
 * saat · zorluk · format · ücret · görünürlük). Fark: admin herhangi bir öğeye
 * tıklayınca altta tek-alan düzenleyici açılır; kayıt admin_update_match
 * RPC'sine gider (audit'li) ve lobi anında güncellenir.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Check, Clock, Eye, MapPin, Pencil, Swords, Wallet, X } from 'lucide-react';
import type { MatchListing } from '../../../types';
import { formatDateLabel } from '../../utils/matchMapper';

// Uygulamadaki difficultyConfig (MatchJoin) ile aynı kimlik renkleri (K/S/Y paleti).
const DIFF_META: Record<MatchListing['difficulty'], { color: string; label: string }> = {
  Ciddi: { color: '#FF4757', label: 'Ciddi' },
  Taktiksel: { color: '#FACC15', label: 'Taktiksel' },
  Rahat: { color: '#39FF14', label: 'Rahat' },
};

type FieldKey = 'title' | 'location' | 'date' | 'time' | 'price' | 'difficulty' | 'format' | 'visibility' | 'minRating';

interface Props {
  match: MatchListing;
  busy: boolean;
  /** payload → admin_update_match; localPatch → drawer'ın yerel listing'i. */
  onSave: (payload: Record<string, unknown>, localPatch: Partial<MatchListing>) => Promise<void>;
}

export const MatchLobbyHeader: React.FC<Props> = ({ match, busy, onSave }) => {
  const [active, setActive] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');

  const diff = DIFF_META[match.difficulty] || DIFF_META.Rahat;
  const twoSided = !!(match.awaySlots && match.awaySlots.length > 0);

  const open = (key: FieldKey) => {
    if (busy) return;
    setActive((prev) => (prev === key ? null : key));
    switch (key) {
      case 'title': setDraft(match.title); break;
      case 'location': setDraft(match.location); break;
      case 'date': setDraft(match.rawDate || new Date().toISOString().slice(0, 10)); break;
      case 'time': setDraft(match.time || '20:00'); break;
      case 'price': setDraft(String(match.price ?? 0)); break;
      case 'difficulty': setDraft(match.difficulty); break;
      case 'format': setDraft(match.format || '7v7'); break;
      case 'minRating': setDraft(String(match.minRating ?? 3)); break;
      case 'visibility': setDraft(match.visibility || 'OPEN'); setCodeDraft(match.privateCode || ''); break;
    }
  };

  const save = async () => {
    if (!active) return;
    let payload: Record<string, unknown> = {};
    let patch: Partial<MatchListing> = {};
    switch (active) {
      case 'title': {
        const v = draft.trim();
        if (!v) return;
        payload = { title: v }; patch = { title: v };
        break;
      }
      case 'location': {
        const v = draft.trim();
        if (!v) return;
        payload = { location: v }; patch = { location: v };
        break;
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft)) return;
        payload = { date: draft }; patch = { date: formatDateLabel(draft), rawDate: draft };
        break;
      }
      case 'time': {
        const m = draft.replace('.', ':').match(/\d{1,2}:\d{2}/);
        if (!m) return;
        payload = { time: m[0] }; patch = { time: m[0] };
        break;
      }
      case 'price': {
        const n = Number(draft);
        if (!Number.isFinite(n) || n < 0) return;
        payload = { price: n }; patch = { price: n };
        break;
      }
      case 'minRating': {
        const n = Number(draft.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 5) return;
        payload = { minRating: n }; patch = { minRating: n };
        break;
      }
      case 'difficulty': {
        const v = draft as MatchListing['difficulty'];
        payload = { difficulty: v, badges: [v] }; patch = { difficulty: v, badges: [v] };
        break;
      }
      case 'format': {
        payload = { format: draft }; patch = { format: draft };
        break;
      }
      case 'visibility': {
        const vis = draft === 'PRIVATE' ? 'PRIVATE' : 'OPEN';
        payload = { visibility: vis, ...(vis === 'PRIVATE' && codeDraft.trim() ? { private_code: codeDraft.trim().toUpperCase() } : {}) };
        patch = { visibility: vis, ...(vis === 'PRIVATE' && codeDraft.trim() ? { privateCode: codeDraft.trim().toUpperCase() } : {}) };
        break;
      }
    }
    await onSave(payload, patch);
    setActive(null);
  };

  const chipBtn = 'transition-colors hover:text-white cursor-pointer disabled:cursor-default';

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 space-y-2">
      {/* Ayna etiketi + başlık düzenleme */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
          <span className="text-[#39FF14]">LOBİ AYNASI</span> — oyuncular böyle görüyor · öğeye tıkla → düzenle
        </p>
        <button type="button" disabled={busy} onClick={() => open('title')} aria-label="Başlığı düzenle" className="w-6 h-6 rounded-lg bg-white/5 text-gray-500 hover:text-white flex items-center justify-center shrink-0">
          <Pencil size={11} />
        </button>
      </div>

      {/* VS Şeridi — uygulamayla aynı ritim (takım adları maça kayıtlı takımlardan) */}
      <div className="flex items-stretch gap-1.5">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-white/8 border-white/25 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <p className="text-[12px] font-black text-white uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-left">
            {match.homeTeamName || 'EV SAHİBİ'}
          </p>
        </div>
        <div className="flex items-center justify-center w-6 shrink-0">
          {twoSided ? <Swords size={11} className="text-white/30" /> : <div className="w-px h-6 bg-white/10" />}
        </div>
        <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border min-w-0 ${twoSided ? 'bg-red-500/8 border-red-500/25' : 'bg-transparent border-white/5 opacity-55'}`}>
          <p className={`text-[12px] font-black uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-right ${twoSided ? 'text-white' : 'text-gray-600'}`}>
            {match.awayTeamName || (twoSided ? 'DEPLASMAN' : 'RAKİP YOK')}
          </p>
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${twoSided ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]' : 'bg-white/15'}`} />
        </div>
      </div>

      {/* Başlık satırı */}
      <button type="button" disabled={busy} onClick={() => open('title')} className="w-full text-left">
        <p className="text-sm font-black text-white uppercase italic tracking-tight truncate">{match.title}</p>
      </button>

      {/* Bilgi + Badge Şeridi — her öğe düzenlenebilir */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={busy} onClick={() => open('location')} className={`flex items-center gap-1 text-[10px] font-bold text-white/50 min-w-0 flex-1 ${chipBtn}`}>
          <MapPin size={9} className="text-[#39FF14] shrink-0" />
          <span className="truncate">{match.location || 'Konum ekle'}</span>
        </button>
        <div className="flex items-center gap-1 text-[10px] font-bold text-white/40 shrink-0">
          <button type="button" disabled={busy} onClick={() => open('date')} className={`flex items-center gap-1 ${chipBtn}`}>
            <Calendar size={9} /><span>{match.date || '—'}</span>
          </button>
          <span className="text-white/20">•</span>
          <button type="button" disabled={busy} onClick={() => open('time')} className={`flex items-center gap-1 ${chipBtn}`}>
            <Clock size={9} /><span>{match.time || '—'}</span>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button" disabled={busy} onClick={() => open('difficulty')}
            className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border cursor-pointer"
            style={{ color: diff.color, borderColor: diff.color + '40', background: diff.color + '12' }}
          >
            {diff.label}
          </button>
          <button type="button" disabled={busy} onClick={() => open('format')} className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase text-white/70 bg-white/8 border border-white/10 cursor-pointer">
            {(match.format || '7v7').toUpperCase()}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" disabled={busy} onClick={() => open('price')} className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-white/70 ${chipBtn}`}>
          <Wallet size={10} className="text-[#39FF14]" /> {Number(match.price ?? 0).toLocaleString('tr-TR')} ₺ / kişi
        </button>
        <button type="button" disabled={busy} onClick={() => open('minRating')} className={`px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-white/70 ${chipBtn}`}>
          MIN ★ {Number(match.minRating ?? 3).toFixed(1)}
        </button>
        <button
          type="button" disabled={busy} onClick={() => open('visibility')}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black border ${chipBtn} ${
            match.visibility === 'PRIVATE'
              ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
              : 'bg-white/5 border-white/10 text-white/70'
          }`}
        >
          <Eye size={10} /> {match.visibility === 'PRIVATE' ? `ÖZEL${match.privateCode ? ` · ${match.privateCode}` : ''}` : 'HERKESE AÇIK'}
        </button>
      </div>

      {/* Tek-alan düzenleyici */}
      {active && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0D1117] border border-[#39FF14]/25 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              {{
                title: 'Maç Başlığı', location: 'Konum / Saha', date: 'Tarih', time: 'Saat',
                price: 'Kişi Başı Ücret (₺)', difficulty: 'Zorluk', format: 'Format',
                visibility: 'Görünürlük', minRating: 'Minimum Puan',
              }[active]}
            </p>
            <button type="button" onClick={() => setActive(null)} className="w-6 h-6 rounded-lg bg-white/5 text-gray-500 hover:text-white flex items-center justify-center"><X size={12} /></button>
          </div>

          {active === 'difficulty' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(DIFF_META) as Array<MatchListing['difficulty']>).map((d) => (
                <button
                  key={d} type="button" onClick={() => setDraft(d)}
                  className="py-2 rounded-lg text-[10px] font-black uppercase border transition-all"
                  style={draft === d
                    ? { color: '#000', backgroundColor: DIFF_META[d].color, borderColor: DIFF_META[d].color }
                    : { color: DIFF_META[d].color, backgroundColor: DIFF_META[d].color + '12', borderColor: DIFF_META[d].color + '45' }}
                >
                  {DIFF_META[d].label}
                </button>
              ))}
            </div>
          ) : active === 'format' ? (
            <div className="grid grid-cols-4 gap-1.5">
              {['5v5', '7v7', '8v8', '11v11'].map((v) => (
                <button
                  key={v} type="button" onClick={() => setDraft(v)}
                  className={`py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                    draft === v ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : active === 'visibility' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {(['OPEN', 'PRIVATE'] as const).map((v) => (
                  <button
                    key={v} type="button" onClick={() => setDraft(v)}
                    className={`py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                      draft === v ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {v === 'OPEN' ? 'Herkese Açık' : 'Özel (Kodlu)'}
                  </button>
                ))}
              </div>
              {draft === 'PRIVATE' && (
                <input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="Kod (boş → otomatik üretilir)"
                  className="w-full h-9 bg-black/40 border border-white/15 rounded-lg px-3 text-xs text-white font-mono tracking-widest focus:border-[#39FF14]/40 focus:outline-none"
                />
              )}
            </div>
          ) : (
            <input
              autoFocus
              type={active === 'date' ? 'date' : active === 'price' ? 'number' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
              className="w-full h-10 bg-black/40 border border-white/15 rounded-lg px-3 text-sm text-white focus:border-[#39FF14]/40 focus:outline-none [color-scheme:dark]"
            />
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full py-2 rounded-lg bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[10px] font-black uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Check size={12} /> Kaydet — anında yayına geçer
          </button>
        </motion.div>
      )}
    </div>
  );
};
