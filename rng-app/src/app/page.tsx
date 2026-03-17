"use client";
import { useState } from 'react';

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch('/api/rng', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setResult(data.result);
      }
    } catch (error) {
      console.error('Error generating number:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans text-slate-100">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none" />

      <main className="relative z-10 max-w-lg w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-12 shadow-2xl flex flex-col items-center text-center">
        
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-br from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          Quantum Oracle
        </h1>
        <p className="text-slate-400 text-sm mb-12 uppercase tracking-widest font-medium">
          Pure Randomness Generator
        </p>

        {/* Display Area */}
        <div className="w-full h-48 bg-slate-950/50 rounded-2xl border border-slate-800/50 flex items-center justify-center mb-8 shadow-inner overflow-hidden relative">
          {isGenerating ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-indigo-400 font-mono text-sm tracking-widest animate-pulse">CALCULATING...</span>
              </div>
          ) : result !== null ? (
            <div className="animate-in zoom-in duration-500 fade-in flex flex-col items-center">
              <span className="text-7xl font-black bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent drop-shadow-lg">
                {result}
              </span>
              <span className="text-slate-500 text-xs mt-4 font-mono">
                RANGE: 0 - 1000
              </span>
            </div>
          ) : (
            <span className="text-slate-600 font-mono text-4xl">???</span>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="group relative w-full overflow-hidden rounded-xl bg-indigo-600 p-4 font-bold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-15px_rgba(79,70,229,0.7)]"
        >
          <span className="relative z-10 flex items-center justify-center gap-2 text-lg">
            {isGenerating ? 'Accessing Oracle...' : 'Generate Number'}
          </span>
          {/* Button Shine Effect */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
        </button>

      </main>
    </div>
  );
}
