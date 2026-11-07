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

const VOICE_KEY = 'pong_commentary_voice';
const PREFERRED_VOICES = ['Daniel', 'Arthur', 'Oliver', 'Google UK English Male', 'Microsoft Ryan', 'Microsoft George', 'Jamie'];

/** The browser's own British voice, free and on-device; a named male voice first, then any en-GB voice. */
function pickBritishVoice(voices: SpeechSynthesisVoice[]) {
  const british = voices.filter(voice => voice.lang.replace('_', '-').toLowerCase().startsWith('en-gb'));
  for (const name of PREFERRED_VOICES) {
    const match = british.find(voice => voice.name.includes(name));
    if (match) return match;
  }
  return british[0] ?? null;
}

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PongEngine | null>(null);
  const aiAnnouncerRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAiCallRef = useRef(0);
  const requestIdRef = useRef(0);
  const [commentary, setCommentary] = useState('Pick a mode and step onto the court.');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const voiceEnabledRef = useRef(voiceEnabled);
  const [inputDevice, setInputDevice] = useState<InputDevice>(() => (window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard'));
  const [touchSeen, setTouchSeen] = useState(inputDevice === 'touch');
  const [gameState, setGameState] = useState<GameState>(GameState.TITLE);
  const [twoPlayer, setTwoPlayer] = useState(false);

  const stopSpeech = useCallback(() => {
    speechQueueRef.current = [];
    speakingRef.current = false;
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const playNext = useCallback(() => {
    if (speakingRef.current || !('speechSynthesis' in window)) return;
    const line = speechQueueRef.current.shift();
    if (!line) return;
    const utterance = new SpeechSynthesisUtterance(line);
    const voice = pickBritishVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-GB';
    utterance.rate = 0.98;
    utterance.pitch = 0.95;
    const finished = () => {
      if (utteranceRef.current !== utterance) return;
      speakingRef.current = false;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      playNextRef.current();
    };
    utterance.onend = finished;
    utterance.onerror = finished;
    utteranceRef.current = utterance;
    speakingRef.current = true;
    // Some browsers never report the end of speech, which must not silence the commentator for good.
    watchdogRef.current = setTimeout(finished, 2500 + line.length * 110);
    window.speechSynthesis.speak(utterance);
  }, []);
  const playNextRef = useRef(playNext);

  /** Lines wait their turn so nothing is cut off mid-sentence; only the newest waiting line is kept. */
  const speak = useCallback((line: string) => {
    if (!voiceEnabledRef.current) return;
    speechQueueRef.current = [line];
    playNextRef.current();
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
    engine.onCommentary = line => {
      setCommentary(line);
      speak(line);
    };
    engine.onCommentaryReset = stopSpeech;
    engine.onAnnouncer = (event: AnnouncerEvent) => {
      setCommentary(fallbackCommentary(event));

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
      stopSpeech();
      engine.destroy();
      engineRef.current = null;
    };
  }, [speak, stopSpeech]);

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
        <div className="announcer-meta"><span className="announcer-light" /> COMMENTARY <span>{aiEnabled ? 'AI LIVE' : 'LOCAL CALLS'}</span></div>
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
            try {
              localStorage.setItem(VOICE_KEY, enabled ? 'on' : 'off');
            } catch { /* ignore */ }
            if (!enabled) stopSpeech();
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
