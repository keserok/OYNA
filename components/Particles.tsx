import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
}

interface ParticlesProps {
  count?: number;
  colors?: string[];
}

export const Particles: React.FC<ParticlesProps> = ({ 
  count = 30, 
  colors = ['#FACC15', '#39FF14', '#FFFFFF', '#FF00FF'] 
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100, // percentage
        y: Math.random() * 100, // percentage
        size: Math.random() * 6 + 2, // 2px to 8px
        color: colors[Math.floor(Math.random() * colors.length)],
        duration: Math.random() * 2 + 1, // 1s to 3s
      });
    }
    setParticles(newParticles);
  }, [count, colors]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animationDuration: `${p.duration}s`,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
};
