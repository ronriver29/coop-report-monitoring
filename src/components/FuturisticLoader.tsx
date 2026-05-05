import React from 'react';
import { motion } from 'motion/react';

interface FuturisticLoaderProps {
  size?: number;
  text?: string;
  className?: string;
}

export const FuturisticLoader: React.FC<FuturisticLoaderProps> = ({ 
  size = 120, 
  text = "LOADING",
  className = "" 
}) => {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Inner Ring - Fastest */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="30"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2"
            strokeDasharray="40 120"
            strokeLinecap="round"
            className="opacity-80"
          />
        </motion.svg>

        {/* Middle Ring - Slower, Counter-clockwise */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: -360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="1.5"
            strokeDasharray="60 180"
            strokeLinecap="round"
            className="opacity-60"
          />
        </motion.svg>

        {/* Outer Ring - Slowest */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="1"
            strokeDasharray="80 240"
            strokeLinecap="round"
            className="opacity-40"
          />
        </motion.svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span 
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-[10px] font-bold tracking-[0.2em] text-[#0ea5e9] select-none"
          >
            {text}
          </motion.span>
        </div>
        
        {/* Glow Effects */}
        <div className="absolute inset-0 bg-[#0ea5e9] opacity-10 blur-xl rounded-full"></div>
      </div>
    </div>
  );
};
