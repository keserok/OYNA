import React, { useState } from 'react';
import { ArrowLeft, Trophy, Calendar, MapPin, Users, ChevronRight, Swords, Plus, Settings, Search, CheckCircle2, ShieldAlert, Info, X, ChevronDown, Save, Play, Edit2, Trash2, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TournamentBracketProps {
  onBack: () => void;
}

type TournamentFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'GROUP_STAGE';
type MatchStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'PENDING';

interface Team {
  id: string;
  name: string;
  logo: string;
  score: number | null;
  penalties?: number;
}

interface Match {
  id: number;
  round: number;
  team1: Team | null;
  team2: Team | null;
  status: MatchStatus;
  date?: string;
  location?: string;
}

interface Tournament {
  id: string;
  name: string;
  status: 'DRAFT' | 'REGISTRATION' | 'ONGOING' | 'COMPLETED';
  format: TournamentFormat;
  participantsCount: number;
  prize: string;
  startDate: string;
  location: string;
  rounds: { id: number; name: string }[];
  matches: Match[];
  registeredTeams: Team[];
}

// Mock Data for available teams to invite
const AVAILABLE_TEAMS: Team[] = [
  { id: 't1', name: 'Boğaziçi FC', logo: '🦁', score: null },
  { id: 't2', name: 'Güney Kampüs SK', logo: '🐂', score: null },
  { id: 't3', name: 'Hisar SK', logo: '🏰', score: null },
  { id: 't4', name: 'Kuzey SK', logo: '🐺', score: null },
  { id: 't5', name: 'Bebek Boys', logo: '🌊', score: null },
  { id: 't6', name: 'Etiler United', logo: '🌆', score: null },
  { id: 't7', name: 'Levent City', logo: '🏢', score: null },
  { id: 't8', name: 'Moda FC', logo: '⚓', score: null },
  { id: 't9', name: 'Kilyos Surf', logo: '🏄', score: null },
  { id: 't10', name: 'Uçaksavar SK', logo: '✈️', score: null },
  { id: 't11', name: 'Kandilli Rasathane', logo: '🔭', score: null },
  { id: 't12', name: 'Sarıyer Martı', logo: '🦅', score: null },
  { id: 't13', name: 'Rumeli Hisarı', logo: '🧱', score: null },
  { id: 't14', name: 'Arnavutköy Akıntı', logo: '🐟', score: null },
  { id: 't15', name: 'Ortaköy Kumpir', logo: '🥔', score: null },
  { id: 't16', name: 'Beşiktaş Kartalları', logo: '🦅', score: null },
];

const TournamentBracket: React.FC<TournamentBracketProps> = ({ onBack }) => {
  const [viewState, setViewState] = useState<'LIST' | 'CREATE' | 'MANAGE' | 'BRACKET'>('LIST');
  const [activeRound, setActiveRound] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Form States for Creation
  const [newTournament, setNewTournament] = useState<Partial<Tournament>>({
    name: '',
    format: 'SINGLE_ELIMINATION',
    participantsCount: 8,
    prize: '',
    startDate: '',
    location: '',
    registeredTeams: []
  });

  // Mock Tournaments List
  const [tournaments, setTournaments] = useState<Tournament[]>([
    {
      id: 'tour1',
      name: 'Boğaziçi Güz Kupası',
      status: 'ONGOING',
      format: 'SINGLE_ELIMINATION',
      participantsCount: 16,
      prize: '10.000₺ + Kupa',
      startDate: '2023-10-12',
      location: 'Güney Kampüs Saha',
      rounds: [
        { id: 1, name: 'Son 16' },
        { id: 2, name: 'Çeyrek Final' },
        { id: 3, name: 'Yarı Final' },
        { id: 4, name: 'Final' }
      ],
      registeredTeams: AVAILABLE_TEAMS,
      matches: [
        { id: 101, round: 1, team1: { ...AVAILABLE_TEAMS[0], score: 3 }, team2: { ...AVAILABLE_TEAMS[1], score: 1 }, status: 'COMPLETED', date: '12 Eki' },
        { id: 102, round: 1, team1: { ...AVAILABLE_TEAMS[2], score: 2, penalties: 4 }, team2: { ...AVAILABLE_TEAMS[3], score: 2, penalties: 5 }, status: 'COMPLETED', date: '12 Eki' },
        { id: 103, round: 1, team1: { ...AVAILABLE_TEAMS[4], score: null }, team2: { ...AVAILABLE_TEAMS[5], score: null }, status: 'UPCOMING', date: '14 Eki, 21:00' },
        { id: 104, round: 1, team1: { ...AVAILABLE_TEAMS[6], score: null }, team2: { ...AVAILABLE_TEAMS[7], score: null }, status: 'UPCOMING', date: '14 Eki, 22:00' },
        { id: 201, round: 2, team1: { ...AVAILABLE_TEAMS[0], score: null }, team2: { ...AVAILABLE_TEAMS[3], score: null }, status: 'UPCOMING', date: '18 Eki' },
        { id: 202, round: 2, team1: null, team2: null, status: 'PENDING', date: '19 Eki' },
      ]
    }
  ]);

  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);

  // Match Management States
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [matchFormData, setMatchFormData] = useState<Partial<Match>>({});

  const handleSaveMatch = () => {
    if (!activeTournament) return;
    
    let updatedMatches;
    if (editingMatch) {
      updatedMatches = activeTournament.matches.map(m => m.id === editingMatch.id ? { ...m, ...matchFormData } as Match : m);
    } else {
      const newMatch: Match = {
        id: Date.now(),
        round: matchFormData.round || activeRound,
        team1: matchFormData.team1 || null,
        team2: matchFormData.team2 || null,
        status: matchFormData.status || 'UPCOMING',
        date: matchFormData.date,
        location: matchFormData.location,
      };
      updatedMatches = [...activeTournament.matches, newMatch];
    }
    
    const updatedTournament = { ...activeTournament, matches: updatedMatches };
    setActiveTournament(updatedTournament);
    setTournaments(tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t));
    setIsMatchModalOpen(false);
  };

  const handleDeleteMatch = (matchId: number) => {
    if (!activeTournament) return;
    if (!window.confirm('Bu maçı silmek istediğinize emin misiniz?')) return;
    
    const updatedMatches = activeTournament.matches.filter(m => m.id !== matchId);
    const updatedTournament = { ...activeTournament, matches: updatedMatches };
    setActiveTournament(updatedTournament);
    setTournaments(tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t));
  };

  const handleCreateTournament = () => {
    // Generate bracket structure based on participant count
    const roundsCount = Math.log2(newTournament.participantsCount || 8);
    const rounds = Array.from({ length: roundsCount }, (_, i) => {
      const roundNum = i + 1;
      let name = `Tur ${roundNum}`;
      if (roundNum === roundsCount) name = 'Final';
      else if (roundNum === roundsCount - 1) name = 'Yarı Final';
      else if (roundNum === roundsCount - 2) name = 'Çeyrek Final';
      return { id: roundNum, name };
    });

    const created: Tournament = {
      id: `tour_${Date.now()}`,
      name: newTournament.name || 'İsimsiz Turnuva',
      status: 'DRAFT',
      format: newTournament.format as TournamentFormat,
      participantsCount: newTournament.participantsCount || 8,
      prize: newTournament.prize || '-',
      startDate: newTournament.startDate || '-',
      location: newTournament.location || '-',
      rounds,
      registeredTeams: newTournament.registeredTeams || [],
      matches: [] // Matches will be generated when tournament starts
    };

    setTournaments([created, ...tournaments]);
    setActiveTournament(created);
    setViewState('MANAGE');
  };

  const toggleTeamRegistration = (team: Team) => {
    if (!activeTournament) return;
    
    const isRegistered = activeTournament.registeredTeams.some(t => t.id === team.id);
    let updatedTeams;
    
    if (isRegistered) {
      updatedTeams = activeTournament.registeredTeams.filter(t => t.id !== team.id);
    } else {
      if (activeTournament.registeredTeams.length >= activeTournament.participantsCount) return; // Full
      updatedTeams = [...activeTournament.registeredTeams, team];
    }

    const updatedTournament = { ...activeTournament, registeredTeams: updatedTeams };
    setActiveTournament(updatedTournament);
    setTournaments(tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t));
  };

  const generateBracket = () => {
    if (!activeTournament) return;
    
    // Simple random seeding for demonstration
    const shuffledTeams = [...activeTournament.registeredTeams].sort(() => 0.5 - Math.random());
    const matches: Match[] = [];
    let matchIdCounter = 100;

    // Generate Round 1 matches
    for (let i = 0; i < activeTournament.participantsCount; i += 2) {
      matches.push({
        id: matchIdCounter++,
        round: 1,
        team1: shuffledTeams[i] || null,
        team2: shuffledTeams[i + 1] || null,
        status: (shuffledTeams[i] && shuffledTeams[i+1]) ? 'UPCOMING' : 'PENDING'
      });
    }

    // Generate subsequent rounds (empty slots)
    for (let r = 2; r <= activeTournament.rounds.length; r++) {
      const matchesInRound = activeTournament.participantsCount / Math.pow(2, r);
      for (let i = 0; i < matchesInRound; i++) {
        matches.push({
          id: matchIdCounter++,
          round: r,
          team1: null,
          team2: null,
          status: 'PENDING'
        });
      }
    }

    const updatedTournament = { 
      ...activeTournament, 
      status: 'ONGOING' as const,
      matches 
    };
    
    setActiveTournament(updatedTournament);
    setTournaments(tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t));
    setViewState('BRACKET');
    setActiveRound(1);
  };

  const renderListView = () => (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-black italic">Turnuvalar</h2>
        </div>
        <button 
          onClick={() => setViewState('CREATE')}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> Yeni Oluştur
        </button>
      </div>

      <div className="space-y-4">
        {tournaments.map(tour => (
          <div 
            key={tour.id} 
            onClick={() => {
              setActiveTournament(tour);
              setViewState(tour.status === 'DRAFT' || tour.status === 'REGISTRATION' ? 'MANAGE' : 'BRACKET');
            }}
            className="bg-[#161B22] border border-white/10 rounded-2xl p-5 cursor-pointer hover:border-emerald-500/50 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-black text-white group-hover:text-emerald-400 transition-colors">{tour.name}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <Calendar size={12} /> {tour.startDate}
                  <span className="text-slate-600">•</span>
                  <MapPin size={12} /> {tour.location}
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                tour.status === 'ONGOING' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                tour.status === 'DRAFT' ? 'bg-slate-500/20 text-slate-400 border-slate-500/30' :
                'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {tour.status === 'ONGOING' ? 'DEVAM EDİYOR' : tour.status === 'DRAFT' ? 'TASLAK' : 'TAMAMLANDI'}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Format</span>
                <span className="text-sm font-medium text-slate-300">
                  {tour.format === 'SINGLE_ELIMINATION' ? 'Tek Maç Eleme' : 'Grup + Eleme'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Takımlar</span>
                <span className="text-sm font-medium text-slate-300">{tour.registeredTeams.length} / {tour.participantsCount}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Ödül</span>
                <span className="text-sm font-medium text-amber-400">{tour.prize}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCreateView = () => (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setViewState('LIST')} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-black italic">Yeni Turnuva Oluştur</h2>
      </div>

      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Basic Info */}
        <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Settings size={16} /> Temel Ayarlar
          </h3>
          
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">Turnuva Adı</label>
            <input 
              type="text" 
              value={newTournament.name}
              onChange={(e) => setNewTournament({...newTournament, name: e.target.value})}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Örn: Güz Kupası 2024"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Format</label>
              <div className="relative">
                <select 
                  value={newTournament.format}
                  onChange={(e) => setNewTournament({...newTournament, format: e.target.value as TournamentFormat})}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="SINGLE_ELIMINATION">Tek Maç Eleme</option>
                  <option value="DOUBLE_ELIMINATION">Çift Maç Eleme</option>
                  <option value="GROUP_STAGE">Grup Aşaması + Eleme</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Takım Sayısı</label>
              <div className="relative">
                <select 
                  value={newTournament.participantsCount}
                  onChange={(e) => setNewTournament({...newTournament, participantsCount: parseInt(e.target.value)})}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value={4}>4 Takım</option>
                  <option value={8}>8 Takım</option>
                  <option value={16}>16 Takım</option>
                  <option value={32}>32 Takım</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-[#161B22] border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Info size={16} /> Detaylar
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Başlangıç Tarihi</label>
              <input 
                type="date" 
                value={newTournament.startDate}
                onChange={(e) => setNewTournament({...newTournament, startDate: e.target.value})}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Konum / Saha</label>
              <input 
                type="text" 
                value={newTournament.location}
                onChange={(e) => setNewTournament({...newTournament, location: e.target.value})}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Örn: Merkez Saha"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2">Ödül Havuzu</label>
            <input 
              type="text" 
              value={newTournament.prize}
              onChange={(e) => setNewTournament({...newTournament, prize: e.target.value})}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Örn: 10.000₺ + Kupa"
            />
          </div>
        </div>

        <button 
          onClick={handleCreateTournament}
          disabled={!newTournament.name}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-lg"
        >
          <Save size={20} /> Turnuvayı Kaydet ve Takım Ekle
        </button>
      </div>
    </div>
  );

  const renderManageView = () => {
    if (!activeTournament) return null;
    const isFull = activeTournament.registeredTeams.length >= activeTournament.participantsCount;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Manage Header */}
        <div className="p-6 bg-[#161B22] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setViewState('LIST')} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black italic">{activeTournament.name}</h2>
              <p className="text-sm text-slate-400">Takım Kayıt Aşaması</p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-white/5">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase">Kayıtlı Takımlar</span>
              <div className="text-2xl font-black mt-1">
                <span className={isFull ? 'text-emerald-400' : 'text-white'}>{activeTournament.registeredTeams.length}</span>
                <span className="text-slate-600"> / {activeTournament.participantsCount}</span>
              </div>
            </div>
            
            <button 
              onClick={generateBracket}
              disabled={!isFull}
              className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                isFull 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play size={18} /> Kuraları Çek ve Başlat
            </button>
          </div>
        </div>

        {/* Team Selection Area */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex gap-6">
          {/* Available Teams */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-300">Davet Edilebilir Takımlar</h3>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Takım ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500 w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_TEAMS.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())).map(team => {
                const isRegistered = activeTournament.registeredTeams.some(t => t.id === team.id);
                return (
                  <div 
                    key={team.id}
                    onClick={() => toggleTeamRegistration(team)}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isRegistered 
                        ? 'bg-emerald-500/10 border-emerald-500/50' 
                        : 'bg-[#161B22] border-white/5 hover:border-white/20'
                    } ${!isRegistered && isFull ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-xl">
                        {team.logo}
                      </div>
                      <span className="font-bold">{team.name}</span>
                    </div>
                    {isRegistered ? (
                      <CheckCircle2 className="text-emerald-500" />
                    ) : (
                      <Plus className="text-slate-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Teams Sidebar */}
          <div className="w-80 bg-[#161B22] border border-white/10 rounded-2xl p-4 flex flex-col h-full">
            <h3 className="font-bold text-emerald-400 mb-4 flex items-center gap-2">
              <CheckCircle2 size={18} /> Onaylanan Takımlar
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              <AnimatePresence>
                {activeTournament.registeredTeams.map(team => (
                  <motion.div 
                    key={team.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-slate-900 border border-white/5 rounded-lg p-3 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{team.logo}</span>
                      <span className="text-sm font-medium">{team.name}</span>
                    </div>
                    <button 
                      onClick={() => toggleTeamRegistration(team)}
                      className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                ))}
                {activeTournament.registeredTeams.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Henüz takım eklenmedi.
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBracketView = () => {
    if (!activeTournament) return null;
    const currentRoundMatches = activeTournament.matches.filter(m => m.round === activeRound);

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="pt-12 pb-6 px-6 bg-slate-900 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setViewState('LIST')} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6 text-slate-300" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              DEVAM EDİYOR
            </div>
          </div>

          <h1 className="text-3xl font-black italic tracking-tight mb-2">{activeTournament.name}</h1>
          
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-white/5">
              <Users className="w-4 h-4 text-emerald-400" />
              {activeTournament.participantsCount} Takım
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-white/5">
              <Trophy className="w-4 h-4 text-amber-400" />
              {activeTournament.prize}
            </div>
          </div>
        </div>

        {/* Round Navigation */}
        <div className="px-6 py-4 bg-slate-900/50 border-b border-white/5 overflow-x-auto scrollbar-hide shrink-0">
          <div className="flex gap-2">
            {activeTournament.rounds.map((round) => (
              <button
                key={round.id}
                onClick={() => setActiveRound(round.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  activeRound === round.id 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {round.name}
              </button>
            ))}
          </div>
        </div>

        {/* Bracket Content */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          <motion.div
            key={activeRound}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4 max-w-3xl mx-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-emerald-400">
                {activeTournament.rounds.find(r => r.id === activeRound)?.name} Maçları
              </h3>
              <button 
                onClick={() => {
                  setEditingMatch(null);
                  setMatchFormData({ round: activeRound, status: 'UPCOMING' });
                  setIsMatchModalOpen(true);
                }}
                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <PlusCircle size={16} /> Yeni Maç Ekle
              </button>
            </div>

            {currentRoundMatches.map((match) => (
              <div key={match.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                {/* Match Header */}
                <div className="px-4 py-3 bg-slate-900/80 flex justify-between items-center border-b border-white/5 text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-2"><Swords size={14}/> Maç #{match.id}</span>
                  <div className="flex items-center gap-3">
                    <span className={match.status === 'COMPLETED' ? 'text-slate-500' : 'text-emerald-400'}>
                      {match.date || 'Tarih Bekleniyor'}
                    </span>
                    <div className="flex items-center gap-1 border-l border-white/10 pl-3 ml-1">
                      <button 
                        onClick={() => {
                          setEditingMatch(match);
                          setMatchFormData(match);
                          setIsMatchModalOpen(true);
                        }}
                        className="p-1 hover:text-blue-400 transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteMatch(match.id)}
                        className="p-1 hover:text-rose-400 transition-colors"
                        title="Sil"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Teams */}
                <div className="p-4 space-y-3">
                  {/* Team 1 */}
                  <div className={`flex items-center justify-between ${match.status === 'COMPLETED' && match.team1?.score! > match.team2?.score! ? 'opacity-100' : match.status === 'COMPLETED' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl shadow-inner border border-white/5">
                        {match.team1?.logo || '?'}
                      </div>
                      <span className={`font-bold ${match.team1 ? 'text-white' : 'text-slate-500 italic'}`}>
                        {match.team1?.name || 'TBD'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {match.team1?.penalties && <span className="text-xs text-slate-500">({match.team1.penalties})</span>}
                      <span className="text-2xl font-black text-white w-8 text-center">
                        {match.team1?.score !== null && match.team1?.score !== undefined ? match.team1.score : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                  {/* Team 2 */}
                  <div className={`flex items-center justify-between ${match.status === 'COMPLETED' && match.team2?.score! > match.team1?.score! ? 'opacity-100' : match.status === 'COMPLETED' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl shadow-inner border border-white/5">
                        {match.team2?.logo || '?'}
                      </div>
                      <span className={`font-bold ${match.team2 ? 'text-white' : 'text-slate-500 italic'}`}>
                        {match.team2?.name || 'TBD'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {match.team2?.penalties && <span className="text-xs text-slate-500">({match.team2.penalties})</span>}
                      <span className="text-2xl font-black text-white w-8 text-center">
                        {match.team2?.score !== null && match.team2?.score !== undefined ? match.team2.score : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Area */}
                {match.status === 'UPCOMING' && (
                  <div className="px-4 py-3 bg-slate-900/50 border-t border-white/5 flex justify-end">
                    <button 
                      onClick={() => {
                        setEditingMatch(match);
                        setMatchFormData(match);
                        setIsMatchModalOpen(true);
                      }}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors bg-emerald-500/10 px-3 py-1.5 rounded-lg"
                    >
                      Skor Gir <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            {currentRoundMatches.length === 0 && (
              <div className="text-center py-16 text-slate-500 bg-[#161B22] rounded-2xl border border-white/5">
                <Swords className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-medium">Bu tur için eşleşmeler henüz belli değil.</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
      {viewState === 'LIST' && renderListView()}
      {viewState === 'CREATE' && renderCreateView()}
      {viewState === 'MANAGE' && renderManageView()}
      {viewState === 'BRACKET' && renderBracketView()}

      {/* Match Management Modal */}
      {isMatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900">
              <h3 className="text-lg font-bold text-white">
                {editingMatch ? 'Maçı Düzenle' : 'Yeni Maç Ekle'}
              </h3>
              <button onClick={() => setIsMatchModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
              {/* Teams */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">1. Takım</label>
                  <select 
                    value={matchFormData.team1?.id || ''}
                    onChange={(e) => {
                      const team = AVAILABLE_TEAMS.find(t => t.id === e.target.value) || null;
                      setMatchFormData({...matchFormData, team1: team});
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="">Seçiniz...</option>
                    {AVAILABLE_TEAMS.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">2. Takım</label>
                  <select 
                    value={matchFormData.team2?.id || ''}
                    onChange={(e) => {
                      const team = AVAILABLE_TEAMS.find(t => t.id === e.target.value) || null;
                      setMatchFormData({...matchFormData, team2: team});
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="">Seçiniz...</option>
                    {AVAILABLE_TEAMS.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Score & Status */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-400 mb-2">Durum</label>
                  <select 
                    value={matchFormData.status}
                    onChange={(e) => setMatchFormData({...matchFormData, status: e.target.value as MatchStatus})}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="PENDING">Bekliyor</option>
                    <option value="UPCOMING">Yaklaşan</option>
                    <option value="ONGOING">Canlı</option>
                    <option value="COMPLETED">Tamamlandı</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-400 mb-2">1. Takım Skor</label>
                  <input 
                    type="number" 
                    value={matchFormData.team1?.score ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setMatchFormData({
                        ...matchFormData, 
                        team1: matchFormData.team1 ? { ...matchFormData.team1, score: val } : null
                      });
                    }}
                    disabled={matchFormData.status === 'PENDING' || matchFormData.status === 'UPCOMING'}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-400 mb-2">2. Takım Skor</label>
                  <input 
                    type="number" 
                    value={matchFormData.team2?.score ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setMatchFormData({
                        ...matchFormData, 
                        team2: matchFormData.team2 ? { ...matchFormData.team2, score: val } : null
                      });
                    }}
                    disabled={matchFormData.status === 'PENDING' || matchFormData.status === 'UPCOMING'}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Date & Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">Tarih / Saat</label>
                  <input 
                    type="text" 
                    value={matchFormData.date || ''}
                    onChange={(e) => setMatchFormData({...matchFormData, date: e.target.value})}
                    placeholder="Örn: 14 Eki, 21:00"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">Saha / Konum</label>
                  <input 
                    type="text" 
                    value={matchFormData.location || ''}
                    onChange={(e) => setMatchFormData({...matchFormData, location: e.target.value})}
                    placeholder="Örn: Merkez Saha"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900 flex justify-end gap-3">
              <button 
                onClick={() => setIsMatchModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white transition-colors"
              >
                İptal
              </button>
              <button 
                onClick={handleSaveMatch}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                <Save size={16} /> Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentBracket;
