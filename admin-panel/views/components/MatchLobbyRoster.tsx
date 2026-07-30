import React, { useMemo } from 'react';
import { Lock, X, ArrowLeftRight } from 'lucide-react';
import type { PositionSlot, AdminUser } from '../../../types';
import { avatarFor } from '../../../shared/lobbyEnrichment';
import { skillBand } from '../../../utils/skillBand';

// ─── E9 · Rahat maç lobisi (admin) ──────────────────────────────────────────
//
// Rahat maçta saha çizimi / diziliş görseli YOK — MatchLobbyPitch yerine bu
// pozisyonsuz iki kolonlu kadro gelir. Oyuncunun gördüğü dille BİREBİR aynı
// beş satır durumu (tek tanım, ENTEGRASYON §5):
//   1 OPEN                       → kesikli daire + "+ Boş yer" (aksiyon yok)
//   2 TAKEN + occupant           → avatar + isim + seviye BANDI (ham puan asla)
//   3 RESERVED (occupant yok)    → kilit + "Rezerve — {alıcı} dolduracak"
//   4 LINK_PENDING               → kilit + "Davet kodu paylaşıldı"
//   5 ASSIGNED (davetli oturdu)  → normal satır + DAVETLİ rozeti
// RESERVED/LINK_PENDING doluluk sayımında DOLU'dur (parası ödenmiş yer).
//
// Satır aksiyonları admin'e özel: "Çıkar (iade)" admin_kick_from_slot'a,
// "Takım değiştir" player_move_slot_team'e (is_admin muafiyeti,
// 20260830000003) gider. Katılım/atama YOK — Rahat'ta yerler E3 katılım
// sayfasından satın alınır, admin kadroyu yalnız düzeltir.

const TEAM_WHITE = '#E8EDF4';
const TEAM_RED = '#D93A3A';

type RowKind = 'open' | 'lock' | 'player';
interface RosterRow {
  key: string;
  slot: PositionSlot;
  kind: RowKind;
  lockText?: string;
  name?: string;
  avatar?: string;
  selfSkill?: number | null;
  isInvited?: boolean;
}

/** Tüketici RahatMatchLobby.buildRows ile aynı durum türetmesi — admin isim
 *  çözümü adminUsers üzerinden yapılır (lobide katılımcı servisi kullanılır). */
function buildRows(slots: PositionSlot[] | undefined, nameOf: (id?: string) => string | undefined): RosterRow[] {
  return (slots || []).map((slot) => {
    const base = { key: slot.id, slot };
    if ((slot.status || 'OPEN') !== 'TAKEN') return { ...base, kind: 'open' as const };
    const occupant = (slot as { occupant?: string }).occupant || slot.player?.id;
    const buyer = (slot as { purchasedBy?: string }).purchasedBy;
    const assign = (slot as { assignmentStatus?: string }).assignmentStatus;
    if (!occupant) {
      if (assign === 'LINK_PENDING') return { ...base, kind: 'lock' as const, lockText: 'Davet kodu paylaşıldı' };
      return { ...base, kind: 'lock' as const, lockText: `Rezerve — ${nameOf(buyer) || 'alıcı'} dolduracak` };
    }
    const name = slot.player?.name || nameOf(occupant) || 'Oyuncu';
    return {
      ...base,
      kind: 'player' as const,
      name,
      avatar: slot.player?.avatar || '',
      selfSkill: slot.player?.selfSkill ?? null,
      isInvited: assign === 'ASSIGNED' && buyer !== occupant,
    };
  });
}

interface ColumnProps {
  title: string;
  dot: string;
  rows: RosterRow[];
  isAway: boolean;
  busy: boolean;
  onKick: (slotId: string, isAway: boolean) => void | Promise<void>;
  onMoveTeam: (slotId: string, isAway: boolean) => void | Promise<void>;
}

const TeamColumn: React.FC<ColumnProps> = ({ title, dot, rows, isAway, busy, onKick, onMoveTeam }) => {
  const filled = rows.filter((r) => r.kind !== 'open').length;
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-300 flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
          <span className="truncate">{title}</span>
        </p>
        <span className="text-[10px] font-extrabold text-gray-500 shrink-0">{filled}/{rows.length}</span>
      </div>

      {rows.map((row) => (
        <div
          key={row.key}
          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
            row.kind === 'open' ? 'border-dashed border-white/10 bg-transparent' : 'border-white/10 bg-black/30'
          }`}
        >
          {row.kind === 'open' ? (
            <>
              <span className="w-7 h-7 rounded-full border border-dashed border-white/15 shrink-0" />
              <span className="text-[11px] text-gray-600 italic">+ Boş yer</span>
            </>
          ) : row.kind === 'lock' ? (
            <>
              <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Lock size={11} className="text-gray-400" />
              </span>
              <span className="text-[10px] font-bold text-gray-300 truncate flex-1 min-w-0">{row.lockText}</span>
            </>
          ) : (
            <>
              <img
                src={row.avatar || avatarFor(row.key, row.name)}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0"
              />
              <span className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white truncate">{row.name}</span>
                {(() => {
                  const band = skillBand(row.selfSkill);
                  return band ? (
                    <span
                      className="text-[8px] font-extrabold tracking-wider rounded-full px-1.5 py-0.5 shrink-0"
                      style={{ color: band.color, background: `${band.color}1f`, border: `1px solid ${band.color}4d` }}
                    >{band.label}</span>
                  ) : null;
                })()}
                {row.isInvited && (
                  <span className="text-[8px] font-extrabold text-cyan-300 border border-cyan-500/30 rounded px-1 py-0.5 shrink-0">DAVETLİ</span>
                )}
              </span>
            </>
          )}

          {row.kind !== 'open' && (
            <span className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={busy}
                aria-label="Takım değiştir"
                title="Takım değiştir"
                onClick={() => void onMoveTeam(row.key, isAway)}
                className="w-6 h-6 rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 disabled:opacity-40 flex items-center justify-center"
              >
                <ArrowLeftRight size={11} />
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label="Çıkar (iade)"
                title="Çıkar (iade)"
                onClick={() => void onKick(row.key, isAway)}
                className="w-6 h-6 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 flex items-center justify-center"
              >
                <X size={11} />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export interface MatchLobbyRosterProps {
  slots: PositionSlot[];
  awaySlots?: PositionSlot[];
  users: AdminUser[];
  busy: boolean;
  onKick: (slotId: string, isAway: boolean) => void | Promise<void>;
  onMoveTeam: (slotId: string, isAway: boolean) => void | Promise<void>;
}

/** Admin Rahat kadrosu — iki kolon (BEYAZ | KIRMIZI), saha çizimi yok. */
export const MatchLobbyRoster: React.FC<MatchLobbyRosterProps> = ({ slots, awaySlots, users, busy, onKick, onMoveTeam }) => {
  const nameOf = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u.name]));
    return (id?: string) => (id ? byId.get(id) : undefined);
  }, [users]);

  const home = useMemo(() => buildRows(slots, nameOf), [slots, nameOf]);
  const away = useMemo(() => buildRows(awaySlots, nameOf), [awaySlots, nameOf]);

  return (
    <div lang="tr" className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-3">
        <TeamColumn title="BEYAZ TAKIM" dot={TEAM_WHITE} rows={home} isAway={false} busy={busy} onKick={onKick} onMoveTeam={onMoveTeam} />
        <TeamColumn title="KIRMIZI TAKIM" dot={TEAM_RED} rows={away} isAway busy={busy} onKick={onKick} onMoveTeam={onMoveTeam} />
      </div>
      <p className="text-[9px] text-gray-600 leading-relaxed px-1">
        Rahat maç — pozisyonsuz kadro. Yerler oyuncular tarafından katılım sayfasından alınır;
        admin yalnız çıkarır (iadeli) ya da karşı takıma taşır (para hareketi yok).
      </p>
    </div>
  );
};
