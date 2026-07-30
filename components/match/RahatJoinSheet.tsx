import React, { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, Info, AlertTriangle, Check } from 'lucide-react';
import type { MatchListing, PositionSlot } from '../../types';
import type { RahatMatchConfig } from '../../services/rahatMatchService';

// ════════════════════════════════════════════════════════════════════════
// E3 · RAHAT KATILIM SAYFASI — akışın kalbi
//
// Pozisyon YOK: oyuncu yalnız "kaç kişi + hangi takım" seçer. Slot id'leri
// görünmez; ödeme anında her seçim, ilgili tarafın İLK AÇIK slotuna çözülür
// (sunucu player_buy_slots_v2 ile OPEN'lığı yeniden doğrular — yarışta
// SLOT_TAKEN düşer ve şerit tazelenir).
//
// Canlı sayaç formülü (tasarım sözleşmesi):
//   countForRow(i, side) = baseFilled[side] + picks.slice(0, i).filter(p => p === side).length
//   isFull = countForRow(i, side) >= capacity[side]
//
// YARIŞ ŞERİDİ: sheet açıkken realtime güncelleme bir tarafın kapasitesini
// düşürürse o tarafa atanmış fazla seçimler otomatik temizlenir ve kırmızı
// şerit çıkar — ayrı hata ekranı YOK.
// ════════════════════════════════════════════════════════════════════════

type Side = 'W' | 'R';

interface RahatJoinSheetProps {
  open: boolean;
  match: MatchListing;
  /** Başlık altı özet: "Tesis · Kort · Bugün 20:00" */
  summary: string;
  /** İade kademesi — CANLI konfigden (uydurma sabit yazılmaz). */
  config: RahatMatchConfig;
  busy: boolean;
  onClose: () => void;
  /** Seçim tamam: taraflara çözülmüş slot id listesiyle ödemeye/katılıma geç. */
  onProceed: (slotIds: string[], total: number) => void;
}

const openIds = (slots: PositionSlot[] | undefined): string[] =>
  (slots || []).filter(s => (s?.status || 'OPEN') === 'OPEN').map(s => s.id);

const takenCount = (slots: PositionSlot[] | undefined): number =>
  (slots || []).filter(s => s?.status === 'TAKEN').length;

export const RahatJoinSheet: React.FC<RahatJoinSheetProps> = ({
  open, match, summary, config, busy, onClose, onProceed,
}) => {
  const [qty, setQty] = useState(1);
  const [picks, setPicks] = useState<(Side | null)[]>([null, null, null, null]);
  const [raceErr, setRaceErr] = useState(false);

  const wOpen = useMemo(() => openIds(match.slots), [match.slots]);
  const rOpen = useMemo(() => openIds(match.awaySlots), [match.awaySlots]);
  const wCap = (match.slots || []).length;
  const rCap = (match.awaySlots || []).length;
  const wBase = takenCount(match.slots);
  const rBase = takenCount(match.awaySlots);
  const remain = wOpen.length + rOpen.length;
  const maxQty = Math.max(1, Math.min(4, remain));
  const price = match.price || 0;

  // Sheet her açılışta sıfırdan başlar.
  useEffect(() => {
    if (open) { setQty(1); setPicks([null, null, null, null]); setRaceErr(false); }
  }, [open]);

  // ── YARIŞ: canlı veri seçimleri geçersiz kıldıysa fazlaları temizle + şerit ──
  // qty da bağımlılıkta: adet düşürülüp (gizlenen seçim korunur) yarışta taraf
  // dolduktan sonra adet geri artırılırsa, yeniden görünür olan bayat seçim
  // burada tekrar doğrulanır — dolu takım "seçili" diye canlanamaz.
  useEffect(() => {
    if (!open) return;
    setPicks(prev => {
      let wUsed = 0, rUsed = 0, changed = false;
      const next = prev.map((p, i) => {
        if (i >= qty || p == null) return p;
        if (p === 'W') {
          if (wUsed < wOpen.length) { wUsed++; return p; }
          changed = true; return null;
        }
        if (rUsed < rOpen.length) { rUsed++; return p; }
        changed = true; return null;
      });
      if (changed) setRaceErr(true);
      return changed ? next : prev;
    });
    setQty(q => Math.min(q, maxQty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wOpen.length, rOpen.length, open, qty]);

  if (!open) return null;

  const pick = (i: number, side: Side) => {
    setPicks(prev => { const n = [...prev]; n[i] = side; return n; });
    setRaceErr(false);
  };

  const active = picks.slice(0, qty);
  const allPicked = active.every(p => p === 'W' || p === 'R');
  const total = qty * price;

  const proceed = () => {
    if (!allPicked || busy) return;
    // Seçimler taraf sırasına göre ilk açık slotlara çözülür.
    let w = 0, r = 0;
    const ids: string[] = [];
    for (const p of active) {
      if (p === 'W') { if (w >= wOpen.length) { setRaceErr(true); return; } ids.push(wOpen[w++]); }
      else { if (r >= rOpen.length) { setRaceErr(true); return; } ids.push(rOpen[r++]); }
    }
    onProceed(ids, total);
  };

  const fmt = (n: number) => n.toLocaleString('tr-TR');
  const payLabel = price === 0 ? 'YERİ AL · ÜCRETSİZ' : `ÖDEMEYE GEÇ · ${fmt(total)}₺`;

  // Satır başına canlı sayaç (tasarım formülü birebir).
  const rows = Array.from({ length: qty }, (_, i) => {
    const wBefore = active.slice(0, i).filter(p => p === 'W').length;
    const rBefore = active.slice(0, i).filter(p => p === 'R').length;
    const wc = wBase + wBefore;
    const rc = rBase + rBefore;
    const sel = active[i];
    return {
      i,
      wCount: `${wc}/${wCap}`, rCount: `${rc}/${rCap}`,
      wFull: wc >= wCap && sel !== 'W',
      rFull: rc >= rCap && sel !== 'R',
      wSel: sel === 'W', rSel: sel === 'R',
    };
  });

  const teamBtnBase: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: '12px 11px', borderRadius: 16, textAlign: 'left', cursor: 'pointer',
  };

  const TeamOption: React.FC<{
    label: string; labelColor: string; count: string;
    state: 'full' | 'selected' | 'open'; onPick: () => void;
  }> = ({ label, labelColor, count, state, onPick }) => {
    if (state === 'full') {
      return (
        <div style={{ ...teamBtnBase, background: '#0f1419', border: '1px solid rgba(255,255,255,0.06)', opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: labelColor }}>{label}</p>
          <p className="font-numeric" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>DOLU</p>
        </div>
      );
    }
    if (state === 'selected') {
      return (
        <button type="button" onClick={onPick} style={{ ...teamBtnBase, position: 'relative', background: 'rgba(57,255,20,0.07)', border: '1.5px solid #39FF14', boxShadow: '0 0 20px rgba(57,255,20,0.22)' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#FFFFFF' }}>{label}</p>
          <p className="font-numeric" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#8fe87a' }}>{count}</p>
          <span style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', background: '#39FF14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={12} strokeWidth={3.2} color="#0A0E14" />
          </span>
        </button>
      );
    }
    return (
      <button type="button" onClick={onPick} style={{ ...teamBtnBase, background: '#0f1419', border: '1px solid rgba(255,255,255,0.10)' }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: labelColor }}>{label}</p>
        <p className="font-numeric" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>{count}</p>
      </button>
    );
  };

  return (
    <div lang="tr" className="fixed inset-0 z-[55]">
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(5px)' }} />
      <div
        className="oy-rahat-sheet custom-scrollbar"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '96%', overflowY: 'auto',
          background: '#161B22', borderTop: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '28px 28px 0 0', boxShadow: '0 -14px 50px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ padding: '11px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.20)' }} />
        </div>

        <div style={{ padding: '4px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: '.16em', color: '#FFFFFF' }}>MAÇA KATIL</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <X size={15} color="#9CA3AF" />
          </button>
        </div>
        <p style={{ margin: '6px 20px 0', fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>{summary}</p>

        {raceErr && (
          <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 13px', borderRadius: 14, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.40)' }}>
            <AlertTriangle size={15} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.45, color: '#F87171' }}>
              Seçtiğin yer az önce doldu — takımını güncelle.
            </p>
          </div>
        )}

        {/* ── Adet ── */}
        <div style={{ padding: '20px 20px 0' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#6B7280' }}>KAÇ KİŞİ İÇİN YER ALIYORSUN?</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
            <button type="button" aria-label="Azalt" onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 48, height: 48, borderRadius: 14, background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <Minus size={19} strokeWidth={2.4} color="#D1D5DB" />
            </button>
            <span className="font-numeric" style={{ fontSize: 36, fontWeight: 700, color: '#FFFFFF', minWidth: 40, textAlign: 'center' }}>{qty}</span>
            <button type="button" aria-label="Artır" onClick={() => setQty(q => Math.min(maxQty, q + 1))}
              style={{ width: 48, height: 48, borderRadius: 14, background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <Plus size={19} strokeWidth={2.4} color="#39FF14" />
            </button>
          </div>
          <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
            Aldığın fazladan yerlere sonra arkadaşlarını ekleyebilirsin.{' '}
            <span style={{ color: '#4B5563' }}>Üst sınır: {maxQty} yer</span>
          </p>
        </div>

        {/* ── Takım seçimi ── */}
        <div style={{ padding: '22px 20px 0' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#6B7280' }}>HANGİ TAKIM?</p>
          {rows.map(row => (
            <div key={row.i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
              {qty > 1 && (
                <span className="font-numeric" style={{ width: 42, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{row.i + 1}. yer</span>
              )}
              <div style={{ flex: 1, display: 'flex', gap: 9, minWidth: 0 }}>
                <TeamOption
                  label="BEYAZ TAKIM" labelColor="#E8EDF4" count={row.wCount}
                  state={row.wSel ? 'selected' : row.wFull ? 'full' : 'open'}
                  onPick={() => pick(row.i, 'W')}
                />
                <TeamOption
                  label="KIRMIZI TAKIM" labelColor="#D93A3A" count={row.rCount}
                  state={row.rSel ? 'selected' : row.rFull ? 'full' : 'open'}
                  onPick={() => pick(row.i, 'R')}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── Tutar ── */}
        <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
          <p className="font-numeric" style={{ margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF', lineHeight: 1 }}>
            {price === 0 ? 'ÜCRETSİZ' : `${fmt(total)}₺`}
          </p>
          <p style={{ margin: '7px 0 0', fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>
            {price === 0 ? `${qty} yer · ödeme alınmaz` : `${qty} yer × ${fmt(price)}₺`}
          </p>
        </div>

        {/* ── İade notu — kademeler CANLI konfigden ── */}
        {price > 0 && (
          <div style={{ margin: '18px 20px 0', display: 'flex', gap: 10, padding: 13, borderRadius: 16, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.22)' }}>
            <Info size={15} color="#60A5FA" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.55, color: '#93c5fd' }}>
              Kadro dolmazsa veya maç iptal olursa <strong style={{ color: '#FFFFFF', fontWeight: 800 }}>ödediğin tutarın tamamı</strong> cüzdanına döner.
              Kendin ayrılırsan iade kademeye tabidir:{' '}
              <span className="font-numeric" style={{ color: '#FFFFFF' }}>{config.refundFullHours}</span> saatten fazla varsa tamamı,{' '}
              <span className="font-numeric" style={{ color: '#FFFFFF' }}>{config.refundHalfHours}–{config.refundFullHours}</span> saat kala{' '}
              <span className="font-numeric" style={{ color: '#FFFFFF' }}>%{config.refundHalfPct}</span>&apos;i döner;{' '}
              <span className="font-numeric" style={{ color: '#FFFFFF' }}>{config.refundHalfHours}</span> saatten az kala iade yapılmaz.
            </p>
          </div>
        )}

        {/* ── CTA ── */}
        <div style={{ padding: '18px 20px 30px' }}>
          <button
            type="button"
            onClick={proceed}
            disabled={!allPicked || busy}
            style={{
              width: '100%', height: 54, borderRadius: 16, border: 'none',
              background: '#39FF14', color: '#0A0E14', fontSize: 14, fontWeight: 900, letterSpacing: '.1em',
              cursor: allPicked && !busy ? 'pointer' : 'not-allowed',
              opacity: allPicked && !busy ? 1 : 0.4,
              boxShadow: allPicked && !busy ? '0 0 30px rgba(57,255,20,0.28)' : 'none',
            }}
          >
            {busy ? 'İŞLENİYOR…' : payLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RahatJoinSheet;
