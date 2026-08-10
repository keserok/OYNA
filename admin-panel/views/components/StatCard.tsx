import React from 'react';
import { motion } from 'framer-motion';

interface StatCardProps {
    label: string;
    value: string | number;
    unit: string;
    color: string;
    data?: number[];
    onClick?: () => void;
    badge?: string;
    badgeColor?: string;
}

const Spark: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min + 1;
    const w = 80, h = 32;
    const pts = data
        .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
        .join(' ');
    return (
        <svg width={w} height={h} className="opacity-80">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
            />
        </svg>
    );
};

export const StatCard: React.FC<StatCardProps> = ({
    label,
    value,
    unit,
    color,
    data,
    onClick,
    badge,
    badgeColor = 'text-green-400 bg-green-500/10 border-green-500/20'
}) => {
    const Component = onClick ? motion.button : motion.div;
    
    return (
        <Component
            onClick={onClick}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            className={`w-full bg-surface-1/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:bg-surface-1/90 hover:border-white/10 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${
                onClick ? 'cursor-pointer text-left' : ''
            }`}
        >
            <div className="flex items-center justify-between w-full">
                <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-widest">
                    {label}
                </span>
                {badge && (
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-lg border uppercase tracking-wider ${badgeColor}`}>
                        {badge}
                    </span>
                )}
            </div>
            
            <div className="my-2.5">
                <span className="text-2xl font-extrabold text-white tracking-tight">{value}</span>
            </div>

            <div className="flex items-end justify-between w-full mt-1">
                <span className="text-[10px] text-gray-600 font-mono font-medium">{unit}</span>
                {data && <Spark data={data} color={color} />}
            </div>
        </Component>
    );
};
