'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { PongEngine } from '@/game/engine';
import { fallbackCommentary } from '@/game/announcer';
import { GameState } from '@/game/types';
import type { AnnouncerEvent } from '@/game/types';
import { SIDE_KEYS } from '@/game/input';
import type { InputDevice } from '@/game/input';
import type { End } from '@/game/sim';

const LIVE_STATES = [GameState.SERVE, GameState.PLAYING, GameState.GOAL, GameState.PAUSED];
const TOUCH_SHOTS = [
  { action: 'topspin', label: 'TOPSPIN' },
  { action: 'flat', label: 'FLAT' },
  { action: 'slice', label: 'SLICE' },
  { action: 'lob', label: 'LOB' },
  { action: 'drop', label: 'DROP' },
] as const;

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
  const [inputDevice, setInputDevice] = useState<InputDevice>(() => (window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard'));
  const [touchSeen, setTouchSeen] = useState(inputDevice === 'touch');
  const [gameState, setGameState] = useState<GameState>(GameState.TITLE);
  const [twoPlayer, setTwoPlayer] = useState(false);

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
    engine.onInputChange = device => {
      setInputDevice(device);
      if (device === 'touch') setTouchSeen(true);
    };
    engine.onStateChange = state => {
      setGameState(state);
      setTwoPlayer(engine.twoPlayer);
      // Starting play brings the whole court on screen, since arrow keys no longer scroll the page.
      if (state === GameState.SERVE || state === GameState.PLAYING) {
        const rect = canvas.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) canvas.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    engine.onAnnouncer = (event: AnnouncerEvent) => {
      const localLine = fallbackCommentary(event);
      setCommentary(localLine);
      speak(localLine);

      if (event.localOnly || !aiAnnouncerRef.current || Date.now() - lastAiCallRef.current < 2800) return;
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

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    engineRef.current?.handleClick(event.clientX, event.clientY);
  }, []);

  const holdButton = (key: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      engineRef.current?.pressKey(key);
    },
    onPointerUp: () => engineRef.current?.releaseKey(key),
    onPointerCancel: () => engineRef.current?.releaseKey(key),
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  });

  const touchEnds: End[] = twoPlayer ? ['far', 'near'] : ['near'];

  return (
    <>
    <div className={`game-wrapper${LIVE_STATES.includes(gameState) ? ' is-live' : ''}`} data-input={inputDevice} onClick={handleClick}>
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
    {touchSeen && (
      <div className="touch-pad" aria-label="Touch controls">
        <div className="touch-utility">
          <span className="touch-tip">{twoPlayer ? 'DRAG YOUR HALF OF THE COURT TO MOVE. HOLD A SHOT, RELEASE IN THE GREEN.' : 'DRAG THE COURT TO MOVE. HOLD A SHOT, RELEASE IN THE GREEN.'}</span>
          <button type="button" className="touch-btn" {...holdButton('Escape')}>PAUSE</button>
        </div>
        <div className="touch-sides">
          {touchEnds.map(end => (
            <div className="touch-cluster" key={end}>
              {twoPlayer && <span className="touch-player">{end === 'far' ? 'P1' : 'P2'}</span>}
              {TOUCH_SHOTS.map(shot => (
                <button type="button" key={shot.action} className={`touch-btn touch-shot touch-${shot.action}`} {...holdButton(SIDE_KEYS[end][shot.action])}>
                  {shot.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    )}
    </>
  );
}
