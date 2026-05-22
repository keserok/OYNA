import re

with open('views/CommunityView.tsx', 'r') as f:
    content = f.read()

# Add new imports
new_imports = """import { 
  Users, Trophy, ShieldCheck, Mail, Lock, ChevronRight, ArrowLeft,
  ArrowRightLeft, Star, Swords, LayoutDashboard, Sparkles, Activity,
  Calendar, Flame, Medal, Zap, Radio, Crown, Target, TrendingUp, Check, X,
  UserPlus, PlusCircle, Search, Hash
} from 'lucide-react';"""
content = re.sub(r"import \{[\s\S]*?\} from 'lucide-react';", new_imports, content)

# Add mainTab state and new tabs to the component
old_state = "const [activeTab, setActiveTab] = useState<'TEAMS' | 'PLAYERS'>('TEAMS');"
new_state = """const [mainTab, setMainTab] = useState<'COMMUNITIES' | 'TEAMS' | 'FRIENDS'>('COMMUNITIES');
  const [activeTab, setActiveTab] = useState<'TEAMS' | 'PLAYERS'>('TEAMS');

  // Friends State
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState([
    { id: '1', name: 'Caner Kaya', group: 'Lise Tayfası', online: true },
    { id: '2', name: 'Emre Demir', group: 'Üniversite', online: false },
    { id: '3', name: 'Mert Arslan', group: 'İş Arkadaşları', online: true }
  ]);
  const [groups, setGroups] = useState(['Genel', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları']);
  const [selectedGroup, setSelectedGroup] = useState('Genel');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  
  // Create Team State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#39FF14');
"""
content = content.replace(old_state, new_state)

# Replace the Nav row to include main tabs
old_nav = """        {/* Nav row */}
        <div className="flex items-center justify-between mb-5 relative z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
            <ArrowLeft size={18} /> <span className="text-xs font-bold">Geri</span>
          </button>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{onlineCount} Çevrimiçi</span>
          </div>
        </div>"""

new_nav = """        {/* Nav row */}
        <div className="flex items-center justify-between mb-5 relative z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
            <ArrowLeft size={18} /> <span className="text-xs font-bold">Geri</span>
          </button>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{onlineCount} Çevrimiçi</span>
          </div>
        </div>
        
        {/* Main Tabs */}
        <div className="flex bg-black/40 backdrop-blur-md rounded-2xl p-1 border border-white/10 mb-6 relative z-10">
            {[
              { id: 'COMMUNITIES', label: 'Topluluklarım', icon: ShieldCheck },
              { id: 'TEAMS', label: 'Takımlarım', icon: Swords },
              { id: 'FRIENDS', label: 'Arkadaşlarım', icon: Users }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button 
                  key={tab.id}
                  onClick={() => setMainTab(tab.id as any)}
                  className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${mainTab === tab.id ? 'text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {mainTab === tab.id && (
                    <motion.div layoutId="mainNav" className="absolute inset-0 bg-white/10 border border-white/5 rounded-xl" />
                  )}
                  <Icon size={14} className="relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
        </div>"""

content = content.replace(old_nav, new_nav)

# Conditional rendering of the content
# Find the start of Identity block
identity_start = content.find("{/* Identity */}")

# We will wrap the existing content below Identity inside {mainTab === 'COMMUNITIES' && ( ... )}
# Find the end of the scrollable body div
scroll_body_start = content.find("{/* ══ SCROLLABLE BODY ════════════════════════════════════════════════ */}")

# To make it simple, we can just replace everything from Identity to the end of the file
# with a carefully constructed conditional block.
# Actually, the Hero Header has stuff specific to Community (like the community name).
# If the user is on TEAMS or FRIENDS, they shouldn't see "Boğaziçi Üniversitesi".
# Let's move the `Identity`, `Stat pills`, `Live ticker` into the `COMMUNITIES` block.

new_body_logic = """
        {mainTab === 'COMMUNITIES' && (
          <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}}>
            {/* Identity */}
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <motion.div
                animate={{ boxShadow: ['0 0 25px rgba(16,185,129,0.2)', '0 0 50px rgba(16,185,129,0.5)', '0 0 25px rgba(16,185,129,0.2)'] }}
                transition={{ duration: 3.5, repeat: Infinity }}
                className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center border border-emerald-400/30 shadow-2xl flex-shrink-0"
              >
                <Users size={34} className="text-white drop-shadow-lg" />
              </motion.div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-[22px] font-black tracking-tighter italic leading-none">{community.name}</h1>
                  {community.isVerified && (
                    <ShieldCheck size={16} className="text-emerald-400 flex-shrink-0" />
                  )}
                </div>
                <p className="text-emerald-400/60 text-[10px] font-bold tracking-wide">{community.domain}</p>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex gap-2.5 mb-5 relative z-10">
              {[
                { label: 'Üye', val: community.memberCount, Icon: Users, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
                { label: 'Aktif Maç', val: community.activeMatches ?? 2, Icon: Swords, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
                { label: 'FP Ort.', val: '91', Icon: ShieldCheck, color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
              ].map(({ label, val, Icon, color, border, bg }) => (
                <div key={label} className={`flex-1 ${bg} border ${border} rounded-2xl py-2.5 px-2 text-center`}>
                  <Icon size={13} className={`${color} mx-auto mb-1`} />
                  <p className={`text-sm font-black ${color}`}>
                    {typeof val === 'number' ? <AnimNum to={val as number} /> : val}
                  </p>
                  <p className="text-[8px] text-gray-600 font-bold uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>

            {/* Live ticker */}
            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 relative z-10 overflow-hidden">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Radio size={11} className="text-red-400 animate-pulse" />
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">CANLI</span>
              </div>
              <div className="flex-1 h-4 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p key={ticker}
                    initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-[11px] text-gray-400 font-semibold whitespace-nowrap"
                  >
                    <span className="text-white font-black">{LIVE_TICKER[ticker].split(' ').slice(0, 2).join(' ')}</span>
                    {' '}{LIVE_TICKER[ticker].split(' ').slice(2).join(' ')}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
"""

content = content.replace(content[identity_start:scroll_body_start], new_body_logic + "      </div>\n\n      {/* ══ SCROLLABLE BODY ════════════════════════════════════════════════ */}\n")

# Now inject TEAMS and FRIENDS components inside the scrollable body
# I will find the end of `{mainTab === 'COMMUNITIES' && ( ... )}` wrapper. Actually I need to wrap the rest of the file in {mainTab === 'COMMUNITIES' && ( ... )}

body_content_start = content.find("{!isMember && (")
# Wrap the whole scrollable content for communities
scroll_content = content[body_content_start:content.find("</div>\n    </div>\n  );\n};")]
content = content.replace(scroll_content, f"""
        {{mainTab === 'COMMUNITIES' && (
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}}>
            {scroll_content}
          </motion.div>
        )}}
        
        {{mainTab === 'TEAMS' && (
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="px-5 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black italic uppercase tracking-tighter">Takımlarım</h2>
                <button onClick={() => setShowCreateTeam(!showCreateTeam)} className="px-3 py-1.5 bg-[#39FF14]/20 border border-[#39FF14]/50 rounded-xl text-[#39FF14] flex items-center gap-1.5 text-xs font-black uppercase">
                    <PlusCircle size={14} /> Yeni Oluştur
                </button>
            </div>
            
            <AnimatePresence>
                {{showCreateTeam && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-[#161B22]/80 border border-white/10 rounded-3xl p-5 backdrop-blur-xl mb-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Yeni Takım Kur</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Takım Adı</label>
                                    <input type="text" placeholder="Örn: Yenilmezler FC" className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-sm font-black text-white focus:border-[#39FF14] outline-none transition-colors mt-1" />
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {{['#39FF14', '#FF385C', '#3B82F6', '#F59E0B', '#A855F7'].map(color => (
                                        <button key={{color}} className="w-10 h-10 rounded-full border-2 border-white/10" style={{backgroundColor: color}} />
                                    ))}}
                                </div>
                                <button className="w-full py-3 bg-[#39FF14] text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform">
                                    Takımı Oluştur
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}}
            </AnimatePresence>

            <div className="grid gap-3">
                <div className="bg-gradient-to-r from-emerald-900/40 to-[#0A0E14] border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-emerald-500/50 transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-black text-xl shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                            B
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">Boğaziçi Kaplanları</h3>
                            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Kaptansın • 8 Oyuncu</p>
                        </div>
                    </div>
                    <ChevronRight className="text-gray-500" />
                </div>
            </div>
          </motion.div>
        )}}

        {{mainTab === 'FRIENDS' && (
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="px-5 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black italic uppercase tracking-tighter">Arkadaşlarım</h2>
                <button onClick={() => setShowAddFriend(!showAddFriend)} className="px-3 py-1.5 bg-[#FFFF00]/20 border border-[#FFFF00]/50 rounded-xl text-[#FFFF00] flex items-center gap-1.5 text-xs font-black uppercase">
                    <UserPlus size={14} /> Arkadaş Ekle
                </button>
            </div>

            <AnimatePresence>
                {{showAddFriend && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-[#161B22]/80 border border-white/10 rounded-3xl p-4 backdrop-blur-xl mb-4 flex items-center gap-2">
                            <Search className="text-gray-500" size={18} />
                            <input type="text" placeholder="Kullanıcı adı veya ID ile ara..." className="flex-1 bg-transparent text-sm font-bold text-white outline-none" />
                            <button className="px-3 py-1.5 bg-white text-black font-black uppercase rounded-lg text-[10px]">Ara</button>
                        </div>
                    </motion.div>
                )}}
            </AnimatePresence>

            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {{groups.map(group => (
                    <button 
                        key={{group}} 
                        onClick={() => setSelectedGroup(group)}
                        className={{`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${{selectedGroup === group ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}}`}}
                    >
                        {{group}}
                    </button>
                ))}}
                <button className="px-3 py-2 border border-dashed border-white/20 rounded-xl text-gray-500 hover:text-white transition-colors">
                    <PlusCircle size={14} />
                </button>
            </div>

            <div className="grid gap-3">
                {{friends.filter(f => selectedGroup === 'Genel' || f.group === selectedGroup).map(friend => (
                    <div key={{friend.id}} className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-sm">
                                    {{friend.name.charAt(0)}}
                                </div>
                                {{friend.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#39FF14] rounded-full border-2 border-[#0A0E14]" />}}
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white">{{friend.name}}</h4>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <Hash size={10} className="text-gray-500" />
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{{friend.group}}</span>
                                </div>
                            </div>
                        </div>
                        <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                            <ArrowRightLeft size={14} />
                        </button>
                    </div>
                ))}}
            </div>
          </motion.div>
        )}}
""")

with open('views/CommunityView.tsx', 'w') as f:
    f.write(content)

print("Updated CommunityView.tsx with Tabs")
