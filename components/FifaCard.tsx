import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export const FifaCard: React.FC = () => {
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

    return (
        <div className="perspective-[1000px] w-full max-w-[260px] mx-auto my-4">
            <motion.div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                animate={{ rotateX, rotateY }}
                transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                className="relative w-full aspect-[1/1.5] cursor-pointer group transform-style-3d shadow-[0_20px_50px_rgba(201,160,60,0.3)]"
                style={{
                    background: 'linear-gradient(135deg, #f3d370 0%, #fff3b0 30%, #d4af37 70%, #aa7c11 100%)',
                    clipPath: 'polygon(15% 0, 85% 0, 100% 15%, 100% 85%, 50% 100%, 0 85%, 0 15%)'
                }}
            >
                {/* Inner Border */}
                <div 
                    className="absolute inset-[3px] border-[1.5px] border-[#fff3b0]/70" 
                    style={{ clipPath: 'polygon(15% 0, 85% 0, 100% 15%, 100% 85%, 50% 100%, 0 85%, 0 15%)' }}
                ></div>

                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-15 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay pointer-events-none"></div>

                {/* Glare Effect */}
                <div 
                    className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 50%)`
                    }}
                />

                {/* Card Content */}
                <div className="absolute inset-0 p-4 flex flex-col text-[#4a3500] z-10">
                    {/* Top Half */}
                    <div className="flex justify-between items-start h-[45%]">
                        <div className="flex flex-col items-center mt-1 ml-1">
                            <span className="text-5xl font-black leading-none tracking-tighter drop-shadow-sm">88</span>
                            <span className="text-sm font-bold mt-0.5 tracking-widest">OOS</span>
                            <img src="https://flagcdn.com/w40/tr.png" alt="TR" className="w-6 h-4 mt-1.5 shadow-sm border border-[#3d2e00]/20" />
                            <div className="w-6 h-6 mt-1.5 bg-[#4a3500] flex items-center justify-center shadow-md">
                                <span className="text-[#fff3b0] text-[10px] font-bold">RB</span>
                            </div>
                        </div>
                        <div className="absolute top-0 right-[-15px] w-[220px] h-[220px] pointer-events-none">
                            {/* Player Image Placeholder - Cutout style */}
                            <img 
                                src="https://i.pravatar.cc/300?img=11" 
                                alt="Player" 
                                className="w-full h-full object-cover drop-shadow-2xl" 
                                style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }} 
                            />
                        </div>
                    </div>

                    {/* Bottom Half */}
                    <div className="flex-1 flex flex-col items-center justify-end pb-3">
                        <h3 className="text-3xl font-black uppercase tracking-widest mb-1 drop-shadow-sm">KEREM</h3>
                        <div className="w-4/5 h-[1.5px] bg-gradient-to-r from-transparent via-[#4a3500]/50 to-transparent mb-2"></div>
                        
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 w-full px-5 text-[13px]">
                            <div className="flex justify-between font-black">
                                <span>85</span><span className="font-medium opacity-80">HIZ</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>86</span><span className="font-medium opacity-80">DRB</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>82</span><span className="font-medium opacity-80">ŞUT</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>45</span><span className="font-medium opacity-80">DEF</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>89</span><span className="font-medium opacity-80">PAS</span>
                            </div>
                            <div className="flex justify-between font-black">
                                <span>78</span><span className="font-medium opacity-80">FİZ</span>
                            </div>
                        </div>
                        <div className="w-12 h-[1.5px] bg-[#4a3500]/40 mt-3 mb-1.5"></div>
                        <span className="text-[9px] font-black tracking-[0.4em] opacity-80">OYNA FC</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
