
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, Music2, Trophy, MoreHorizontal, Play, Download } from 'lucide-react';

interface FeedItem {
  id: string;
  videoUrl: string; // Simulated with mock data
  poster: string;
  user: string;
  avatar: string;
  description: string;
  location: string;
  time: string;
  likes: number;
  comments: number;
  shares: number;
  isMotm: boolean;
}

const FEED_DATA: FeedItem[] = [
  {
    id: '1',
    videoUrl: 'https://cdn.coverr.co/videos/coverr-playing-soccer-2248/1080p.mp4', // Placeholder free stock video
    poster: 'https://images.unsplash.com/photo-1518605348406-6992f9f4d7b2?auto=format&fit=crop&q=80&w=1080',
    user: 'MehmetKaptan90',
    avatar: 'https://i.pravatar.cc/150?u=kaptan',
    description: '😱 YOK ARTIK! Son saniye golüyle maçı aldık! #Comeback #ArenaBesiktas',
    location: 'Arena Beşiktaş',
    time: 'Dün Gece',
    likes: 1240,
    comments: 85,
    shares: 120,
    isMotm: true
  },
  {
    id: '2',
    videoUrl: 'https://cdn.coverr.co/videos/coverr-goalkeeper-defending-a-goal-2253/1080p.mp4',
    poster: 'https://images.unsplash.com/photo-1624880357913-a8539238245b?auto=format&fit=crop&q=80&w=1080',
    user: 'KediKaleci',
    avatar: 'https://i.pravatar.cc/150?u=gk1',
    description: '🧤 Uçarak kurtardım! Kimse geçemez. #Goalkeeper #Save',
    location: 'Kadıköy Park',
    time: '2 saat önce',
    likes: 890,
    comments: 42,
    shares: 35,
    isMotm: false
  },
  {
    id: '3',
    videoUrl: 'https://cdn.coverr.co/videos/coverr-soccer-training-4749/1080p.mp4',
    poster: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=1080',
    user: 'TeknikCan',
    avatar: 'https://i.pravatar.cc/150?u=can',
    description: 'Antrenmanlara devam. Bilekler ısınsın. 🔥',
    location: 'Florya Tesisleri',
    time: 'Bugün',
    likes: 560,
    comments: 12,
    shares: 8,
    isMotm: false
  }
];

interface OynaTvProps {
  onBack: () => void;
  onNavigate?: (view: any) => void;
}

const OynaTv: React.FC<OynaTvProps> = ({ onBack, onNavigate }) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (containerRef.current) {
      const scrollPosition = containerRef.current.scrollTop;
      const height = containerRef.current.clientHeight;
      const index = Math.round(scrollPosition / height);
      if (index !== currentVideoIndex) {
        setCurrentVideoIndex(index);
      }
    }
  };

  const handleDownload = () => {
      // Simulate checking for PRO status (Assume false for demo to show upsell)
      const isPro = false; 
      if (!isPro) {
          // No op or simple alert if hoca is removed
          alert("Bu özellik PRO üyelere özeldir.");
      } else {
          // Download logic
          alert("İndiriliyor...");
      }
  };

  return (
    <div className="h-screen bg-black relative">
      
      {/* Top Bar (Absolute) */}
      <div className="absolute top-0 left-0 w-full z-50 p-6 flex justify-between items-center pointer-events-none">
        <button 
            onClick={onBack} 
            className="pointer-events-auto p-3 bg-black/20 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/40 transition-colors"
        >
            <ArrowLeft size={24} />
        </button>
        <h1 className="font-black text-lg text-white drop-shadow-md tracking-wider flex items-center gap-1">
            OYNA <span className="text-[#FFFF00]">TV</span>
        </h1>
        <div className="w-10"></div> {/* Spacer for alignment */}
      </div>

      {/* Video Feed Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory custom-scrollbar scroll-smooth"
      >
        {FEED_DATA.map((item, index) => (
            <VideoCard 
                key={item.id} 
                item={item} 
                isActive={index === currentVideoIndex}
                onDownload={handleDownload}
            />
        ))}
      </div>
    </div>
  );
};

const VideoCard: React.FC<{ item: FeedItem; isActive: boolean; onDownload: () => void }> = ({ item, isActive, onDownload }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(item.likes);
    const [showHeartAnim, setShowHeartAnim] = useState(false);

    useEffect(() => {
        if (isActive && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(e => console.log("Autoplay prevented", e));
        } else if (videoRef.current) {
            videoRef.current.pause();
        }
    }, [isActive]);

    const handleLike = () => {
        if (!isLiked) {
            setLikeCount(prev => prev + 1);
            setShowHeartAnim(true);
            setTimeout(() => setShowHeartAnim(false), 1000);
        } else {
            setLikeCount(prev => prev - 1);
        }
        setIsLiked(!isLiked);
    };

    return (
        <div className="h-screen w-full snap-start relative bg-gray-900 overflow-hidden flex items-center justify-center">
            
            {/* Video Player */}
            <video
                ref={videoRef}
                src={item.videoUrl}
                poster={item.poster}
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
            />

            {/* Simulated "Live" Rain/Atmosphere Effect for specific scenario */}
            {item.id === '1' && (
                <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay"></div>
            )}

            {/* Like Animation Overlay */}
            {showHeartAnim && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 animate-in zoom-in fade-out duration-700">
                    <Heart size={120} className="text-[#FFFF00] fill-[#FFFF00] drop-shadow-[0_0_30px_rgba(255,255,0,0.5)]" />
                </div>
            )}

            {/* Bottom Gradient Overlay */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"></div>

            {/* MOTM Tag */}
            {item.isMotm && (
                <div className="absolute top-24 left-4 z-30 pointer-events-none animate-pulse">
                    <div className="bg-[#FFFF00] text-black px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1 shadow-[0_0_20px_rgba(255,255,0,0.6)] transform -rotate-2">
                        <Trophy size={14} fill="black" /> MAÇIN ADAMI
                    </div>
                </div>
            )}

            {/* Right Sidebar Actions */}
            <div className="absolute bottom-24 right-4 z-40 flex flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-1">
                    <div className="relative">
                        <img src={item.avatar} className="w-12 h-12 rounded-full border-2 border-white object-cover" />
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#FFFF00] w-5 h-5 rounded-full flex items-center justify-center border-2 border-black">
                            <span className="text-black font-bold text-lg leading-none">+</span>
                        </div>
                    </div>
                </div>

                <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
                    <div className={`p-3 rounded-full bg-white/10 backdrop-blur-sm transition-all active:scale-90 ${isLiked ? 'text-[#FFFF00]' : 'text-white'}`}>
                        <Heart size={28} className={isLiked ? "fill-[#FFFF00]" : ""} />
                    </div>
                    <span className="text-xs font-bold text-white shadow-black drop-shadow-md">{likeCount}</span>
                </button>

                <button className="flex flex-col items-center gap-1 group">
                    <div className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white transition-all active:scale-90">
                        <MessageCircle size={28} />
                    </div>
                    <span className="text-xs font-bold text-white shadow-black drop-shadow-md">{item.comments}</span>
                </button>

                <button className="flex flex-col items-center gap-1 group">
                    <div className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white transition-all active:scale-90">
                        <Share2 size={28} />
                    </div>
                    <span className="text-xs font-bold text-white shadow-black drop-shadow-md">{item.shares}</span>
                </button>

                {/* Download Button (Trigger for Pro Upsell) */}
                <button 
                    onClick={onDownload}
                    className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white mt-2 hover:bg-white/20 transition-colors"
                >
                    <Download size={24} />
                </button>
            </div>

            {/* Bottom Info Area */}
            <div className="absolute bottom-6 left-4 right-16 z-30 text-white">
                <div className="flex items-center gap-2 mb-3">
                    <span className="font-black text-lg text-[#FFFF00]">@{item.user}</span>
                    <span className="text-gray-300 text-xs">• {item.time}</span>
                </div>
                <p className="text-sm font-medium leading-relaxed mb-4 line-clamp-2">
                    {item.description}
                </p>
                
                <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                    <Music2 size={14} className="animate-spin-slow" />
                    <span>Orijinal Ses - {item.user}</span>
                </div>
            </div>
        </div>
    );
};

export default OynaTv;
