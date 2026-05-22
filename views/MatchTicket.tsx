
import React from 'react';
import { ArrowLeft, Share2, QrCode, Calendar, Clock, MapPin, ShieldCheck, Download } from 'lucide-react';

interface MatchTicketProps {
  onBack: () => void;
}

const MatchTicket: React.FC<MatchTicketProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-6 relative">
       
       <button 
         onClick={onBack} 
         className="absolute top-6 left-6 p-3 bg-[#161B22] border border-white/10 rounded-full text-white hover:bg-white/10 transition-colors z-20"
       >
           <ArrowLeft size={20} />
       </button>

       <div className="w-full max-w-md animate-in slide-in-from-bottom duration-700">
           {/* Header text */}
           <div className="text-center mb-6">
               <h1 className="text-2xl font-black text-white tracking-tight">MAÇ KARTINIZ</h1>
               <p className="text-gray-400 text-sm">Giriş için turnikede okutunuz.</p>
           </div>

           {/* Ticket Card */}
           <div className="bg-white rounded-[32px] overflow-hidden relative shadow-[0_0_50px_rgba(255,255,255,0.1)]">
               
               {/* Top Section (Visual) */}
               <div className="bg-[#FFFF00] p-6 pb-12 relative">
                   <div className="flex justify-between items-start relative z-10">
                       <div className="bg-black text-[#FFFF00] px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider">
                           ONAYLANDI
                       </div>
                       <ShieldCheck size={24} className="text-black opacity-50" />
                   </div>
                   <div className="mt-4">
                       <h2 className="text-3xl font-black text-black leading-none">ARENA<br/>SPORT</h2>
                       <p className="text-black/60 font-bold text-sm mt-1">Beşiktaş, İstanbul</p>
                   </div>
                   
                   {/* Decorative Circles */}
                   <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/20 rounded-full blur-xl"></div>
               </div>

               {/* Cutout Effect */}
               <div className="relative h-4 bg-white">
                    <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0A0E14] rounded-full"></div>
                    <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0A0E14] rounded-full"></div>
                    <div className="absolute top-1/2 left-4 right-4 h-0.5 border-t-2 border-dashed border-gray-300"></div>
               </div>

               {/* Details Section */}
               <div className="bg-white p-6 pt-2">
                   <div className="grid grid-cols-2 gap-6 mb-6">
                       <div>
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><Calendar size={10} /> TARİH</p>
                           <p className="text-lg font-black text-black">24 Mart</p>
                       </div>
                       <div>
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><Clock size={10} /> SAAT</p>
                           <p className="text-lg font-black text-black">20:00 - 21:00</p>
                       </div>
                       <div>
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><MapPin size={10} /> SAHA</p>
                           <p className="text-lg font-black text-black">Halı Saha 1</p>
                       </div>
                       <div>
                           <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">KAPTAN</p>
                           <p className="text-lg font-black text-black">Burak K.</p>
                       </div>
                   </div>

                   {/* QR Code */}
                   <div className="bg-black p-4 rounded-2xl flex items-center justify-center relative overflow-hidden group cursor-pointer">
                       <QrCode size={120} className="text-white relative z-10" />
                       <div className="absolute inset-0 bg-gradient-to-tr from-[#FFFF00]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                       {/* Scanning Line */}
                       <div className="absolute top-0 left-0 w-full h-1 bg-[#FFFF00] shadow-[0_0_15px_#FFFF00] animate-[scan_2s_linear_infinite]"></div>
                   </div>
                   <p className="text-center text-[10px] text-gray-400 mt-2 font-mono">ID: OYNA-8293-TX</p>
               </div>
           </div>

           {/* Actions */}
           <div className="flex gap-4 mt-8">
               <button className="flex-1 bg-[#161B22] border border-white/10 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
                   <Share2 size={18} /> Paylaş
               </button>
               <button className="flex-1 bg-[#FFFF00] text-black py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-yellow-300 transition-colors shadow-lg shadow-yellow-900/20">
                   <Download size={18} /> Cüzdana Ekle
               </button>
           </div>

       </div>
    </div>
  );
};

export default MatchTicket;
