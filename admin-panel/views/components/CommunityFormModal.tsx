import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2 } from 'lucide-react';
import type { CommunityAdminInput, CommunityRow } from '../../services/adminService';

const COMMUNITY_TYPES = ['Üniversite', 'Kurumsal', 'Semt', 'Bağımsız'] as const;
const JOIN_MODES = ['OPEN', 'REQUEST', 'INVITE_ONLY'] as const;

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  community?: CommunityRow | null;
  onClose: () => void;
  onSave: (data: CommunityAdminInput) => Promise<void>;
}

export const CommunityFormModal: React.FC<Props> = ({ open, mode, community, onClose, onSave }) => {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<CommunityAdminInput>({
    name: '',
    type: 'Bağımsız',
    join_mode: 'OPEN',
    is_verified: false,
    is_private: false,
    is_demo: false,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && community) {
      setF({
        name: community.name,
        type: community.type,
        domain: community.domain ?? undefined,
        description: community.description ?? undefined,
        location: community.location ?? undefined,
        owner_id: community.owner_id ?? null,
        is_verified: community.is_verified,
        is_private: community.is_private ?? false,
        is_demo: community.is_demo ?? false,
        join_mode: (community.join_mode as CommunityAdminInput['join_mode']) || 'OPEN',
      });
    } else {
      setF({
        name: '',
        type: 'Bağımsız',
        join_mode: 'OPEN',
        is_verified: false,
        is_private: false,
        is_demo: false,
      });
    }
  }, [open, mode, community]);

  const submit = async () => {
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...f, name: f.name.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="relative w-full max-w-lg bg-[#0D1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-sm font-black text-white uppercase">
                {mode === 'create' ? 'Yeni Topluluk' : 'Topluluğu Düzenle'}
              </h2>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <Field label="Ad *">
                <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="Topluluk adı" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tür">
                  <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
                    {COMMUNITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Katılım Modu">
                  <select value={f.join_mode} onChange={(e) => setF({ ...f, join_mode: e.target.value as CommunityAdminInput['join_mode'] })} className={inputCls}>
                    {JOIN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Domain">
                <input value={f.domain ?? ''} onChange={(e) => setF({ ...f, domain: e.target.value })} className={inputCls} placeholder="@sirket.com" />
              </Field>
              <Field label="Konum">
                <input value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} className={inputCls} placeholder="İstanbul" />
              </Field>
              <Field label="Açıklama">
                <textarea value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${inputCls} min-h-[72px] resize-none`} />
              </Field>
              <Field label="Sahip (kullanıcı UUID)">
                <input value={f.owner_id ?? ''} onChange={(e) => setF({ ...f, owner_id: e.target.value || null })} className={inputCls} placeholder="Opsiyonel" />
              </Field>
              <div className="flex flex-wrap gap-4 pt-1">
                <Toggle checked={!!f.is_verified} onChange={(v) => setF({ ...f, is_verified: v })} label="Doğrulanmış" />
                <Toggle checked={!!f.is_private} onChange={(v) => setF({ ...f, is_private: v })} label="Gizli" />
                <Toggle checked={!!f.is_demo} onChange={(v) => setF({ ...f, is_demo: v })} label="Demo" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-9 px-4 text-xs text-gray-500 hover:text-white">İptal</button>
              <button type="button" disabled={saving || !f.name.trim()} onClick={() => void submit()} className="h-9 px-4 bg-white text-black text-xs font-bold rounded-lg flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Kaydet
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const inputCls = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-white/25';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{label}</span>
    {children}
  </label>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button type="button" onClick={() => onChange(!checked)} className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border ${checked ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'border-white/10 text-gray-500'}`}>
    {label}
  </button>
);
