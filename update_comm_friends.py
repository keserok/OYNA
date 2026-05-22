import re

with open('views/CommunityView.tsx', 'r') as f:
    content = f.read()

# Update imports
content = content.replace("UserPlus, PlusCircle, Search, Hash", "UserPlus, PlusCircle, Search, Hash, Link, Send, Copy, CheckCircle2")

# Add state
state_search = "const [showCreateTeam, setShowCreateTeam] = useState(false);"
state_replace = """const [showCreateTeam, setShowCreateTeam] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeAccepted, setCodeAccepted] = useState(false);
  const myCode = 'OYNA88';
  
  const handleShareLink = () => {
      console.log('Shared link');
  };
  const copyCode = () => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
  };
  const handleCodeSubmit = () => {
      setCodeAccepted(true);
      setTimeout(() => {
          setCodeAccepted(false);
          setCodeInput('');
          setShowAddFriend(false);
      }, 1500);
  };"""
content = content.replace(state_search, state_replace)

# Replace the simple showAddFriend with the rich one
old_add_friend = """            <AnimatePresence>
                {showAddFriend && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-[#161B22]/80 border border-white/10 rounded-2xl p-3 backdrop-blur-xl mb-4 flex items-center gap-2 shadow-xl">
                            <Search className="text-gray-500" size={18} />
                            <input type="text" placeholder="Kullanıcı adı veya ID..." className="flex-1 bg-transparent text-sm font-bold text-white outline-none" />
                            <button className="px-3 py-1.5 bg-white text-black font-black uppercase rounded-lg text-[10px] hover:bg-gray-200 transition-colors">Ara</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>"""

new_add_friend = """            <AnimatePresence>
                {showAddFriend && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-[#161B22]/80 border border-white/10 rounded-3xl p-5 backdrop-blur-xl mb-6 shadow-xl space-y-5">
                            
                            {/* Arkadaş Arama */}
                            <div className="flex items-center gap-3 bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#FFFF00]/50 transition-all">
                                <Search size={18} className="text-gray-500" />
                                <input
                                    type="text" 
                                    placeholder="Kullanıcı adı veya ID ile ara..."
                                    className="bg-transparent flex-1 text-sm text-white outline-none placeholder:text-gray-600 font-medium"
                                />
                                <button className="px-3 py-1.5 bg-[#FFFF00] text-black font-black uppercase rounded-lg text-[10px] hover:bg-yellow-400 transition-colors">Bul</button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {/* Link ile Davet */}
                                <button
                                    onClick={handleShareLink}
                                    className="bg-gradient-to-br from-blue-900/40 to-[#0A0E14] border border-blue-500/20 rounded-xl p-4 flex flex-col items-start gap-3 hover:border-blue-500/40 transition-all group text-left"
                                >
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Link size={18} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">Link ile Davet Et</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Bağlantıyı paylaş</p>
                                    </div>
                                    <div className="w-full bg-blue-500/10 text-blue-400 text-[10px] font-black py-1.5 rounded-lg text-center border border-blue-500/20 flex items-center justify-center gap-1.5 mt-auto">
                                        <Send size={10} /> PAYLAŞ
                                    </div>
                                </button>

                                {/* Özel Kod */}
                                <div className="bg-gradient-to-br from-[#FFFF00]/5 to-[#0A0E14] border border-[#FFFF00]/20 rounded-xl p-4 flex flex-col items-start gap-3">
                                    <div className="w-10 h-10 bg-[#FFFF00]/10 rounded-xl flex items-center justify-center">
                                        <UserPlus size={18} className="text-[#FFFF00]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">Özel Kodun</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Arkadaşına ver</p>
                                    </div>
                                    <button
                                        onClick={copyCode}
                                        className="w-full flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg border border-white/5 hover:border-[#FFFF00]/30 transition-all group/code mt-auto"
                                    >
                                        <span className="font-black text-[#FFFF00] tracking-[0.25em] text-base">{myCode}</span>
                                        <AnimatePresence mode="wait">
                                            {codeCopied
                                                ? <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={14} className="text-green-400" /></motion.span>
                                                : <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Copy size={14} className="text-gray-500 group-hover/code:text-[#FFFF00]" /></motion.span>
                                            }
                                        </AnimatePresence>
                                    </button>
                                </div>
                            </div>

                            {/* Arkadaşının Kodunu Gir */}
                            <div className="bg-[#0A0E14] border border-white/5 rounded-xl p-4 space-y-3">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Arkadaşının Kodunu Gir</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text" maxLength={6} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())}
                                        placeholder="XXXXXX"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-black text-sm tracking-[0.3em] outline-none focus:border-[#FFFF00]/50 transition-all placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-700 uppercase"
                                    />
                                    <button
                                        onClick={handleCodeSubmit}
                                        disabled={codeInput.length < 6}
                                        className="px-5 bg-[#FFFF00] text-black font-black text-xs rounded-lg disabled:opacity-30 hover:bg-yellow-400 transition-all relative overflow-hidden"
                                    >
                                        <AnimatePresence mode="wait">
                                            {codeAccepted
                                                ? <motion.span key="ok" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-1 text-green-800"><Check size={16} />GÖNDERİLDİ</motion.span>
                                                : <motion.span key="btn" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>EKLE</motion.span>
                                            }
                                        </AnimatePresence>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Bekleyen İstekler (Mock) */}
                            <div className="pt-2 border-t border-white/10">
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3">Bekleyen İstekler (1)</p>
                                <div className="flex items-center gap-3 bg-[#0A0E14] border border-red-500/10 rounded-xl p-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-black">E</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">Eren Çelik</p>
                                        <p className="text-[10px] text-gray-500">@erencelik</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="w-8 h-8 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center hover:bg-red-500/20"><X size={14} /></button>
                                        <button className="w-8 h-8 bg-green-500/10 text-green-400 rounded-full flex items-center justify-center hover:bg-green-500/20"><CheckCircle2 size={14} /></button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>"""

content = content.replace(old_add_friend, new_add_friend)

with open('views/CommunityView.tsx', 'w') as f:
    f.write(content)

