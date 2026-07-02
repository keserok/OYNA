import React from 'react';
import { motion } from 'framer-motion';
import { Home, Calendar, Users, User, MapPin } from 'lucide-react';
import { AppView } from '../types';

interface BottomNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  const navItems = [
    { id: 'DASHBOARD', icon: Home, label: 'Ana Sayfa' },
    { id: 'MATCH_DISCOVERY', icon: Calendar, label: 'Top Oyna' },
    { id: 'SOCIAL', icon: Users, label: 'Sosyal', isCenter: true },
    { id: 'PITCH_DISCOVERY', icon: MapPin, label: 'Sahalar' },
    { id: 'PROFILE', icon: User, label: 'Profil' },
  ];

  return (
    <nav 
      aria-label="Ana Gezinti"
      role="navigation"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pt-2 pb-safe max-w-lg md:max-w-2xl mx-auto"
    >
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-[#161B22]/80 backdrop-blur-xl border border-white/10 rounded-[32px] px-2 py-2 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as AppView)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className="flex-1 relative -top-6 flex flex-col items-center justify-center group outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161B22] rounded-full min-h-[48px]"
              >
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-colors ${
                    isActive ? 'bg-[#39FF14] text-black' : 'bg-[#0A0E14] border-2 border-[#39FF14] text-[#39FF14]'
                  }`}
                >
                  <Icon size={24} strokeWidth={isActive ? 3 : 2} />
                </motion.div>
                <span className={`text-xs font-black tracking-wide mt-1 transition-colors ${isActive ? 'text-[#39FF14]' : 'text-gray-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as AppView)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 relative group min-h-[48px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              {isActive && (
                <motion.div 
                  layoutId="bottomNavIndicator"
                  className="absolute inset-1 bg-gradient-to-b from-white/10 to-transparent rounded-xl border-t border-white/20"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <Icon 
                  size={20} 
                  className={`transition-colors duration-300 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className={`text-xs font-bold tracking-wide transition-colors duration-300 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </motion.div>
    </nav>
  );
};
