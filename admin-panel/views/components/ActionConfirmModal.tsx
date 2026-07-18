import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ActionConfirmOptions {
    title: string;
    description: string;
    impactText?: string;
    actionType: 'PRICE_CHANGE' | 'GHOST_MODE' | 'BAN_USER' | 'SETTINGS_CHANGE' | 'FORCE_REFUND' | 'FORCE_CAPTURE' | 'FORCE_VOID' | 'FORCE_CHARGEBACK' | 'SCORE_OVERRIDE' | 'PAYOUT';
    targetId: string;
    targetName: string;
    /** Ayarlanırsa "yaz-onayla": kullanıcı bu ifadeyi yazmadan onay butonu açılmaz. */
    confirmPhrase?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

interface ActionConfirmModalProps {
    isOpen: boolean;
    options: ActionConfirmOptions | null;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({ isOpen, options }) => {
    const [typed, setTyped] = useState('');
    useEffect(() => { setTyped(''); }, [options?.targetId, isOpen]);

    if (!isOpen || !options) return null;

    const phrase = options.confirmPhrase?.trim();
    const phraseOk = !phrase || typed.trim() === phrase;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-red-500/5">
                            <div className="flex items-center gap-2 text-red-400">
                                <AlertTriangle size={18} />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Kritik İşlem Onayı</h3>
                            </div>
                            <button onClick={options.onCancel} className="text-gray-500 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <h4 className="text-white font-bold text-lg">{options.title}</h4>
                                <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                                    {options.description}
                                </p>
                            </div>

                            {options.impactText && (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3 mt-4">
                                    <ShieldCheck size={16} className="text-yellow-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1">Olası Etki / Risk</p>
                                        <p className="text-xs text-yellow-500/80 leading-relaxed">{options.impactText}</p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-black/30 rounded-lg p-3 mt-4 border border-white/5">
                                <p className="text-[10px] text-gray-500 font-mono flex items-center justify-between">
                                    <span>İşlem Türü:</span> <span className="text-white font-bold">{options.actionType}</span>
                                </p>
                                <p className="text-[10px] text-gray-500 font-mono flex items-center justify-between mt-1">
                                    <span>Hedef:</span> <span className="text-white font-bold">{options.targetName}</span>
                                </p>
                                <p className="text-[10px] text-gray-500 font-mono mt-3">
                                    Bu işlem sistem loglarına kaydedilecektir (Audit Log).
                                </p>
                            </div>

                            {phrase && (
                                <div>
                                    <label className="text-[11px] text-gray-400 block mb-1.5">
                                        Onaylamak için <span className="font-bold text-white">{phrase}</span> yazın:
                                    </label>
                                    <input
                                        autoFocus
                                        value={typed}
                                        onChange={(e) => setTyped(e.target.value)}
                                        placeholder={phrase}
                                        className="w-full h-10 bg-black/40 border border-white/15 rounded-lg px-3 text-sm text-white focus:border-red-500/50 focus:outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-3 p-4 border-t border-white/5 bg-black/20">
                            <button
                                onClick={options.onCancel}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white text-xs font-bold transition-all"
                            >
                                İptal Et
                            </button>
                            <button
                                onClick={options.onConfirm}
                                disabled={!phraseOk}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                İşlemi Onayla
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
