import React from 'react';
import { motion, Variants } from 'framer-motion';

interface OynaLogoProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  animate?: boolean;
}

export const OynaLogo: React.FC<OynaLogoProps> = ({
  className = "",
  width = 200,
  height = 200,
  animate = false
}) => {
  const draw: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { delay: i * 0.1, type: "spring", duration: 1.5, bounce: 0 },
        opacity: { delay: i * 0.1, duration: 0.2 }
      }
    })
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="#FFC107"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 1. OUTER CIRCLE */}
      <motion.circle
        cx="100" cy="100" r="85"
        variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={1}
        strokeWidth="4"
      />

      {/* 2. BALL PANELS (clipped to perfectly fit inside the outer circle) */}
      <clipPath id="circle-clip">
        <circle cx="100" cy="100" r="84.5" />
      </clipPath>

      <g clipPath="url(#circle-clip)">
        {/* Top/Bottom Center Vertical Lines */}
        <motion.line x1="100" y1="67" x2="100" y2="30" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={2} />
        <motion.line x1="100" y1="133" x2="100" y2="170" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={2} />

        {/* Top Hexagon branches */}
        <motion.path d="M 100 30 L 70 20 L 40 -5" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={3} />
        <motion.path d="M 100 30 L 130 20 L 160 -5" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={3} />
        
        {/* Bottom Hexagon branches */}
        <motion.path d="M 100 170 L 70 180 L 40 205" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={4} />
        <motion.path d="M 100 170 L 130 180 L 160 205" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={4} />

        {/* Left Side Web */}
        <motion.path d="M 62 50 L 45 40 L 70 20" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={5} />
        <motion.path d="M 45 40 L 25 75 L 5 55" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={6} />
        <motion.path d="M 60 100 L 40 100 L 25 75" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={7} />
        
        <motion.path d="M 62 150 L 45 160 L 70 180" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={5} />
        <motion.path d="M 45 160 L 25 125 L 5 145" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={6} />
        <motion.path d="M 40 100 L 25 125" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={7} />
        
        <motion.path d="M 25 75 L 0 85" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={8} />
        <motion.path d="M 25 125 L 0 115" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={8} />

        {/* Right Side Web */}
        <motion.path d="M 125 80 L 145 50 L 130 20" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={9} />
        <motion.path d="M 145 50 L 175 75 L 205 60" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={10} />
        <motion.path d="M 175 75 L 175 125" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={11} />
        
        <motion.path d="M 125 120 L 145 150 L 130 180" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={9} />
        <motion.path d="M 145 150 L 175 125 L 205 140" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={10} />
      </g>

      {/* 3. CENTRAL PLAY BUTTON (TRIANGLE) */}
      <motion.path
        d="M 60 55 Q 60 45 70 50 L 155 95 Q 165 100 155 105 L 70 150 Q 60 155 60 145 Z"
        variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={12}
        strokeWidth="4"
        fill="transparent"
      />

      {/* 4. INNER FOOTBALL PITCH (clipped to triangle) */}
      <clipPath id="triangle-clip">
        <path d="M 60 55 Q 60 45 70 50 L 155 95 Q 165 100 155 105 L 70 150 Q 60 155 60 145 Z" />
      </clipPath>

      <g clipPath="url(#triangle-clip)">
        {/* Pitch Halfway Line matches exactly the vertical spokes X=100 */}
        <motion.line x1="100" y1="0" x2="100" y2="200" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={13} strokeWidth="3" />
        
        {/* Center Circle */}
        <motion.circle cx="100" cy="100" r="16" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={14} strokeWidth="2.5" />
        
        {/* Center Spot */}
        <motion.circle cx="100" cy="100" r="1.5" fill="#FFC107" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={15} />

        {/* Left Penalty Area (Starts at Left Edge 60) */}
        <motion.path d="M 60 82 L 75 82 L 75 118 L 60 118" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={16} strokeWidth="2.5" />
        {/* Left Penalty Arc (using A curve) */}
        <motion.path d="M 75 91 A 10 10 0 0 1 75 109" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={18} strokeWidth="2.5" />
        
        {/* Right Penalty Area (Aligned perfectly symmetric with Left Goal Line relative to Center X=100. Right Goal Line is X=140.) */}
        <motion.path d="M 140 82 L 125 82 L 125 118 L 140 118" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={16} strokeWidth="2.5" />
        {/* Right Penalty Arc */}
        <motion.path d="M 125 91 A 10 10 0 0 0 125 109" variants={draw} initial={animate ? "hidden" : "visible"} animate="visible" custom={18} strokeWidth="2.5" />
      </g>
    </svg>
  );
};
