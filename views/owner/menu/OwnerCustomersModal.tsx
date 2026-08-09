import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, MessageCircle, Phone, Plus, RefreshCw, Search } from 'lucide-react';
import { OwnerBottomSheet } from '../components/OwnerBottomSheet';
import { useOwnerToast } from '../components/useOwnerToast';
import { useConfirmSheet } from '../components/useConfirmSheet';
import { Spinner } from '../../../components/ui/Spinner';
import { money } from '../finance/financeUi';
import { waLink } from '../../../utils/whatsapp';
import { tarihKisaTR } from '../../../utils/tarih';
import { ownerCreateManualBooking, toTurkishError } from '../../../services/pitchOwnerService';
import {
  listPitchCustomers, createPitchCustomer, setCustomerPhone, getCustomerCard,
  nextSameWeekdayISO, type PitchCustomer, type CustomerCard,
} from '../../../services/customerService';

// ─── Müşteri Defteri (C1 + C5 + C6) — Menü → Müşteriler ─────────────────────
// Tasarım: docs/master/MUSTERI_DEFTERI_TASARIMI.md. Liste + müşteri kartı +
// "geçen haftanın aynısı" tekrar rezervasyon tek modalda; personel de kullanır.

const tarihTR = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
};

interface Props {
  pitchId: string;
  readOnly?: boolean;
  onClose: () => void;
  onOpenCalendarAt?: (t: { dateISO: string; bookingId?: string; courtName?: string | null }) => void;
}

export const OwnerCustomersModal: React.FC<Props> = ({ pitchId, readOnly = false, onClose, onOpenCalendarAt }) => {
  const notify = useOwnerToast();
  const { confirm, confirmElement } = useConfirmSheet();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PitchCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const reqRef = useRef(0);

  const load = useCallback(async (search?: string) => {
    const id = ++reqRef.current;
    try {
      const list = await listPitchCustomers(pitchId, search);
      if (id === reqRef.current) setRows(list);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [pitchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const openCard = async (c: PitchCustomer) => {
    setCardLoading(true);
    setPhoneDraft('');
    try {
      setCard(await getCustomerCard(c.id));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setCardLoading(false);
    }
  };

  const submitAdd = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await createPitchCustomer(pitchId, form.name, form.phone || undefined);
      setForm({ name: '', phone: '' });
      setAddOpen(false);
      notify('Müşteri deftere eklendi.', 'success');
      await load(q);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Karar 8: telefonu eksik kayda telefon eklenince kimlik tamamlanır.
  const savePhone = async () => {
    if (!card || !phoneDraft.trim()) return;
    setBusy(true);
    try {
      await setCustomerPhone(card.id, phoneDraft);
      notify('Telefon kaydedildi.', 'success');
      setCard(await getCustomerCard(card.id));
      await load(q);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Karar 7: "geçen haftanın aynısı" — bugünden sonraki ilk aynı güne kurulur.
  const repeatBooking = async () => {
    const son = card?.son_rezervasyonlar?.[0];
    if (!card || !son || !son.court_id) {
      notify('Tekrar kurulacak bir rezervasyon bulunamadı.', 'warning');
      return;
    }
    const tarih = nextSameWeekdayISO(son.booking_date);
    const ok = await confirm({
      title: 'Tekrar rezerve et?',
      message: `${card.name} · ${tarihTR(tarih)} ${son.start_time}–${son.end_time} · ${son.court ?? 'Saha'}. Ödeme "bekliyor" olarak açılır; saat doluysa sistem izin vermez.`,
      confirmLabel: 'Rezerve Et',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await ownerCreateManualBooking({
        pitchId,
        courtId: son.court_id,
        bookingDate: tarih,
        startTime: son.start_time,
        endTime: son.end_time,
        customerName: card.name,
        customerPhone: card.phone ?? undefined,
        paymentStatus: 'PENDING',
      });
      notify('Rezervasyon kuruldu.', 'success');
      onClose();
      onOpenCalendarAt?.({ dateISO: tarih, courtName: son.court });
    } catch (e) {
      notify(toTurkishError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerBottomSheet
      open
      onClose={busy ? () => {} : onClose}
      title="Müşteri Defteri"
      subtitle={card ? card.name : loading ? 'yükleniyor…' : `${rows.length} kayıt`}
    >
      {card ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setCard(null)}
            className="flex items-center gap-1.5 text-xs font-extrabold text-gray-400 hover:text-white">
            <ArrowLeft size={14} /> Listeye dön
          </button>

          {/* İstatistikler (karar 6: gelmedi/iptal de görünür) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
              <p className="text-[10px] font-extrabold text-gray-500 uppercase">Rezervasyon</p>
              <p className="text-xl font-extrabold text-white tabular-nums">{card.toplam}</p>
            </div>
            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
              <p className="text-[10px] font-extrabold text-gray-500 uppercase">Veresiye</p>
              <p className={`text-xl font-extrabold tabular-nums ${card.veresiye > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{money(card.veresiye)}</p>
            </div>
            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
              <p className="text-[10px] font-extrabold text-gray-500 uppercase">Gelmedi · İptal</p>
              <p className="text-xl font-extrabold text-amber-400 tabular-nums">{card.gelmedi} · {card.iptal}</p>
            </div>
            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
              <p className="text-[10px] font-extrabold text-gray-500 uppercase">Son geliş</p>
              <p className="text-[13px] font-extrabold text-white leading-tight mt-1">{tarihTR(card.son_gelis)}</p>
            </div>
          </div>

          {/* Telefon + iletişim */}
          {card.phone_missing ? (
            readOnly ? (
              <p className="text-xs text-amber-400">Telefonu eksik — geçmiş kayıttan geldi.</p>
            ) : (
              <div className="flex gap-2">
                <input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  inputMode="tel"
                  placeholder="Telefon ekle (kimliği tamamlar)"
                  className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#FACC15]"
                />
                <button type="button" disabled={busy || !phoneDraft.trim()} onClick={savePhone}
                  className="px-4 rounded-xl bg-white text-[#0A0E14] text-xs font-extrabold disabled:opacity-40">
                  Kaydet
                </button>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${(card.phone ?? '').replace(/[^0-9+]/g, '')}`}
                className="min-h-[44px] rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px] font-extrabold uppercase flex items-center justify-center gap-1.5">
                <Phone size={14} /> Ara
              </a>
              <a href={waLink(card.phone ?? '', `Merhaba ${card.name} 👋`)} target="_blank" rel="noopener noreferrer"
                className="min-h-[44px] rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-[11px] font-extrabold uppercase flex items-center justify-center gap-1.5">
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>
          )}

          {/* Son rezervasyonlar — satıra dokun → takvimde o gün */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-extrabold text-gray-500 uppercase">Son Rezervasyonlar</h4>
            {card.son_rezervasyonlar.length === 0 ? (
              <p className="text-xs text-gray-500">Rezervasyon kaydı yok.</p>
            ) : card.son_rezervasyonlar.map((b, i) => (
              <button key={`${b.booking_date}-${b.start_time}-${i}`} type="button"
                disabled={!onOpenCalendarAt}
                onClick={() => { onClose(); onOpenCalendarAt?.({ dateISO: b.booking_date, courtName: b.court }); }}
                className="w-full bg-[#0A0E14] border border-white/5 rounded-xl px-3 py-2.5 flex justify-between items-center text-left enabled:hover:border-white/20">
                <span className="text-xs font-bold text-white">{tarihKisaTR(b.booking_date)} · {b.start_time} · {b.court ?? 'Saha'}</span>
                <span className={`text-[10px] font-extrabold ${b.status === 'CANCELLED' ? 'text-red-400' : b.no_show ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {b.status === 'CANCELLED' ? 'İPTAL' : b.no_show ? 'GELMEDİ' : money(b.price)}
                </span>
              </button>
            ))}
          </div>

          {!readOnly && (
            <button type="button" disabled={busy || cardLoading || !card.son_rezervasyonlar[0]?.court_id}
              onClick={repeatBooking}
              className="w-full min-h-[50px] rounded-full bg-white text-[#0A0E14] text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-all">
              {busy ? <Spinner size={18} color="currentColor" glow={false} /> : <><RefreshCw size={16} /> Tekrar Rezerve Et (aynı gün-saat)</>}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ad veya telefonla ara…"
                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl pl-9 pr-3 py-3 text-white text-sm outline-none focus:border-[#FACC15]"
              />
            </div>
            {!readOnly && (
              <button type="button" aria-label="Müşteri ekle" onClick={() => setAddOpen(!addOpen)}
                className="w-11 h-11 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white">
                <Plus size={18} />
              </button>
            )}
          </div>

          {addOpen && !readOnly && (
            <div className="bg-[#0A0E14] border border-white/10 rounded-2xl p-3 space-y-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Müşteri adı" className="w-full bg-transparent border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel" placeholder="Telefon (önerilir)" className="w-full bg-transparent border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none" />
              <button type="button" disabled={busy || !form.name.trim()} onClick={submitAdd}
                className="w-full min-h-[44px] rounded-xl bg-white text-[#0A0E14] text-xs font-extrabold disabled:opacity-40">
                {busy ? 'KAYDEDİLİYOR…' : 'DEFTERE EKLE'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-10 flex justify-center"><Spinner size={22} /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {q.trim() ? 'Aramaya uyan müşteri yok.' : 'Defter henüz boş — manuel rezervasyon, veresiye ve abonman kayıtlarından kendiliğinden dolar.'}
            </p>
          ) : rows.map((c) => (
            <button key={c.id} type="button" onClick={() => openCard(c)}
              className="w-full bg-[#0A0E14] border border-white/5 rounded-2xl px-4 py-3 flex justify-between items-center text-left hover:border-white/20 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{c.name}</p>
                <p className={`text-[10px] font-mono ${c.phone_missing ? 'text-amber-400' : 'text-gray-500'}`}>
                  {c.phone_missing ? 'telefonu eksik' : c.phone}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-gray-500">
                {c.last_seen_on && <span className="text-[10px]">{tarihKisaTR(c.last_seen_on)}</span>}
                <CalendarDays size={14} />
              </div>
            </button>
          ))}
          {cardLoading && <div className="py-4 flex justify-center"><Spinner size={18} /></div>}
        </div>
      )}
      {confirmElement}
    </OwnerBottomSheet>
  );
};
