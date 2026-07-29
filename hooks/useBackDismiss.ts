import { useEffect, useId, useRef } from 'react';
import { useAppStore } from '../store';

/**
 * Bir overlay'i (sheet / modal / tam ekran katman) merkezî geri-tuşu kaydına
 * yazar. Android donanım geri tuşu (App.tsx) ve Esc tuşu bu kaydı okur:
 * ekran değişmeden önce en üstteki overlay kapanır.
 *
 * IP-01 · BULGU-020/021/132: geri tuşu bugün yalnız navigationStack'e bakıyor,
 * açık sheet/modal'lardan haberi yok — bu yüzden sheet'i kapatmak yerine
 * arkadaki ekranı değiştiriyor.
 *
 * @param open     Overlay görünür mü. false iken kayıt otomatik silinir.
 * @param onClose  Kapatma geri çağrısı. Kimliği her render değişebilir (ref'te tutulur).
 * @param name     Ayıklama için okunur ad, ör. 'notifications'.
 * @param priority Aynı anda açık katmanlarda üstte olan yüksek değerlidir.
 *                 Alt-sayfa/modal = 0 (varsayılan), onay diyaloğu = 10.
 */
export function useBackDismiss(
  open: boolean,
  onClose: () => void,
  name: string,
  priority = 0,
) {
  const autoId = useId();
  const cbRef = useRef(onClose);
  cbRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = `${name}:${autoId}`;
    const call = () => cbRef.current();
    const { pushOverlay, popOverlay } = useAppStore.getState();
    pushOverlay(id, call, priority);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useAppStore.getState();
      // Banka doğrulaması açıkken hiçbir katman kapanmaz — geri tuşundaki
      // koruma Esc yolunda da geçerli olmalı, yoksa garanti tek yolda kalırdı.
      if (st.paymentLockActive) return;
      // Yalnız EN ÜSTTEKİ katman Esc'ye cevap versin; iç içe açık iki katmanda
      // her ikisinin birden kapanmasını engeller (ConfirmDialog + BottomSheet).
      const stack = st.overlayStack;
      if (stack.length === 0) return;
      let top = stack[0];
      for (const o of stack) if (o.priority >= top.priority) top = o;
      if (top.id !== id) return;
      e.stopPropagation();
      // Kaydı elle silme — close() korumalı no-op olabilir. Katman gerçekten
      // kapanırsa bu effect'in cleanup'ı popOverlay çağırır (store ile aynı kural).
      call();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      popOverlay(id);
    };
  }, [open, name, autoId, priority]);
}

export default useBackDismiss;
