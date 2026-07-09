import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Search, Phone, Eye, Ban, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { auth } from '../../supabaseAuth';
import Avatar from '../ui/Avatar';
import BottomSheet from '../ui/BottomSheet';
import { getBlockedUsers, unblockUser, BlockedUserRow } from '../../services/socialService';

// ================================================================
// PrivacySection — Ayarlar → Gizlilik (Spec §3.12 / B12·E32·F35)
// 3 anahtar (aramada görün · telefonla bulun · çevrimiçi göster) +
// Engellenenler yönetimi. Kendi verisini kendisi yükler.
// ================================================================

interface Flags {
  is_searchable: boolean;
  discoverable_by_phone: boolean;
  show_online_status: boolean;
}

const ROWS: { key: keyof Flags; icon: React.ReactNode; title: string; desc: string }[] = [
  {
    key: 'is_searchable', icon: <Search size={18} />,
    title: 'Beni aramalarda göster',
    desc: 'Kapatırsan isim/ID aramalarında çıkmazsın.',
  },
  {
    key: 'discoverable_by_phone', icon: <Phone size={18} />,
    title: 'Telefonumla bulunabileyim',
    desc: 'Rehber eşleştirmesinde görünürlüğün.',
  },
  {
    key: 'show_online_status', icon: <Eye size={18} />,
    title: 'Çevrimiçi durumumu göster',
    desc: 'Kapatırsan sen de kimseninkini göremezsin.',
  },
];

interface PrivacySectionProps {
  /** true ise kendi başlığını gizler (tam ekran alt sayfada başlık zaten var). */
  embedded?: boolean;
}

const PrivacySection: React.FC<PrivacySectionProps> = ({ embedded = false }) => {
  const userId = auth.currentUser?.uid || '';
  const [flags, setFlags] = useState<Flags | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUserRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('is_searchable, discoverable_by_phone, show_online_status')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setFlags({
          is_searchable: data.is_searchable ?? true,
          discoverable_by_phone: data.discoverable_by_phone ?? true,
          show_online_status: data.show_online_status ?? true,
        });
      });
  }, [userId]);

  const toggle = useCallback(async (key: keyof Flags) => {
    if (!flags) return;
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next); // iyimser
    const { error } = await supabase
      .from('profiles')
      .update({ [key]: next[key] })
      .eq('id', userId);
    if (error) setFlags(flags); // geri al
  }, [flags, userId]);

  const openBlocked = useCallback(async () => {
    setBlockedOpen(true);
    setBlocked(null);
    try { setBlocked(await getBlockedUsers(userId)); }
    catch { setBlocked([]); }
  }, [userId]);

  const doUnblock = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await unblockUser(userId, id);
      setBlocked(prev => (prev || []).filter(b => b.blocked_id !== id));
    } finally { setBusyId(null); }
  }, [userId]);

  return (
    <section>
      {!embedded && (
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2 flex items-center gap-2">
          <Lock size={12} className="text-[#39FF14]" /> Gizlilik
        </h3>
      )}
      <div className="bg-[#161B22] border border-white/5 rounded-2xl divide-y divide-white/5">
        {ROWS.map(r => (
          <div key={r.key} className="flex items-center gap-3 p-4">
            <span className="text-white/50">{r.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{r.title}</div>
              <div className="text-[11px] text-white/40">{r.desc}</div>
            </div>
            <button
              role="switch"
              aria-checked={flags?.[r.key] ?? true}
              onClick={() => toggle(r.key)}
              disabled={!flags}
              className={`w-12 h-7 rounded-full p-0.5 transition-colors ${
                (flags?.[r.key] ?? true) ? 'bg-[#39FF14]' : 'bg-white/10'
              }`}
            >
              <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                (flags?.[r.key] ?? true) ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        ))}
        <button
          onClick={openBlocked}
          className="w-full flex items-center gap-3 p-4 text-left active:bg-white/[0.03]"
        >
          <Ban size={18} className="text-[#FF4D4D]" />
          <span className="flex-1 text-sm font-bold text-white">Engellenenler</span>
          <span className="text-xs text-white/40">Yönet</span>
        </button>
      </div>

      <BottomSheet open={blockedOpen} onClose={() => setBlockedOpen(false)} ariaLabel="Engellenenler">
        <div className="pb-4">
          <h3 className="text-base font-black mb-4">Engellenenler</h3>
          {blocked === null ? (
            <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-white/40" /></div>
          ) : blocked.length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center">Engellediğin kimse yok.</p>
          ) : (
            <div className="space-y-2">
              {blocked.map(b => (
                <div key={b.blocked_id} className="flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3">
                  <Avatar name={b.full_name} src={b.avatar_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{b.full_name}</div>
                    <div className="text-[11px] text-white/35">{b.oyna_id ? `@${b.oyna_id}` : ''}</div>
                  </div>
                  <button
                    disabled={busyId === b.blocked_id}
                    onClick={() => doUnblock(b.blocked_id)}
                    className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/70 active:scale-95"
                  >
                    {busyId === b.blocked_id ? '…' : 'Engeli Kaldır'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </section>
  );
};

export default PrivacySection;
