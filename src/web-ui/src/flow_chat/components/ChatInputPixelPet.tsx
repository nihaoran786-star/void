/**
 * void chat-input mascot fallback.
 *
 * Preset Petdex companions are preferred. When no preset is configured, this
 * component renders a small abstract void mark with lightweight mood overlays.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ChatInputPetMood } from '../utils/chatInputPetMood';
import type { AgentCompanionPetSelection } from '@/infrastructure/config/services/AIExperienceConfigService';
import { resolveAgentCompanionPetSrc } from '@/infrastructure/config/services/AgentCompanionPetService';
import './ChatInputPixelPet.scss';

export interface ChatInputPixelPetProps {
  mood: ChatInputPixelPetMood;
  className?: string;
  layout?: 'center' | 'stopRight';
  pet?: AgentCompanionPetSelection | null;
  nativePetdexSize?: boolean;
  petdexScale?: number;
  onPetFrameSizeChange?: (size: { width: number; height: number } | null) => void;
}

export type ChatInputPixelPetMood = ChatInputPetMood | 'hover' | 'dragging';

const VIEW_W = 320;
const VIEW_H = 204;
const PETDEX_COLUMNS = 8;
const PETDEX_ROWS = 9;

function Silhouette() {
  return (
    <g className="void-mascot-head__silhouette" aria-hidden>
      <circle cx={142} cy={110} r={58} className="void-mascot__halo" />
      <path
        className="void-mascot__b"
        d="M96 66 L142 184 L190 66 H161 L142 126 L124 66 Z"
      />
      <path
        className="void-mascot__face-mask"
        d="M138 66 H190 L142 184 L119 125 Z"
      />
      <circle cx={142} cy={111} r={18} className="void-mascot__core" />
    </g>
  );
}

/* ---------- Mood overlays ---------- */

function FaceRest() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--rest">
      <g className="void-mascot-head__zzz" aria-hidden>
        <text
          x={215}
          y={75}
          className="void-mascot-head__zzz-glyph void-mascot-head__zzz-glyph--a"
        >
          z
        </text>
        <text
          x={245}
          y={45}
          className="void-mascot-head__zzz-glyph void-mascot-head__zzz-glyph--b"
        >
          z
        </text>
        <text
          x={278}
          y={18}
          className="void-mascot-head__zzz-glyph void-mascot-head__zzz-glyph--c"
        >
          Z
        </text>
      </g>
    </g>
  );
}

function FaceAnalyzing() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--analyze">
      <g className="void-mascot-head__think" aria-hidden>
        <circle cx={222} cy={72} r={4.5} className="void-mascot__b void-mascot-head__think-pip" />
        <circle cx={250} cy={48} r={6} className="void-mascot__b void-mascot-head__think-pip" />
        <circle cx={282} cy={20} r={8} className="void-mascot__b void-mascot-head__think-pip" />
      </g>
    </g>
  );
}

function FaceWaiting() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--wait">
      <g className="void-mascot-head__wait-pips" aria-hidden>
        <circle cx={228} cy={50} r={5} className="void-mascot-head__wait-pip" />
        <circle cx={252} cy={50} r={5} className="void-mascot-head__wait-pip" />
        <circle cx={276} cy={50} r={5} className="void-mascot-head__wait-pip" />
      </g>
    </g>
  );
}

function FaceWorking() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--work">
      {/* Sweat drop trickling down from forehead — classic "trying hard" cue. */}
      <g className="void-mascot-head__sweat" aria-hidden>
        <path
          d="M210 50 C204 60 204 72 210 76 C216 72 216 60 210 50 Z"
          className="void-mascot-head__sweat-drop"
        />
      </g>
    </g>
  );
}

function FaceHover() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--hover">
      <g className="void-mascot-head__sparkles" aria-hidden>
        <path d="M226 46 L232 58 L244 64 L232 70 L226 82 L220 70 L208 64 L220 58 Z" className="void-mascot-head__sparkle void-mascot-head__sparkle--a" />
        <path d="M270 20 L274 28 L282 32 L274 36 L270 44 L266 36 L258 32 L266 28 Z" className="void-mascot-head__sparkle void-mascot-head__sparkle--b" />
      </g>
    </g>
  );
}

function FaceDragging() {
  return (
    <g className="void-mascot-head__face void-mascot-head__face--drag">
      <g className="void-mascot-head__drag-lines" aria-hidden>
        <path d="M226 48 C244 40 262 40 282 48" className="void-mascot-head__drag-line void-mascot-head__drag-line--a" />
        <path d="M230 72 C248 64 268 65 286 75" className="void-mascot-head__drag-line void-mascot-head__drag-line--b" />
      </g>
    </g>
  );
}

const FACE_ORDER: ChatInputPixelPetMood[] = ['rest', 'analyzing', 'waiting', 'working', 'hover', 'dragging'];

function FaceFor(mood: ChatInputPixelPetMood) {
  switch (mood) {
    case 'rest':
      return <FaceRest />;
    case 'analyzing':
      return <FaceAnalyzing />;
    case 'waiting':
      return <FaceWaiting />;
    case 'hover':
      return <FaceHover />;
    case 'dragging':
      return <FaceDragging />;
    default:
      return <FaceWorking />;
  }
}

/* ---------- Idle micro-actions (rest mood only) ----------
 *
 * Every 4–8s while the mascot is resting, fire ONE local action that lasts
 * <2s and never moves the mark out of its slot. Rotation/translation is
 * applied to specific sub-elements via SCSS class selectors. */

const IDLE_ACTIONS = [
  'ear-twitch-left',
  'ear-twitch-right',
  'yawn',
  'deep-breath',
  'body-roll',
  'paw-wiggle',
] as const;

type IdleAction = (typeof IDLE_ACTIONS)[number];

const ACTION_DURATION_MS: Record<IdleAction, number> = {
  'ear-twitch-left': 700,
  'ear-twitch-right': 700,
  yawn: 1300,
  'deep-breath': 1800,
  'body-roll': 1500,
  'paw-wiggle': 900,
};

function pickIdleAction(prev: IdleAction | null): IdleAction {
  let pick = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
  if (prev && pick === prev) {
    pick = IDLE_ACTIONS[(IDLE_ACTIONS.indexOf(pick) + 1) % IDLE_ACTIONS.length];
  }
  return pick;
}

export const ChatInputPixelPet: React.FC<ChatInputPixelPetProps> = ({
  mood,
  className = '',
  layout = 'center',
  pet = null,
  nativePetdexSize = false,
  petdexScale = 1,
  onPetFrameSizeChange,
}) => {
  const layoutMod =
    layout === 'stopRight' ? ' void-chat-input-pixel-pet--layout-stop-right' : '';

  const [petSrc, setPetSrc] = useState<string | null>(null);
  const [petFrameSize, setPetFrameSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!pet) {
      setPetSrc(null);
      setPetFrameSize(null);
      onPetFrameSizeChange?.(null);
      return;
    }
    let cancelled = false;
    void resolveAgentCompanionPetSrc(pet).then(src => {
      if (!cancelled) setPetSrc(src || null);
    });
    return () => { cancelled = true; };
  }, [onPetFrameSizeChange, pet]);

  useEffect(() => {
    if (!petSrc || !nativePetdexSize) {
      setPetFrameSize(null);
      onPetFrameSizeChange?.(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const width = Math.round(image.naturalWidth / PETDEX_COLUMNS);
      const height = Math.round(image.naturalHeight / PETDEX_ROWS);
      if (width <= 0 || height <= 0) {
        setPetFrameSize(null);
        onPetFrameSizeChange?.(null);
        return;
      }
      const scale = Number.isFinite(petdexScale) && petdexScale > 0 ? petdexScale : 1;
      const nextSize = {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      };
      setPetFrameSize(nextSize);
      onPetFrameSizeChange?.(nextSize);
    };
    image.onerror = () => {
      if (cancelled) return;
      setPetFrameSize(null);
      onPetFrameSizeChange?.(null);
    };
    image.src = petSrc;

    return () => {
      cancelled = true;
    };
  }, [nativePetdexSize, onPetFrameSizeChange, petSrc, petdexScale]);

  const [transitioning, setTransitioning] = useState(false);
  const prevMoodRef = useRef<ChatInputPixelPetMood>(mood);
  useEffect(() => {
    if (prevMoodRef.current === mood) return;
    prevMoodRef.current = mood;
    setTransitioning(true);
    const t = window.setTimeout(() => setTransitioning(false), 320);
    return () => window.clearTimeout(t);
  }, [mood]);

  const [idleAction, setIdleAction] = useState<IdleAction | null>(null);
  const idleActionRef = useRef<IdleAction | null>(null);
  useEffect(() => {
    if (mood !== 'rest') {
      setIdleAction(null);
      idleActionRef.current = null;
      return;
    }

    let stopped = false;
    let nextTimer = 0;
    let clearTimer = 0;

    const schedule = () => {
      if (stopped) return;
      // First action comes quickly so the user notices the pet is alive.
      const wait = idleActionRef.current === null ? 1600 : 4000 + Math.random() * 4000;
      nextTimer = window.setTimeout(() => {
        if (stopped) return;
        const next = pickIdleAction(idleActionRef.current);
        idleActionRef.current = next;
        setIdleAction(next);
        clearTimer = window.setTimeout(() => {
          if (stopped) return;
          setIdleAction(null);
          schedule();
        }, ACTION_DURATION_MS[next] + 60);
      }, wait);
    };

    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(nextTimer);
      window.clearTimeout(clearTimer);
    };
  }, [mood]);

  const stageClasses = [
    'void-chat-input-pixel-pet__stage',
    `void-chat-input-pixel-pet__stage--${mood}`,
    transitioning ? 'void-chat-input-pixel-pet__stage--transition' : '',
    idleAction ? `void-chat-input-pixel-pet__stage--idle-${idleAction}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (pet && petSrc) {
    const rowByMood: Record<ChatInputPixelPetMood, number> = {
      rest: 0,
      hover: 1,
      dragging: 2,
      analyzing: 8,
      waiting: 6,
      working: 7,
    };
    const nativePetdexStyle = nativePetdexSize && petFrameSize
      ? {
        '--void-petdex-width': `${petFrameSize.width}px`,
        '--void-petdex-height': `${petFrameSize.height}px`,
      }
      : {};
    return (
      <div
        className={`void-chat-input-pixel-pet${layoutMod} ${className}`.trim()}
        style={nativePetdexStyle as React.CSSProperties}
        aria-hidden
      >
        <div
          className={`void-chat-input-pixel-pet__petdex void-chat-input-pixel-pet__petdex--${mood}`}
          style={{
            '--void-petdex-src': `url("${petSrc}")`,
            '--void-petdex-row': rowByMood[mood],
          } as React.CSSProperties}
        />
      </div>
    );
  }

  if (pet) {
    return (
      <div className={`void-chat-input-pixel-pet${layoutMod} ${className}`.trim()} aria-hidden />
    );
  }

  return (
    <div className={`void-chat-input-pixel-pet${layoutMod} ${className}`.trim()} aria-hidden>
      <div className={stageClasses}>
        <svg
          className={`void-chat-input-pixel-pet__svg void-chat-input-pixel-pet__svg--${mood}`}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* Outline filter — only applied in dark theme via SCSS. Builds a
             single continuous light contour around the union of all dark
             shapes by dilating the silhouette's alpha and flooding the
             expanded area with the outline color, then compositing the
             original graphic on top. */}
          <defs>
            <filter
              id="void-mascot-outline"
              x="-15%"
              y="-15%"
              width="130%"
              height="130%"
            >
              <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="OUT" />
              <feFlood floodColor="#fafaf9" floodOpacity="0.25" />
              <feComposite in2="OUT" operator="in" result="OUT_FILLED" />
              <feMerge>
                <feMergeNode in="OUT_FILLED" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g className={`void-mascot-head void-mascot-head--${mood}`}>
            <Silhouette />
            <g className="void-mascot-head__faces">
              {FACE_ORDER.map(m => (
                <g
                  key={m}
                  className="void-mascot-head__face-layer"
                  data-active={m === mood ? 'true' : 'false'}
                >
                  {FaceFor(m)}
                </g>
              ))}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};
