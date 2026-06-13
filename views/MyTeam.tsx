
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Share2, X, UserPlus, Trash2, Shield, Swords, Activity, CheckCircle2, Plus, Users } from 'lucide-react';
import { Player, AppView } from '../types';
import { getTeamRolesAndInstructions, updateTeamRolesAndInstructions, sbRemovePlayerFromTeam } from '../supabaseClient';
import { useAppStore } from '../store';
import { withDefaultPositions } from '../services/teamService';


interface MyTeamProps {
    onBack: () => void;
    onNavigate: (view: AppView) => void;
}


const MyTeam: React.FC<MyTeamProps> = ({ onBack, onNavigate }) => {
    const myTeams = useAppStore(s => s.myTeams);
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
    const activeTeam = myTeams.find(t => t.id === activeTeamId) ?? myTeams[0] ?? null;

    const [roster, setRoster] = useState<Player[]>([]);
    const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const pitchRef = useRef<HTMLDivElement>(null);

    // Aktif takım değişince kadroyu kur, Supabase'den pozisyon/talimatları yükle
    useEffect(() => {
        if (!activeTeam) { setRoster([]); return; }
        const baseRoster = withDefaultPositions(activeTeam.roster || []);
        setRoster(baseRoster);

        const loadSupabaseData = async () => {
            const savedRoles = await getTeamRolesAndInstructions(activeTeam.id);
            if (savedRoles) {
                setRoster(prev => prev.map(p => {
                    const saved = savedRoles[p.id];
                    if (saved) {
                        return {
                            ...p,
                            x: saved.x ?? p.x,
                            y: saved.y ?? p.y,
                            position: saved.position ?? p.position,
                            instruction: saved.instruction ?? p.instruction
                        };
                    }
                    return p;
                }));
            }
        };
        loadSupabaseData();
    }, [activeTeam?.id]);

    // Supabase'de pozisyonları ve talimatları güncelle
    const saveRosterToSupabase = async (currentRoster: Player[]) => {
        if (!activeTeam) return;
        const teamRolesObj: Record<string, any> = {};
        currentRoster.forEach(p => {
            teamRolesObj[p.id] = {
                x: p.x,
                y: p.y,
                position: p.position || 'OYUNCU',
                instruction: p.instruction || ''
            };
        });
        await updateTeamRolesAndInstructions(activeTeam.id, teamRolesObj);
    };

    // Formation Presets
    const applyFormation = async (type: '2-3-1' | '3-2-1') => {
        const newRoster = roster.map(p => ({ ...p }));
        if (type === '2-3-1' && newRoster.length >= 6) {
            // GK, 2 Def, 3 Mid, 1 Fwd
            newRoster[0].x = 50; newRoster[0].y = 10; // FWD
            newRoster[1].x = 20; newRoster[1].y = 45; // LM
            newRoster[2].x = 50; newRoster[2].y = 45; // CM
            newRoster[3].x = 80; newRoster[3].y = 45; // RM
            newRoster[4].x = 30; newRoster[4].y = 80; // CB
            newRoster[5].x = 70; newRoster[5].y = 80; // CB
        } else if (type === '3-2-1' && newRoster.length >= 6) {
            newRoster[0].x = 50; newRoster[0].y = 15; // FWD
            newRoster[1].x = 35; newRoster[1].y = 50; // CM
            newRoster[2].x = 65; newRoster[2].y = 50; // CM
            newRoster[3].x = 20; newRoster[3].y = 80; // LB
            newRoster[4].x = 50; newRoster[4].y = 85; // CB
            newRoster[5].x = 80; newRoster[5].y = 80; // RB
        }
        setRoster(newRoster);
        await saveRosterToSupabase(newRoster);
    };

    const rafRef = useRef<number | null>(null);

    const handlePointerMove = (e: React.PointerEvent) => {
        if (draggedPlayer && pitchRef.current) {
            const rect = pitchRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            const clampedX = Math.max(0, Math.min(100, x));
            const clampedY = Math.max(0, Math.min(100, y));

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setRoster(prev => prev.map(p =>
                    p.id === draggedPlayer ? { ...p, x: clampedX, y: clampedY } : p
                ));
            });
        }
    };

    const handlePointerUp = async () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setDraggedPlayer(null);
        await saveRosterToSupabase(roster);
    };

    const removePlayer = async (id: string) => {
        if (!activeTeam) return;
        const nextRoster = roster.filter(p => p.id !== id);
        setRoster(nextRoster);
        // Supabase'den kadrodan çıkar
        await sbRemovePlayerFromTeam(activeTeam.id, id);
        // Yeni kadro rollerini Supabase'de güncelle
        await saveRosterToSupabase(nextRoster);
    };

    const handleSetInstruction = async (playerId: string, instruction: string) => {
        const nextRoster = roster.map(p => p.id === playerId ? { ...p, instruction } : p);
        setRoster(nextRoster);
        await saveRosterToSupabase(nextRoster);
    };

    // ─── Boş durum: henüz takım yok ───────────────────────────────────────
    if (!activeTeam) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex flex-col">
                <header className="px-6 py-4 flex items-center gap-3 bg-[#161B22]/90 backdrop-blur-md border-b border-white/5">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-black text-white text-lg tracking-tight uppercase">Takımım</h1>
                </header>
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                    <div className="w-24 h-24 rounded-full bg-[#161B22] border border-white/10 flex items-center justify-center mb-6">
                        <Users size={40} className="text-gray-600" />
                    </div>
                    <h2 className="text-xl font-black text-white mb-2">Henüz bir takımın yok</h2>
                    <p className="text-sm text-gray-500 mb-8 max-w-xs">
                        Takımını kur, arkadaşlarını davet et, taktiğini hazırla ve maça çık.
                    </p>
                    <button
                        onClick={() => onNavigate('TEAM_CREATOR')}
                        className="flex items-center gap-2 bg-[#39FF14] text-black px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-sm hover:bg-green-400 transition-colors shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                    >
                        <Plus size={18} /> Takım Kur
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0E14] flex flex-col relative">

            {/* Header */}
            <header className="px-6 py-4 flex justify-between items-center bg-[#161B22]/90 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="font-black text-white text-lg tracking-tight uppercase">{activeTeam.name}</h1>
                        <p className="text-[10px] text-gray-400 font-medium">Taktik Tahtası • Kaptan Modu</p>
                    </div>
                </div>
                <button className="p-2 bg-white/5 rounded-full text-white">
                    <Share2 size={20} />
                </button>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

                {/* Takım Değiştirici + Yeni Takım */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {myTeams.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTeamId(t.id)}
                            className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-colors ${
                                t.id === activeTeam.id
                                    ? 'bg-white text-black border-white'
                                    : 'bg-[#161B22] text-gray-400 border-white/10 hover:border-white/30'
                            }`}
                            style={t.id === activeTeam.id && t.color1 ? { backgroundColor: t.color1, borderColor: t.color1, color: '#fff' } : undefined}
                        >
                            {t.shortName || t.name}
                        </button>
                    ))}
                    <button
                        onClick={() => onNavigate('TEAM_CREATOR')}
                        className="shrink-0 px-3 py-2 rounded-full text-xs font-black border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/50 transition-colors flex items-center gap-1"
                    >
                        <Plus size={12} /> Yeni
                    </button>
                </div>

                {/* Pitch Area */}
                <section>
                    {/* Controls */}
                    <div className="w-full flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                            <button onClick={() => applyFormation('2-3-1')} className="px-3 py-1.5 bg-[#161B22] border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:border-white/30 transition-colors">
                                2-3-1
                            </button>
                            <button onClick={() => applyFormation('3-2-1')} className="px-3 py-1.5 bg-[#161B22] border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:border-white/30 transition-colors">
                                3-2-1
                            </button>
                        </div>
                    </div>

                    {/* Tactical Board */}
                    <div
                        ref={pitchRef}
                        className="relative w-full aspect-[2/3] max-h-[60vh] bg-[#1B4332] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden touch-none"
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        {/* Grass Stripes */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>

                        {/* Markings */}
                        <div className="absolute inset-0 pointer-events-none opacity-40">
                            <svg viewBox="0 0 680 1050" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                <g stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    {/* Dış Çizgiler */}
                                    <rect x="20" y="20" width="640" height="1010" />
                                    {/* Orta Saha Çizgisi */}
                                    <line x1="20" y1="525" x2="660" y2="525" />
                                    {/* Orta Yuvarlak */}
                                    <circle cx="340" cy="525" r="90" />
                                    {/* Başlama Noktası */}
                                    <circle cx="340" cy="525" r="4" fill="white" />

                                    {/* Üst Ceza Sahası */}
                                    <rect x="140" y="20" width="400" height="150" />
                                    {/* Üst Altı Pas */}
                                    <rect x="240" y="20" width="200" height="50" />
                                    {/* Üst Penaltı Noktası */}
                                    <circle cx="340" cy="120" r="4" fill="white" />
                                    {/* Üst Ceza Sahası Yayı */}
                                    <path d="M 270 170 A 90 90 0 0 0 410 170" />

                                    {/* Alt Ceza Sahası */}
                                    <rect x="140" y="880" width="400" height="150" />
                                    {/* Alt Altı Pas */}
                                    <rect x="240" y="980" width="200" height="50" />
                                    {/* Alt Penaltı Noktası */}
                                    <circle cx="340" cy="930" r="4" fill="white" />
                                    {/* Alt Ceza Sahası Yayı */}
                                    <path d="M 270 880 A 90 90 0 0 1 410 880" />

                                    {/* Köşe Yayları */}
                                    <path d="M 20 60 A 40 40 0 0 0 60 20" />
                                    <path d="M 620 20 A 40 40 0 0 0 660 60" />
                                    <path d="M 20 990 A 40 40 0 0 1 60 1030" />
                                    <path d="M 660 1030 A 40 40 0 0 0 620 990" />
                                </g>
                            </svg>
                        </div>

                        {/* Draggable Players */}
                        {roster.map((player) => (
                            <div
                                key={player.id}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing active:scale-110 transition-transform"
                                style={{ left: `${player.x}%`, top: `${player.y}%`, zIndex: (draggedPlayer === player.id) ? 50 : 10 }}
                                onPointerDown={(e) => {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                    setDraggedPlayer(player.id);
                                }}
                            >
                                <div className="flex flex-col items-center gap-1 relative">
                                    <div className={`relative w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden ${draggedPlayer === player.id ? 'ring-4 ring-[#FFFF00]' : ''}`}>
                                        <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap flex flex-col items-center gap-0.5">
                                        <span>{player.name}</span>
                                        {player.instruction && (
                                            <span className="text-[#FFFF00] text-[7px] tracking-widest uppercase font-black">{player.instruction}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Team Stats Summary */}
                <section className="grid grid-cols-3 gap-3">
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Swords className="text-yellow-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{activeTeam.wins ?? 0}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Galibiyet</span>
                    </div>
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Shield className="text-blue-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{activeTeam.losses ?? 0}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Mağlubiyet</span>
                    </div>
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Activity className="text-green-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{roster.length}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Oyuncu</span>
                    </div>
                </section>

                {/* Roster List & Management */}
                <section className="bg-[#161B22] border border-white/5 rounded-[32px] p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-black text-white">Kadro Yönetimi</h3>
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center gap-2 bg-[#FFFF00] text-black px-3 py-1.5 rounded-full text-xs font-bold hover:bg-yellow-300 transition-colors"
                        >
                            <UserPlus size={14} /> Ekle
                        </button>
                    </div>
                    <div className="space-y-3">
                        {roster.map((player) => (
                            <div key={player.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition-colors">
                                <div className="flex items-center gap-3">
                                    <img src={player.avatar} className="w-10 h-10 rounded-full bg-gray-700 object-cover" alt={player.name} />
                                    <div>
                                        <p className="font-bold text-white text-sm">{player.name}</p>
                                        <p className="text-[9px] text-[#39FF14] uppercase tracking-wider font-bold">{player.position || 'OYUNCU'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={player.instruction || ''}
                                        onChange={(e) => handleSetInstruction(player.id, e.target.value)}
                                        className="bg-[#0A0E14] text-[10px] font-bold text-[#FFFF00] border border-white/10 rounded-xl px-2 py-1.5 outline-none focus:border-[#FFFF00] cursor-pointer uppercase tracking-wider transition-all"
                                    >
                                        <option value="" className="text-gray-500">Talimat Yok</option>
                                        <option value="Hücuma Çık">Hücuma Çık</option>
                                        <option value="Geride Kal">Geride Kal</option>
                                        <option value="Serbest">Serbest</option>
                                        <option value="Markaj">Markaj</option>
                                        <option value="Oyun Kurucu">Oyun Kurucu</option>
                                        <option value="Pres Yap">Pres Yap</option>
                                    </select>
                                    <button
                                        onClick={() => removePlayer(player.id)}
                                        className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                        title="Kadrodan Çıkar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </div>

            {/* Invite Modal Overlay */}
            {showInviteModal && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowInviteModal(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-black text-white mb-4">Oyuncu Davet Et</h3>
                        <input type="text" placeholder="Kullanıcı Adı Ara..." className="w-full bg-[#0A0E14] border border-gray-700 rounded-xl p-3 text-white text-sm outline-none focus:border-[#FFFF00] mb-4" />

                        <p className="text-xs text-gray-500 font-bold uppercase mb-2">Rehberden Önerilenler</p>
                        <div className="space-y-2 mb-6">
                            <div className="flex items-center justify-between p-2 bg-[#0A0E14] rounded-xl border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold">A</div>
                                    <span className="text-sm font-bold">Ahmet K.</span>
                                </div>
                                <button className="text-[#FFFF00] text-xs font-bold border border-[#FFFF00] px-2 py-1 rounded-lg hover:bg-[#FFFF00] hover:text-black transition-colors">Davet Et</button>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-[#0A0E14] rounded-xl border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center font-bold">M</div>
                                    <span className="text-sm font-bold">Mehmet Y.</span>
                                </div>
                                <button className="text-[#FFFF00] text-xs font-bold border border-[#FFFF00] px-2 py-1 rounded-lg hover:bg-[#FFFF00] hover:text-black transition-colors">Davet Et</button>
                            </div>
                        </div>

                        <button className="w-full py-3 bg-[#FFFF00] text-black font-black rounded-xl hover:bg-yellow-300">
                            Bağlantı Paylaş
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default MyTeam;
