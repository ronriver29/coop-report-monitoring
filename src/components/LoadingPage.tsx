import React from 'react';
import { motion } from 'motion/react';
import { FuturisticLoader } from './FuturisticLoader.tsx';

export default function LoadingPage() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050505] overflow-hidden">
      <div className="relative flex items-center justify-center">
        <FuturisticLoader size={240} text="HYPERLINKING" />
      </div>

      {/* CDA Branding Branding (Subtle) */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-12 flex flex-col items-center gap-3"
      >
        <img 
          src="https://cda.gov.ph/wp-content/uploads/2021/01/CDA-logo-RA11364-PNG.png"
          alt="CDA Logo"
          className="w-10 h-10 grayscale brightness-200"
          referrerPolicy="no-referrer"
        />
        <div className="text-white/30 text-[9px] font-bold tracking-[0.4em] uppercase text-center">
          Cooperative Development Authority
        </div>
      </motion.div>

      {/* Ambient Radial Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,180,216,0.08)_0%,transparent_70%)] pointer-events-none" />
    </div>
  );
}
