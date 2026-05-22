
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Phone, MoreVertical, Image as ImageIcon, Mic } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatScreenProps {
  onBack: () => void;
  targetName?: string;
  targetRole?: string;
  targetAvatar?: string;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ 
  onBack, 
  targetName = "Arena Sport Center", 
  targetRole = "Tesis Sahibi",
  targetAvatar = "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=200"
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', sender: 'OWNER', text: 'Merhaba Burak Bey, rezervasyonunuz onaylandı. Ekipman talebinizi aldık.', timestamp: '10:30' },
    { id: '2', sender: 'USER', text: 'Teşekkürler, otopark durumu nedir?', timestamp: '10:32' },
    { id: '3', sender: 'OWNER', text: 'Arka tarafta oyunculara özel ücretsiz otoparkımız mevcut.', timestamp: '10:33' },
  ]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'USER',
      text: inputText,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, newMsg]);
    setInputText('');

    // Simulate Owner Reply
    setTimeout(() => {
        const replyMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'OWNER',
            text: 'Tamamdır, görüşmek üzere!',
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, replyMsg]);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0E14]">
      
      {/* Header */}
      <header className="px-4 py-4 bg-[#161B22]/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
                <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
                <div className="relative">
                    <img src={targetAvatar} className="w-10 h-10 rounded-full object-cover border border-white/10" alt={targetName} />
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#161B22]"></div>
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm">{targetName}</h3>
                    <p className="text-[10px] text-gray-400">{targetRole}</p>
                </div>
            </div>
        </div>
        <div className="flex gap-2 text-gray-400">
            <button className="p-2 hover:bg-white/5 rounded-full"><Phone size={20} /></button>
            <button className="p-2 hover:bg-white/5 rounded-full"><MoreVertical size={20} /></button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-fixed">
         {messages.map((msg) => {
             const isMe = msg.sender === 'USER';
             return (
                 <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                         isMe 
                         ? 'bg-[#FFFF00] text-black rounded-tr-none shadow-lg shadow-yellow-900/20' 
                         : 'bg-[#161B22] text-white border border-white/10 rounded-tl-none shadow-lg'
                     }`}>
                         <p className="text-sm font-medium">{msg.text}</p>
                         <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMe ? 'justify-end text-black/60' : 'text-gray-500'}`}>
                             {msg.timestamp}
                             {isMe && <span>• Okundu</span>}
                         </div>
                     </div>
                 </div>
             );
         })}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#161B22] border-t border-white/5">
          <div className="flex items-center gap-2">
              <button className="p-3 text-gray-400 hover:text-white bg-white/5 rounded-xl transition-colors">
                  <ImageIcon size={20} />
              </button>
              <div className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl flex items-center px-4">
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Mesaj yaz..." 
                    className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-gray-600"
                  />
                  <button className="text-gray-500 hover:text-white"><Mic size={20} /></button>
              </div>
              <button 
                onClick={handleSend}
                className={`p-3 rounded-xl transition-all ${
                    inputText.trim() 
                    ? 'bg-[#FFFF00] text-black hover:scale-105 active:scale-95 shadow-lg shadow-yellow-900/20' 
                    : 'bg-white/5 text-gray-500'
                }`}
              >
                  <Send size={20} />
              </button>
          </div>
      </div>

    </div>
  );
};

export default ChatScreen;
