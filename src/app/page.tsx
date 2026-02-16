'use client';

import dynamic from 'next/dynamic';

const PongGame = dynamic(() => import('@/components/PongGame'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-black">
      <div className="text-center">
        <h1 className="text-4xl text-cyan-400 mb-4" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 20px #00ffff' }}>
          JEDAI
        </h1>
        <p className="text-cyan-400/50 text-sm animate-pulse" style={{ fontFamily: '"Press Start 2P", monospace' }}>
          LOADING...
        </p>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Starfield background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d0221] via-[#050015] to-black" />

      {/* Game */}
      <div className="relative z-10">
        <PongGame />
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-6 mb-4 text-center">
        <p className="text-[10px] text-cyan-400/20" style={{ fontFamily: '"Press Start 2P", monospace' }}>
          JEDAI SPACE PONG &middot; ORIGINAL PONG BY ATARI 1972
        </p>
      </footer>
    </main>
  );
}
