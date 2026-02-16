'use client';

import { useEffect, useRef, useCallback } from 'react';
import { PongEngine } from '@/game/engine';

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PongEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 800;
    canvas.height = 600;

    const engine = new PongEngine(canvas);
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleClick = useCallback(() => {
    engineRef.current?.handleClick();
  }, []);

  return (
    <div className="game-wrapper" onClick={handleClick}>
      <canvas
        ref={canvasRef}
        id="pong"
        className="game-canvas"
      />
      <div className="crt-overlay" />
      <div className="crt-vignette" />
      <div className="crt-bezel" />
    </div>
  );
}
