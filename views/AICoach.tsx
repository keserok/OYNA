
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bot, Send, Sparkles, Trophy, ShieldAlert, Zap } from 'lucide-react';
import { ChatMessage, Team } from '../types';
import { auth } from '../supabaseAuth';
import { fetchMyTeams } from '../services/teamService';
import { LoadingState, ErrorState } from '../components/common/StatusState';

interface AICoachProps {
  onBack: () => void;
}

const AICoach: React.FC<AICoachProps> = ({ onBack }) => {
  const [team, setTeam] = useState<Team | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadTeam = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setTeamError('Oturum bulunamadı.');
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    setTeamError(null);
    try {
      const teams = await fetchMyTeams(uid);
      const myTeam = teams[0] || null;
      setTeam(myTeam);
      if (myTeam) {
        setMessages([{
          id: '1',
          sender: 'AI',
          text: `Merhaba Kaptan! **${myTeam.name}** için analizlerim hazır. Kadronuzda belirgin bir **${myTeam.playStyle}** yapısı görüyorum. Bugün nasıl yardımcı olabilirim?`,
          timestamp: 'Simdi'
        }]);
      } else {
        setTeamError('Önce bir takım kurmalısın.');
      }
    } catch (err) {
      console.error('AICoach fetch:', err);
      setTeamError('Takım bilgisi yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleQuickAction = (action: 'TACTIC' | 'MOTIVATION' | 'WEAKNESS') => {
    let userText = '';
    let aiResponse = '';

    switch (action) {
      case 'TACTIC':
        userText = 'Bize uygun bir taktik öner.';
        aiResponse = `Kadronuzda **Yaratıcı (Can)** ve **Maestro (Burak)** rolleri çok baskın. \n\nÖnerdiğim Diziliş: **2-3-1**\n\n1. **Defans:** Kaya ve Ali (Kaya gibi sağlam) geride çakılı kalmalı.\n2. **Orta Saha:** Mert ve Emre (Çevik) kanatlardan içeri kat etmeli, Can (Yaratıcı) pas dağıtımını üstlenmeli.\n3. **Hücum:** Burak (Maestro) bitirici vuruşlar için ceza sahasında beklemeli.\n\n*Hızlı paslarla rakibi yorun, Maestro'nun liderliğini kullanın.*`;
        break;
      case 'MOTIVATION':
        userText = 'Maç öncesi motivasyon konuşması yap.';
        aiResponse = `Dinleyin Kara Kartallar! Bugün sahaya sadece kazanmak için değil, kim olduğumuzu göstermek için çıkıyoruz.\n\nSizin farkınız tutkunuz. Burak, liderliğini konuştur. Kaya, duvar ol. Mert, rüzgar gibi es.\n\n**Kaybetmek bir seçenek değil, sadece bir ders olabilir. Ama bugün ders alma günü değil, ders verme günü!**`;
        break;
      case 'WEAKNESS':
        userText = 'Zayıf yönlerimiz neler?';
        aiResponse = `Analizlerime göre:\n\n1. **Defansif Derinlik:** Defans oyuncularınız yorulursa yedek rotasyonunuz kısıtlı.\n2. **Geri Dönüşler:** Çevik rolündeki oyuncularınız (Mert, Emre) hücuma çok çıkıyor, kontratak yiyebilirsiniz.\n\n*Çözüm: Can (Yaratıcı) top rakipteyken daha defansif pozisyon almalı.*`;
        break;
    }

    // Add User Message
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'USER',
      text: userText,
      timestamp: 'Simdi'
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate AI Delay
    setTimeout(() => {
      setIsTyping(false);
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'AI',
        text: aiResponse,
        timestamp: 'Simdi'
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 2000);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0A0E14]">
      {/* Header */}
      <header className="p-4 pt-safe bg-[#161B22] border-b border-white/5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Bot size={20} className="text-white" />
             </div>
             <div>
               <h1 className="font-bold text-white text-sm">AI Takım Koçu</h1>
               <div className="flex items-center gap-1.5">
                 <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                 <span className="text-[10px] text-gray-400">Gemini Powered</span>
               </div>
             </div>
          </div>
        </div>
        <button className="text-gray-500">
            <Sparkles size={20} />
        </button>
      </header>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {teamLoading ? (
          <LoadingState message="Takım yükleniyor..." />
        ) : teamError ? (
          <ErrorState message={teamError} onRetry={loadTeam} />
        ) : (
        <>
        <div className="text-center py-4">
           <span className="text-[10px] bg-white/5 text-gray-500 px-3 py-1 rounded-full">Bugün, 14:30</span>
        </div>

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
             <div className={`max-w-[85%] rounded-2xl p-4 ${
               msg.sender === 'USER' 
                 ? 'bg-[#FFFF00] text-black rounded-tr-none' 
                 : 'bg-[#161B22] text-gray-200 border border-white/5 rounded-tl-none'
             }`}>
                {msg.sender === 'AI' && (
                    <div className="flex items-center gap-2 mb-2 text-indigo-400 text-xs font-bold uppercase tracking-widest">
                        <Bot size={12} /> Koç Analizi
                    </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-line">
                    {/* Simple parser for bold text in simulation */}
                    {msg.text.split('**').map((part, i) => 
                        i % 2 === 1 ? <span key={i} className="font-black">{part}</span> : part
                    )}
                </p>
                <p className={`text-[10px] mt-2 text-right ${msg.sender === 'USER' ? 'text-black/50' : 'text-gray-600'}`}>
                    {msg.timestamp}
                </p>
             </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
             <div className="bg-[#161B22] border border-white/5 rounded-2xl rounded-tl-none p-4 flex gap-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
             </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Quick Actions / Input */}
      <div className="p-4 bg-[#161B22] border-t border-white/5">
         {!isTyping && !teamLoading && !teamError && (
             <div className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar">
                <button 
                  onClick={() => handleQuickAction('TACTIC')}
                  className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-colors"
                >
                    <Trophy size={14} className="text-yellow-400" /> Taktik Ver
                </button>
                <button 
                  onClick={() => handleQuickAction('WEAKNESS')}
                  className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-colors"
                >
                    <ShieldAlert size={14} className="text-red-400" /> Zayıf Yönler
                </button>
                <button 
                  onClick={() => handleQuickAction('MOTIVATION')}
                  className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-colors"
                >
                    <Zap size={14} className="text-blue-400" /> Motivasyon
                </button>
             </div>
         )}

         <div className="relative">
            <input 
              type="text" 
              placeholder="Koç'a bir şey sor..." 
              className="w-full bg-[#0A0E14] text-white rounded-2xl pl-4 pr-12 py-4 border border-white/10 focus:border-[#FFFF00] outline-none text-sm transition-colors"
              disabled={isTyping || teamLoading || !!teamError}
            />
            <button disabled={isTyping || teamLoading || !!teamError} className="absolute right-2 top-2 p-2 bg-[#FFFF00] text-black rounded-xl hover:bg-yellow-300 transition-colors disabled:opacity-50">
                <Send size={18} />
            </button>
         </div>
      </div>
    </div>
  );
};

export default AICoach;
