import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface FifaCardProps {
    rating: number;
    role: string;
    name: string;
    avatar: string;
    isElite?: boolean;
    stats: {
        label1: string; val1: number;
        label2: string; val2: number;
        label3: string; val3: number;
        label4: string; val4: number;
        label5: string; val5: number;
        label6: string; val6: number;
    };
    clubName?: string;
}

export const FifaCard: React.FC<FifaCardProps> = ({
    rating,
    role,
    name,
    avatar,
    isElite = false,
    stats,
    clubName = 'OYNA FC'
}) => {
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const [glareX, setGlareX] = useState(50);
    const [glareY, setGlareY] = useState(50);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateXValue = ((y - centerY) / centerY) * -15; // Max 15 deg
        const rotateYValue = ((x - centerX) / centerX) * 15;
        
        setRotateX(rotateXValue);
        setRotateY(rotateYValue);
        setGlareX((x / rect.width) * 100);
        setGlareY((y / rect.height) * 100);
    };

    const handleMouseLeave = () => {
        setRotateX(0);
        setRotateY(0);
        setGlareX(50);
        setGlareY(50);
    };

    // Dinamik Kart Teması Belirleme
    const getCardStyle = () => {
        if (role === 'REFEREE') {
            return {
                background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 40%, #1d4ed8 75%, #172554 100%)', // Neon Mavi Hakem
                textColor: 'text-blue-100',
                labelColor: 'text-blue-300',
                border: 'border-blue-400/50',
                glow: 'shadow-[0_20px_50px_rgba(59,130,246,0.35)]',
                accentBg: 'bg-blue-900/60 text-blue-200'
            };
        }
        if (role === 'GOALKEEPER') {
            return {
                background: 'linear-gradient(135deg, #064e3b 0%, #10b981 40%, #047857 75%, #022c22 100%)', // Neon Yeşil Kaleci
                textColor: 'text-emerald-100',
                labelColor: 'text-emerald-300',
                border: 'border-emerald-400/50',
                glow: 'shadow-[0_20px_50px_rgba(16,185,129,0.35)]',
                accentBg: 'bg-emerald-900/60 text-emerald-200'
            };
        }
        // Oyuncu Tiers (Gold, Silver, Bronze veya Elite)
        if (isElite || rating >= 4.5) {
            return {
                background: 'linear-gradient(135deg, #f3d370 0%, #fff3b0 30%, #d4af37 70%, #aa7c11 100%)', // Altın
                textColor: 'text-[#3d2e00]',
                labelColor: 'text-[#4a3500]/70',
                border: 'border-[#fff3b0]/70',
                glow: 'shadow-[0_20px_50px_rgba(212,175,55,0.35)]',
                accentBg: 'bg-[#4a3500]/15 text-[#3d2e00]'
            };
        } else if (rating >= 3.5) {
            return {
                background: 'linear-gradient(135deg, #9ca3af 0%, #e5e7eb 40%, #6b7280 75%, #374151 100%)', // Gümüş
                textColor: 'text-gray-900',
                labelColor: 'text-gray-700',
                border: 'border-white/55',
                glow: 'shadow-[0_20px_50px_rgba(156,163,175,0.25)]',
                accentBg: 'bg-gray-800/10 text-gray-950'
            };
        } else {
            return {
                background: 'linear-gradient(135deg, #78350f 0%, #b45309 40%, #92400e 75%, #451a03 100%)', // Bronz
                textColor: 'text-orange-100',
                labelColor: 'text-orange-300/80',
                border: 'border-orange-400/30',
                glow: 'shadow-[0_20px_50px_rgba(180,83,9,0.2)]',
                accentBg: 'bg-amber-950/40 text-orange-200'
            };
        }
    };

    const theme = getCardStyle();
    
    // Rating 100'lük sisteme yuvarlama
    const displayRating = rating <= 5 ? Math.round(rating * 20) : rating;

    // Rol kısaltması
    const getRoleAbbr = () => {
        if (role === 'REFEREE') return 'REF';
        if (role === 'GOALKEEPER') return 'GK';
        if (role === 'CAPTAIN') return 'CPT';
        return 'PLY';
    };

    return (
        <div className="perspective-[1000px] w-full max-w-[250px] mx-auto my-3">
            <motion.div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                animate={{ rotateX, rotateY }}
                transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                className={`relative w-full aspect-[1/1.5] cursor-pointer group transform-style-3d ${theme.glow}`}
                style={{
                    background: theme.background,
                    clipPath: 'polygon(15% 0, 85% 0, 100% 15%, 100% 85%, 50% 100%, 0 85%, 0 15%)'
                }}
            >
                {/* Inner Border */}
                <div 
                    className={`absolute inset-[3px] border-[1.5px] ${theme.border}`} 
                    style={{ clipPath: 'polygon(15% 0, 85% 0, 100% 15%, 100% 85%, 50% 100%, 0 85%, 0 15%)' }}
                ></div>

                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay pointer-events-none"></div>

                {/* Glare Effect */}
                <div 
                    className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-80 transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 60%)`
                    }}
                />

                {/* Card Content */}
                <div className={`absolute inset-0 p-4 flex flex-col ${theme.textColor} z-10 select-none`}>
                    {/* Top Half */}
                    <div className="flex justify-between items-start h-[45%]">
                        <div className="flex flex-col items-center mt-1 ml-1">
                            <span className="text-4xl font-black leading-none tracking-tighter drop-shadow">{displayRating}</span>
                            <span className="text-[10px] font-black mt-0.5 tracking-wider uppercase opacity-90">{getRoleAbbr()}</span>
                            <img src="https://flagcdn.com/w40/tr.png" alt="TR" className="w-5 h-3.5 mt-1.5 shadow-sm rounded-sm border border-black/10" />
                            {isElite && (
                                <div className={`px-1 py-0.5 rounded text-[8px] font-black mt-2 uppercase shadow-sm ${theme.accentBg}`}>
                                    ELITE
                                </div>
                            )}
                        </div>
                        <div className="absolute top-2 right-[-10px] w-[180px] h-[180px] pointer-events-none">
                            <img 
                                src={avatar || "https://i.pravatar.cc/300?img=11"} 
                                alt={name} 
                                className="w-full h-full object-cover drop-shadow-lg" 
                                style={{ 
                                    WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', 
                                    maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' 
                                }} 
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://i.pravatar.cc/300?img=11";
                                }}
                            />
                        </div>
                    </div>

                    {/* Bottom Half */}
                    <div className="flex-1 flex flex-col items-center justify-end pb-3">
                        <h3 className="text-xl font-black uppercase tracking-wider mb-1 drop-shadow-sm truncate max-w-full text-center">
                            {name.split(' ')[0] || 'OYUNCU'}
                        </h3>
                        <div className="w-4/5 h-[1px] bg-current opacity-30 mb-2"></div>
                        
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 w-full px-4 text-[11px] leading-tight">
                            <div className="flex justify-between font-black">
                                <span>{stats.val1}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label1}</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>{stats.val2}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label2}</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>{stats.val3}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label3}</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>{stats.val4}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label4}</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>{stats.val5}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label5}</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>{stats.val6}</span><span className={`font-bold text-[9px] opacity-75 ${theme.labelColor}`}>{stats.label6}</span>
                            </div>
                        </div>
                        <div className="w-10 h-[1px] bg-current opacity-20 mt-2 mb-1"></div>
                        <span className="text-[7px] font-black tracking-[0.3em] opacity-80">{clubName}</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

