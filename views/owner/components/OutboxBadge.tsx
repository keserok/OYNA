import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { subscribeOutbox, flushOutbox } from '../../../services/offline/outbox';
import type { OutboxItem } from '../../../shared/outboxModel';

// ─── P-OFFLINE — bekleyen işlem rozeti ───────────────────────────────────────
// Kuyruk boşken hiç render olmaz. Doluyken panel başlığında amber çip:
// "⏳ N bekleyen işlem" — dokununca hemen göndermeyi dener.

export const OutboxBadge: React.FC = () => {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => subscribeOutbox(setItems), []);

  if (items.length === 0) return null;

  const tryFlush = async () => {
    if (flushing) return;
    setFlushing(true);
    try { await flushOutbox(); } finally { setFlushing(false); }
  };

  return (
    <button
      type="button"
      onClick={tryFlush}
      title={items.map((i) => i.label).join('\n')}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase whitespace-nowrap active:scale-95 transition-transform"
    >
      {flushing ? <RefreshCw size={12} className="animate-spin" /> : <CloudOff size={12} />}
      {items.length} bekleyen
    </button>
  );
};
