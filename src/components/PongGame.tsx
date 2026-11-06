'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PongEngine } from '@/game/engine';
import { fallbackCommentary } from '@/game/announcer';
import type { AnnouncerEvent } from '@/game/types';

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PongEngine | null>(null);
  const aiAnnouncerRef = useRef(false);
  const voiceEnabledRef = useRef(false);
  const lastAiCallRef = useRef(0);
  const requestIdRef = useRef(0);
  const [commentary, setCommentary] = useState('Pick a mode and step onto the court.');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const speak = useCallback((line: string) => {
    if (!voiceEnabledRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 1.04;
    utterance.pitch = 0.92;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 800;
    canvas.height = 600;

    const engine = new PongEngine(canvas);
    engineRef.current = engine;
    engine.onAnnouncer = (event: AnnouncerEvent) => {
      const localLine = fallbackCommentary(event);
      setCommentary(localLine);
      speak(localLine);

      if (!aiAnnouncerRef.current || Date.now() - lastAiCallRef.current < 2800) return;
      lastAiCallRef.current = Date.now();
      const requestId = ++requestIdRef.current;
      void fetch('/api/announcer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as { commentary?: string };
        if (!active || requestId !== requestIdRef.current || !data.commentary) return;
        setCommentary(data.commentary);
        speak(data.commentary);
      }).catch(() => undefined);
    };
    engine.start();
    void fetch('/api/announcer')
      .then(response => response.json())
      .then((data: { enabled?: boolean }) => {
        if (!active) return;
        aiAnnouncerRef.current = Boolean(data.enabled);
        setAiEnabled(Boolean(data.enabled));
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      engine.destroy();
      engineRef.current = null;
    };
  }, [speak]);

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
      <div className="announcer-chip" aria-live="polite" aria-atomic="true">
        <div className="announcer-meta"><span className="announcer-light" /> ANNOUNCER <span>{aiEnabled ? 'AI LIVE' : 'LOCAL CALLS'}</span></div>
        <p>{commentary}</p>
        <button
          type="button"
          className={`voice-toggle${voiceEnabled ? ' is-on' : ''}`}
          aria-pressed={voiceEnabled}
          onClick={event => {
            event.stopPropagation();
            const enabled = !voiceEnabled;
            voiceEnabledRef.current = enabled;
            setVoiceEnabled(enabled);
            if (!enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
            if (enabled) speak(commentary);
          }}
        >
          {voiceEnabled ? 'VOICE ON' : 'VOICE OFF'}
        </button>
      </div>
      <div className="crt-overlay" />
      <div className="crt-vignette" />
      <div className="crt-bezel" />
    </div>
  );
}
