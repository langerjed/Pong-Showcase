'use client';

import dynamic from 'next/dynamic';

const PongGame = dynamic(() => import('@/components/PongGame'), {
  ssr: false,
  loading: () => (
    <div className="game-loading" role="status">
      <span className="loading-orb" />
      <span>Warming up the court</span>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="showcase-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-wash" />

      <div className="page-content">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="Pong Showcase home">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>PONG<span className="brand-light">/</span>SHOWCASE</span>
          </a>
          <div className="topbar-note"><span className="live-dot" /> AN ARCADE ORIGINAL, REIMAGINED</div>
          <a className="github-link" href="https://github.com/langerjed/Pong-Showcase" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.08c-3.1.67-3.76-1.32-3.76-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.11.08 1.69 1.14 1.69 1.14.99 1.69 2.6 1.2 3.23.91.1-.72.39-1.2.71-1.48-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.21 1.15-2.99-.12-.29-.5-1.42.11-2.95 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.56 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.53.23 2.66.11 2.95.72.78 1.15 1.77 1.15 2.99 0 4.29-2.61 5.23-5.1 5.51.4.35.76 1.03.76 2.08V22c0 .29.2.63.77.52A11.1 11.1 0 0 0 12 .9Z" /></svg>
            <span>VIEW SOURCE</span><span className="external-arrow">↗</span>
          </a>
        </header>

        <section className="intro" id="top" aria-labelledby="hero-title">
          <div className="eyebrow"><span>01</span><span className="eyebrow-line" /> THE GAME THAT STARTED IT ALL</div>
          <h1 id="hero-title">Simple game.<br /><span>Endless rally.</span></h1>
          <p className="intro-copy">The original rally, rebuilt as real tennis. Run it down, time your swing, and paint the lines.</p>
        </section>

        <section className="arena-section" aria-label="Pong game">
          <div className="arena-heading">
            <div className="arena-title"><span className="arena-icon">✳</span><div><strong>THE ARENA</strong><span>READY WHEN YOU ARE</span></div></div>
            <div className="arena-status"><span className="status-pulse" /> SYSTEM ONLINE <span className="status-divider">/</span> 3 MODES</div>
          </div>
          <div className="game-frame">
            <div className="frame-topline"><span>PS—001</span><span>SPACE TENNIS</span><span>EST. 1972</span></div>
            <div className="game-screen"><PongGame /></div>
            <div className="frame-bottomline"><span><i /> SIGNAL LOCKED</span><span className="frame-center-label">PONG SHOWCASE</span><span>VOL. 01</span></div>
          </div>
          <div className="control-strip">
            <div className="control-item"><span className="keycap">←</span><span className="keycap">↑</span><span className="keycap">↓</span><span className="keycap">→</span><span className="control-label"><strong>RUN + AIM</strong><small>HOLD A DIRECTION AS YOU SWING</small></span></div>
            <div className="control-divider" />
            <div className="control-item"><span className="keycap">V</span><span className="control-label"><strong>TOPSPIN</strong><small>DIPS, KICKS UP</small></span></div>
            <div className="control-divider" />
            <div className="control-item"><span className="keycap">C</span><span className="control-label"><strong>FLAT</strong><small>FAST, LOW, RISKY</small></span></div>
            <div className="control-divider" />
            <div className="control-item"><span className="keycap">Z</span><span className="control-label"><strong>SLICE</strong><small>FLOATS, SKIDS LOW</small></span></div>
            <div className="control-divider" />
            <div className="control-item"><span className="keycap">B</span><span className="control-label"><strong>LOB</strong><small>OVER THEIR HEAD</small></span></div>
            <div className="control-divider" />
            <div className="control-item"><span className="keycap">X</span><span className="control-label"><strong>DROP</strong><small>DIES AT THE NET</small></span></div>
          </div>
          <div className="input-notes">
            <p><strong>TIMING</strong> Hold a shot to wind up (longer means more pace), and release as the meter marker hits the green. Early sails long, late finds the net, and way off misses the ball.</p>
            <p><strong>POSITION</strong> Run to the ball. Stretching for it costs pace and control. Space or any shot key tosses on your serve.</p>
            <p><strong>TWO PLAYERS</strong> P1 (far end) WASD + Q E R F G. P2 (near end) arrows + Z V C X B.</p>
            <p><strong>CONTROLLER</strong> Stick moves and aims · A topspin · X flat · B slice · Y lob · RB/RT drop · Start pauses. In two-player, the first controller is P1.</p>
          </div>
        </section>

        <footer className="footer"><span>BUILT FOR THE LOVE OF THE GAME</span><span>© 2026 PONG SHOWCASE <i>✳</i> PLAY WELL.</span></footer>
      </div>
    </main>
  );
}
