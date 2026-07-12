import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Spinner } from '../../components/ui/Spinner';
import {
  ArrowLeft, Search, Copy, Share2, QrCode, BookUser, UserPlus,
  Check, ChevronRight, Loader2, Clock, Users, X,
} from 'lucide-react';
import { AppView } from '../../types';
import { auth } from '../../supabaseAuth';
import { supabase } from '../../supabaseClient';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonList from '../../components/ui/SkeletonList';
import {
  searchUsers, getRecentTeammates, getFriendSuggestions,
  sendFriendRequest, cancelFriendRequest, respondFriendRequest,
  getOrCreateReferralCode, parseSocialError,
  UserSearchRow, TeammateRow, SuggestionRow, RelationshipState,
} from '../../services/socialService';
import { syncContactsAndMatch, isContactsAvailable, ContactSyncResult } from '../../services/contactsService';

// ================================================================
// FriendAddView — "Arkadaş Ekle / Keşfet" tam ekran sayfası (Spec §3.2)
// Kahraman: büyük yazı-arama (isim + @oyna_id). Boşken keşif kanalları:
// Rehber · QR · Birlikte Oynadıkların · küçük "Tanıyor olabilirsin".
// Her satırda TEK durum-farkındalı buton.
// ================================================================

interface FriendAddViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type RowPerson = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  pos?: string | null;
  relationship: RelationshipState;
  request_id: string | null;
  meta?: string; // "3 maç birlikte" / "2 ortak arkadaş"
};

// Durum-farkındalı tek buton (Spec B10)
const RelationButton: React.FC<{
  person: RowPerson;
  busy: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onAccept: () => void;
}> = ({ person, busy, onAdd, onCancel, onAccept }) => {
  if (busy) {
    return (
      <span className="w-24 h-9 rounded-xl bg-white/5 flex items-center justify-center">
        <Loader2 size={14} className="animate-spin text-white/50" />
      </span>
    );
  }
  switch (person.relationship) {
    case 'FRIENDS':
      return (
        <span className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1 text-[11px] font-bold text-white/50">
          <Check size={12} /> Arkadaşsınız
        </span>
      );
    case 'PENDING_OUT':
      return (
        <button
          onClick={onCancel}
          className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 active:scale-[0.96]"
        >
          Geri Al
        </button>
      );
    case 'PENDING_IN':
      return (
        <button
          onClick={onAccept}
          className="h-9 px-3 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-bold active:scale-[0.96]"
        >
          Kabul Et
        </button>
      );
    default:
      return (
        <button
          onClick={onAdd}
          className="h-9 px-3.5 rounded-xl bg-[#39FF14] text-[#0A0E14] text-[11px] font-bold flex items-center gap-1 active:scale-[0.96]"
        >
          <UserPlus size={12} /> Ekle
        </button>
      );
  }
};

const PersonRow: React.FC<{
  person: RowPerson;
  busy: boolean;
  onAction: (p: RowPerson, action: 'add' | 'cancel' | 'accept') => void;
}> = ({ person, busy, onAction }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-white/4 border border-white/6 p-3">
    <Avatar name={person.full_name} src={person.avatar_url} size="md" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-white truncate">{person.full_name}</span>
        {person.pos && (
          <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-white/8 text-white/50">
            {person.pos}
          </span>
        )}
      </div>
      <div className="text-[11px] text-white/40 truncate">
        {person.oyna_id ? `@${person.oyna_id}` : 'OYNA oyuncusu'}
        {person.meta ? ` · ${person.meta}` : ''}
      </div>
    </div>
    <RelationButton
      person={person}
      busy={busy}
      onAdd={() => onAction(person, 'add')}
      onCancel={() => onAction(person, 'cancel')}
      onAccept={() => onAction(person, 'accept')}
    />
  </div>
);

const FriendAddView: React.FC<FriendAddViewProps> = ({ onBack, onNavigate }) => {
  const userId = auth.currentUser?.uid || '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RowPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [teammates, setTeammates] = useState<RowPerson[]>([]);
  const [suggestions, setSuggestions] = useState<RowPerson[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [myOynaId, setMyOynaId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [contactResults, setContactResults] = useState<ContactSyncResult | null>(null);
  const [contactsBusy, setContactsBusy] = useState(false);
  // KVKK açık rıza: OS izin diyaloğundan ÖNCE ne olacağını anlatan uygulama-içi
  // onay adımı — OS "Allow Contacts?" diyaloğu tek başına aydınlatılmış açık
  // rıza yerine geçmez (bkz. KVKK Açık Rıza Metni).
  const [showContactsConsent, setShowContactsConsent] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // Kendi OYNA-ID'in (paylaş/kopyala satırı)
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('oyna_id').eq('id', userId).single()
      .then(({ data }) => setMyOynaId(data?.oyna_id ?? null));
  }, [userId]);

  // Keşif kanalları (arama boşken görünür)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [tm, sg] = await Promise.all([
          getRecentTeammates(10),
          getFriendSuggestions(10),
        ]);
        if (!alive) return;
        setTeammates(tm.map(t => ({
          ...t, meta: `${t.shared_matches} maç birlikte`,
        })));
        setSuggestions(sg.map(s => ({
          ...s, meta: s.mutual_friends > 0 ? `${s.mutual_friends} ortak arkadaş` : undefined,
        })));
      } catch (e) {
        console.error('[FriendAdd] kanallar yüklenemedi', e);
      } finally {
        if (alive) setLoadingChannels(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Debounce'lu arama (300ms, ≥2 karakter)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.replace(/^@/, '').length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchUsers(q, 20, 0);
        setResults(rows.map(r => ({
          ...r,
          meta: r.mutual_friends > 0 ? `${r.mutual_friends} ortak arkadaş` : undefined,
        })));
      } catch (e) {
        console.error('[FriendAdd] arama hatası', e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Tek aksiyon işleyici — üç listeyi de aynı kural günceller
  const handleAction = useCallback(async (p: RowPerson, action: 'add' | 'cancel' | 'accept') => {
    setBusyId(p.user_id);
    const patch = (upd: Partial<RowPerson>) => {
      const apply = (list: RowPerson[]) =>
        list.map(x => (x.user_id === p.user_id ? { ...x, ...upd } : x));
      setResults(apply); setTeammates(apply); setSuggestions(apply);
      setContactResults(prev => prev
        ? { ...prev, matched: prev.matched.map(x => x.user_id === p.user_id ? { ...x, ...upd } as any : x) }
        : prev);
    };
    try {
      if (action === 'add') {
        const res = await sendFriendRequest(p.user_id);
        patch({ relationship: res.state, request_id: res.request_id ?? null });
        if (res.auto_accepted) showToast('Artık arkadaşsınız 🤝');
      } else if (action === 'cancel' && p.request_id) {
        await cancelFriendRequest(p.request_id);
        patch({ relationship: 'NONE', request_id: null });
      } else if (action === 'accept' && p.request_id) {
        await respondFriendRequest(p.request_id, true);
        patch({ relationship: 'FRIENDS', request_id: null });
        showToast('Artık arkadaşsınız 🤝');
      }
    } catch (e) {
      showToast(parseSocialError(e));
    } finally {
      setBusyId(null);
    }
  }, [showToast]);

  const copyMyId = useCallback(async () => {
    if (!myOynaId) return;
    try {
      await navigator.clipboard.writeText(`@${myOynaId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* pano izni yoksa sessiz */ }
  }, [myOynaId]);

  const shareInvite = useCallback(async () => {
    try {
      const code = await getOrCreateReferralCode();
      const url = `https://oyna.app/davet/${code}`;
      const text = `OYNA'da beraber maç yapalım! ⚽ Beni @${myOynaId || ''} olarak ekle: ${url}`;
      if (navigator.share) {
        await navigator.share({ title: 'OYNA Daveti', text, url });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('Davet linki kopyalandı');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') showToast(parseSocialError(e));
    }
  }, [myOynaId, showToast]);

  // Buton buna bağlı: senkron başlatmadan önce açık rıza sheet'ini açar.
  const handleContacts = useCallback(() => {
    setShowContactsConsent(true);
  }, []);

  // Kullanıcı sheet'te "İzin Ver"e bastıktan SONRA gerçek senkron burada başlar.
  const runContactsSync = useCallback(async () => {
    setShowContactsConsent(false);
    setContactsBusy(true);
    try {
      const res = await syncContactsAndMatch();
      setContactResults(res);
      if (res.matched.length === 0 && res.invitable.length === 0) {
        showToast('Rehberde eşleşme bulunamadı');
      }
    } catch (e) {
      showToast(parseSocialError(e));
    } finally {
      setContactsBusy(false);
    }
  }, [showToast]);

  const isSearchActive = query.trim().replace(/^@/, '').length >= 2;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
      {/* Başlık */}
      <div className="pt-safe px-5 flex items-center gap-3 pb-2">
        <button
          onClick={onBack}
          aria-label="Geri"
          className="w-11 h-11 -ml-2 rounded-2xl flex items-center justify-center text-white/70 active:scale-95"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-black">Arkadaş Ekle</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-safe">
        {/* KAHRAMAN: büyük arama (Spec B7 — yazıyla ekleme belirgin) */}
        <div className="relative mt-2">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="OYNA-ID veya isimle ara…"
            className="w-full h-14 pl-11 pr-4 rounded-2xl bg-white/6 border border-white/10 text-[15px] font-semibold placeholder:text-white/30 focus:outline-none focus:border-[#39FF14]/50"
          />
        </div>

        {/* Kendi ID'in + davet paylaş */}
        <div className="flex items-center gap-2 mt-3 px-1">
          <span className="text-xs text-white/40">
            Senin ID'in: <span className="text-white/80 font-bold">{myOynaId ? `@${myOynaId}` : '…'}</span>
          </span>
          <button
            onClick={copyMyId}
            className="ml-auto h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 flex items-center gap-1 active:scale-95"
          >
            {copied ? <Check size={11} className="text-[#39FF14]" /> : <Copy size={11} />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <button
            onClick={shareInvite}
            className="h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 flex items-center gap-1 active:scale-95"
          >
            <Share2 size={11} /> Paylaş
          </button>
        </div>

        {isSearchActive ? (
          /* ── Arama sonuçları ── */
          <div className="mt-5 space-y-2.5">
            {searching && results.length === 0 && <SkeletonList rows={3} />}
            {!searching && results.length === 0 && (
              <EmptyState
                icon={Search}
                title="Sonuç bulunamadı"
                description="Farklı bir isim ya da @oyna-id dene. Arkadaşın linkle de katılabilir."
                actions={[{ label: 'Davet Linki Paylaş', onClick: shareInvite, primary: true }]}
              />
            )}
            {results.map(p => (
              <PersonRow key={p.user_id} person={p} busy={busyId === p.user_id} onAction={handleAction} />
            ))}
          </div>
        ) : (
          /* ── Keşif kanalları (arama boşken) ── */
          <div className="mt-5">
            {/* Rehber + QR kartları */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleContacts}
                disabled={contactsBusy}
                className="rounded-2xl bg-white/4 border border-white/8 p-4 text-left active:scale-[0.98]"
              >
                {contactsBusy
                  ? <Spinner size={20} />
                  : <BookUser size={20} className="text-[#39FF14]" />}
                <div className="text-sm font-bold mt-2">Rehberini Bağla</div>
                <div className="text-[11px] text-white/40 mt-0.5">
                  {isContactsAvailable() ? 'OYNA\'daki tanıdıklarını bul' : 'Yalnız uygulamada kullanılabilir'}
                </div>
              </button>
              <button
                onClick={() => onNavigate('QR_SCANNER' as AppView)}
                className="rounded-2xl bg-white/4 border border-white/8 p-4 text-left active:scale-[0.98]"
              >
                <QrCode size={20} className="text-[#39FF14]" />
                <div className="text-sm font-bold mt-2">QR ile Ekle</div>
                <div className="text-[11px] text-white/40 mt-0.5">Yan yanaysanız en hızlısı</div>
              </button>
            </div>

            {/* Rehber eşleşmeleri */}
            {contactResults && (
              <div className="mt-5">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2.5">
                  Rehberinden · {contactResults.matched.length} kişi OYNA'da
                </h3>
                <div className="space-y-2.5">
                  {contactResults.matched.map(p => (
                    <PersonRow
                      key={p.user_id}
                      person={{ ...p, pos: null }}
                      busy={busyId === p.user_id}
                      onAction={handleAction}
                    />
                  ))}
                </div>
                {contactResults.invitable.length > 0 && (
                  <button
                    onClick={shareInvite}
                    className="mt-3 w-full min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Share2 size={14} />
                    Rehberindeki {contactResults.invitable.length} kişiyi OYNA'ya davet et
                  </button>
                )}
              </div>
            )}

            {/* Birlikte oynadıkların */}
            <div className="mt-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2.5 flex items-center gap-1.5">
                <Clock size={11} /> Birlikte Oynadıkların
              </h3>
              {loadingChannels ? (
                <SkeletonList rows={2} />
              ) : teammates.length === 0 ? (
                <p className="text-xs text-white/30 px-1">
                  Maç yaptıkça birlikte oynadığın oyuncular burada belirecek.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {teammates.map(p => (
                    <PersonRow key={p.user_id} person={p} busy={busyId === p.user_id} onAction={handleAction} />
                  ))}
                </div>
              )}
            </div>

            {/* Tanıyor olabilirsin — KÜÇÜK satır (Spec B9) */}
            {suggestions.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowSuggestions(v => !v)}
                  className="flex items-center gap-1 text-xs font-bold text-white/40 min-h-[44px] px-1"
                >
                  <Users size={12} />
                  Tanıyor olabilirsin ({suggestions.length})
                  <ChevronRight size={13} className={`transition-transform ${showSuggestions ? 'rotate-90' : ''}`} />
                </button>
                {showSuggestions && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2.5 overflow-hidden"
                  >
                    {suggestions.map(p => (
                      <PersonRow key={p.user_id} person={p} busy={busyId === p.user_id} onAction={handleAction} />
                    ))}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini toast */}
      {toast && (
        <div className="fixed bottom-24 inset-x-5 z-50 flex justify-center pointer-events-none">
          <div className="px-4 py-2.5 rounded-2xl bg-[#161B22] border border-white/10 text-sm font-semibold shadow-xl">
            {toast}
          </div>
        </div>
      )}

      {/* Rehber eşleştirme — KVKK açık rıza sheet'i (OS izin diyaloğundan önce) */}
      {showContactsConsent && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-6"
          onClick={() => setShowContactsConsent(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] p-6"
            style={{
              background: 'linear-gradient(180deg, #161B22 0%, #0A0E14 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <BookUser size={18} className="text-[#39FF14]" />
                <h3 className="font-black text-white text-base">Rehberini Bağla</h3>
              </div>
              <button onClick={() => setShowContactsConsent(false)} className="text-gray-500 hover:text-white p-1" aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-300 mb-3 leading-relaxed">
              Devam edersen cihazının işletim sistemi rehber erişimi için izin isteyecek. İzin verirsen:
            </p>
            <ul className="text-xs text-gray-400 space-y-2 mb-4 list-disc list-inside">
              <li>Rehberindeki numaralar <strong className="text-gray-300">cihazında</strong> şifrelenir (hash) — sunucumuza yalnızca bu şifreli hâli gider.</li>
              <li>OYNA'da hesabı olmayan kişilerin numarası cihazından hiçbir şekilde çıkmaz.</li>
              <li>Bu izni istediğin an Ayarlar → Gizlilik'ten geri alabilirsin.</li>
            </ul>
            <div className="space-y-3">
              <button
                onClick={runContactsSync}
                className="w-full h-12 rounded-2xl font-black text-sm bg-[#39FF14] text-black active:scale-95 transition-all"
              >
                İzin Ver ve Devam Et
              </button>
              <button
                onClick={() => setShowContactsConsent(false)}
                className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendAddView;
