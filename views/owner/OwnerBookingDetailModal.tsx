import React, { useState } from 'react';
import { MessageSquare, QrCode, X, XCircle } from 'lucide-react';
import { cancelConfirmedBooking, toTurkishError } from '../../services/pitchOwnerService';
import { useOwnerToast } from './components/useOwnerToast';

export interface BookingDetailData {
  id: string;
  time: string;
  user: string;
  type: 'APP' | 'PHONE' | 'SUB' | 'DAILY';
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  price: number;
  paid: number;
  note?: string;
}

interface OwnerBookingDetailModalProps {
  booking: BookingDetailData;
  readOnly?: boolean;
  onClose: () => void;
  onCancelled: () => void;
  onNavigateQr?: () => void;
}

export const OwnerBookingDetailModal: React.FC<OwnerBookingDetailModalProps> = ({
  booking,
  readOnly = false,
  onClose,
  onCancelled,
  onNavigateQr,
}) => {
  const notify = useOwnerToast();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const statusLabel =
    booking.status === 'PAID' ? 'ÖDENDİ' : booking.status === 'PARTIAL' ? 'KISMİ' : 'BEKLEYEN';

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      notify('İptal nedeni zorunludur.', 'warning');
      return;
    }
    if (!confirm('Bu rezervasyonu iptal etmek istediğinize emin misiniz? Ödenmiş tutar varsa iade işlemi başlatılır.')) {
      return;
    }
    setIsCancelling(true);
    try {
      await cancelConfirmedBooking(booking.id, cancelReason.trim());
      onCancelled();
      onClose();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
      <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] border-t border-white/10 p-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-black text-white">{booking.user}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {booking.time} • {booking.type === 'APP' ? 'Uygulama Rezervasyonu' : 'Manuel Rezervasyon'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 mb-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-gray-500 font-bold uppercase">Durum</span>
            <span
              className={`text-[10px] font-black px-2 py-1 rounded ${
                booking.status === 'PAID'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : booking.status === 'PARTIAL'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-gray-500 font-bold uppercase">Tutar</span>
            <span className="text-lg font-black text-white font-mono">{booking.price}₺</span>
          </div>
          {booking.paid > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-500 font-bold uppercase">Tahsil edilen</span>
              <span className="text-sm font-black text-emerald-400 font-mono">{booking.paid}₺</span>
            </div>
          )}
          {booking.note && (
            <p className="text-xs text-gray-400 border-t border-white/5 pt-2">{booking.note}</p>
          )}
        </div>

        {!showCancelForm ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => notify('Kaptan mesajlaşması yakında aktif olacak.', 'info')}
              className="py-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl text-[11px] font-black hover:bg-blue-500/20 transition-colors flex flex-col items-center gap-1.5 uppercase"
            >
              <MessageSquare size={16} /> Kaptana Mesaj
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateQr?.();
              }}
              className="py-3 bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] rounded-xl text-[11px] font-black hover:bg-[#39FF14]/20 transition-colors flex flex-col items-center gap-1.5 uppercase"
            >
              <QrCode size={16} /> QR Check-in
            </button>
          </div>
        ) : (
          <div className="mb-4 space-y-3">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">İptal nedeni</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Örn: Hava koşulları, bakım çalışması"
              className="w-full bg-[#0A0E14] border border-white/5 p-4 rounded-2xl text-white text-sm outline-none resize-none"
            />
          </div>
        )}

        {!readOnly && (
          <div className="flex gap-3">
            {!showCancelForm ? (
              <button
                type="button"
                onClick={() => setShowCancelForm(true)}
                className="flex-1 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-[11px] font-black hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 uppercase"
              >
                <XCircle size={16} /> Rezervasyonu İptal Et
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowCancelForm(false)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 text-gray-400 rounded-xl text-[11px] font-black"
                >
                  VAZGEÇ
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="flex-[2] py-3 bg-red-600 text-white rounded-xl text-[11px] font-black disabled:opacity-50"
                >
                  {isCancelling ? 'İPTAL EDİLİYOR...' : 'İPTALİ ONAYLA'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
