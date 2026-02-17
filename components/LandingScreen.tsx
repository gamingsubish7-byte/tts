
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Sparkles, AudioLines, ChevronRight } from 'lucide-react';

interface LandingScreenProps {
  onGetStarted: () => void;
  onCheckVocals: () => void;
}

const LandingScreen: React.FC<LandingScreenProps> = ({ onGetStarted, onCheckVocals }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-zinc-950 overflow-hidden"
    >
      {/* Background visual elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/30 dark:bg-indigo-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/30 dark:bg-blue-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl px-6 text-center">
        {/* Animated Brand Icon */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="flex justify-center mb-10"
        >
          <div className="w-16 h-16 bg-zinc-900 dark:bg-zinc-100 rounded-2xl flex items-center justify-center shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
            <Mic size={32} className="text-white dark:text-zinc-900" />
          </div>
        </motion.div>

        {/* Hero Text */}
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-5xl md:text-7xl font-serif font-medium tracking-tight text-zinc-900 dark:text-white mb-8"
        >
          The Future of <span className="italic text-indigo-600 dark:text-indigo-400">Narrative</span>
        </motion.h1>

        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 font-light leading-relaxed max-w-2xl mx-auto mb-12"
        >
          Experience high-fidelity AI voices powered by Gemini. Cast persona archetypes, generate expressive scripts, and bring your words to life instantly.
        </motion.p>

        {/* Action Buttons */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
        >
          <button 
            onClick={onGetStarted}
            className="group relative w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-lg shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <AudioLines size={20} />
            <span>Get Started</span>
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>

          <button 
            onClick={onCheckVocals}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-full font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <Sparkles size={20} className="text-indigo-400" />
            <span>Check Vocals</span>
          </button>
        </motion.div>

        {/* Footer Meta */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mt-20 pt-8 border-t border-zinc-100 dark:border-zinc-900 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            Powered by Gemini 2.5 Flash
          </div>
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">
            Studio Grade Audio Output
          </div>
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">
            30+ Curated Personas
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LandingScreen;
