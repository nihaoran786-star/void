/**
 * Inline video transport for a video card (visual language §5).
 *
 * At rest the card is one frame and nothing else. Hovering (or focusing
 * anything inside) lays a minimal bar over the bottom of the clip —
 * play/pause, elapsed, a thin progress track, total length, full screen — and
 * a mute toggle in the top-left corner. The browser's own control chrome is
 * gone: it is a grey slab that fights the reference boards.
 *
 * Nothing here touches the document. Playback position and mute are view
 * state that dies with the card, exactly like the old native controls.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';

/** mm:ss; a clip long enough to need hours is not a canvas card. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

interface InfiniteCanvasVideoCardProps {
  src: string;
  /** File name of the clip; used as the media element's accessible name. */
  label: string;
  onError: () => void;
}

export const InfiniteCanvasVideoCard: React.FC<InfiniteCanvasVideoCardProps> = ({
  src,
  label,
  onError,
}) => {
  const { t } = useI18n('components');
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const togglePlay = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play?.();
    else video.pause?.();
  }, []);

  const seekTo = React.useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setElapsed(seconds);
  }, []);

  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;

  return (
    <div className="infinite-canvas-video" data-canvas-video="root">
      {/* Generated clip: no caption track source exists for it. */}
      <video
        ref={videoRef}
        className="infinite-canvas-node__video nodrag"
        src={src}
        // preload="metadata" keeps off-screen cards cheap (poster frame +
        // duration only); the video data streams when the user hits play.
        preload="metadata"
        muted={muted}
        aria-label={label}
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={event => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
      />
      <button
        type="button"
        className="infinite-canvas-video__mute nodrag"
        data-canvas-video-action="mute"
        data-muted={muted ? 'true' : undefined}
        aria-label={muted ? t('infiniteCanvas.video.unmute') : t('infiniteCanvas.video.mute')}
        title={muted ? t('infiniteCanvas.video.unmute') : t('infiniteCanvas.video.mute')}
        onClick={() => setMuted(value => !value)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M3 6.2h2.2L8.4 3.6v8.8L5.2 9.8H3z"
            fill="currentColor"
          />
          {muted ? (
            <path
              d="M10.6 6.2l3 3.6M13.6 6.2l-3 3.6"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M10.8 5.8a3.2 3.2 0 0 1 0 4.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      <div className="infinite-canvas-video__transport nodrag" data-canvas-video="transport">
        <button
          type="button"
          className="infinite-canvas-video__button"
          data-canvas-video-action="play"
          data-playing={playing ? 'true' : undefined}
          aria-label={playing ? t('infiniteCanvas.video.pause') : t('infiniteCanvas.video.play')}
          title={playing ? t('infiniteCanvas.video.pause') : t('infiniteCanvas.video.play')}
          onClick={togglePlay}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            {playing
              ? <path d="M5 3.5h2.2v9H5zM8.8 3.5H11v9H8.8z" fill="currentColor" />
              : <path d="M5 3.4 12 8l-7 4.6z" fill="currentColor" />}
          </svg>
        </button>
        <span className="infinite-canvas-video__time" data-canvas-video-time="elapsed">
          {formatClock(elapsed)}
        </span>
        <span className="infinite-canvas-video__track">
          <span
            className="infinite-canvas-video__progress"
            style={{ transform: `scaleX(${progress})` }}
            aria-hidden="true"
          />
          {/* The real seek control; the bar above it is only the paint. */}
          <input
            type="range"
            className="infinite-canvas-video__seek"
            data-canvas-video-action="seek"
            aria-label={t('infiniteCanvas.video.seek')}
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(elapsed, duration || 0)}
            onChange={event => seekTo(Number(event.target.value))}
          />
        </span>
        <span className="infinite-canvas-video__time" data-canvas-video-time="duration">
          {formatClock(duration)}
        </span>
        <button
          type="button"
          className="infinite-canvas-video__button"
          data-canvas-video-action="fullscreen"
          aria-label={t('infiniteCanvas.video.fullscreen')}
          title={t('infiniteCanvas.video.fullscreen')}
          onClick={() => {
            // Optional call: jsdom and older webviews have no Fullscreen API,
            // and a missing one must not take the card down with it.
            void videoRef.current?.requestFullscreen?.();
          }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

InfiniteCanvasVideoCard.displayName = 'InfiniteCanvasVideoCard';
