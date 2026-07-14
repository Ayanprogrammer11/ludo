"use client";

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MatchReplayFrame, StoredMatch } from "@/lib/auth/types";
import type { PlayerColor } from "@/lib/game/types";
import { GameBoard } from "./game-board";
import { RulesDisclosure } from "./rule-picker";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};
const SPEEDS = [1, 4, 12] as const;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function frameDelta(frames: MatchReplayFrame[], index: number) {
  return index === 0 ? 0 : frames[index].at - frames[index - 1].at;
}

export function MatchReplay({ match }: { match: StoredMatch }) {
  const frames = useMemo(() => match.replay?.frames ?? [], [match.replay?.frames]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const frame = frames[index];
  const current = frame?.state.players.find((player) => player.id === frame.state.currentPlayerId);
  const winner = frame?.state.players.find((player) => player.id === frame.state.winnerId);
  const elapsedMs = frame ? frame.at - frames[0].at : 0;
  const deltaMs = frame ? frameDelta(frames, index) : 0;

  useEffect(() => {
    if (!playing || index >= frames.length - 1) return undefined;
    const nextDelay = Math.max(350, frameDelta(frames, index + 1) / speed);
    const timeout = window.setTimeout(() => {
      setIndex((currentIndex) => Math.min(frames.length - 1, currentIndex + 1));
      if (index + 1 >= frames.length - 1) setPlaying(false);
    }, nextDelay);
    return () => window.clearTimeout(timeout);
  }, [frames, index, playing, speed]);

  if (!frame) {
    return (
      <section className="replay-empty">
        <span className="eyebrow">Past game</span>
        <h1>Replay unavailable</h1>
        <p>This match was recorded before step-by-step replay was enabled.</p>
      </section>
    );
  }

  return (
    <section className="replay-layout" aria-label={`Replay for room ${match.roomCode}`}>
      <div className="replay-stage">
        <div className="replay-board-meta">
          <div>
            <span className="eyebrow">Room {match.roomCode}</span>
            <h1>{winner ? `${winner.name} won` : current ? `${current.name}'s turn` : "Replay"}</h1>
          </div>
          <div className="replay-clock">
            <strong>{formatDuration(elapsedMs)}</strong>
            <span>+{formatDuration(deltaMs)}</span>
          </div>
        </div>
        <GameBoard state={frame.state} legalMoves={{}} activeColor={current?.color ?? null} onMove={() => undefined} />
      </div>

      <aside className="replay-panel">
        <RulesDisclosure rules={frame.state.rules} />
        <div className="section-heading">
          <h2>Step {index + 1} of {frames.length}</h2>
          <p>{frame.label}</p>
        </div>

        <input
          className="replay-range"
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(event) => {
            setPlaying(false);
            setIndex(Number(event.target.value));
          }}
          aria-label="Replay step"
        />

        <div className="replay-controls">
          <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex(0); }} disabled={index === 0} aria-label="Restart replay" title="Restart">
            <RotateCcw size={17} />
          </button>
          <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex((value) => Math.max(0, value - 1)); }} disabled={index === 0} aria-label="Previous step" title="Previous step">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="primary-action replay-play" onClick={() => setPlaying((value) => !value)} disabled={frames.length < 2 || index >= frames.length - 1}>
            {playing ? <Pause size={17} /> : <Play size={17} />} {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="icon-button" onClick={() => { setPlaying(false); setIndex((value) => Math.min(frames.length - 1, value + 1)); }} disabled={index >= frames.length - 1} aria-label="Next step" title="Next step">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="speed-tabs" aria-label="Replay speed">
          {SPEEDS.map((value) => (
            <button key={value} type="button" className={speed === value ? "is-selected" : ""} onClick={() => setSpeed(value)}>
              {value}x
            </button>
          ))}
        </div>

        <div className="players-list replay-players">
          <div className="panel-heading"><span>Players</span><small>{match.players.length}</small></div>
          {frame.state.players.map((player) => {
            const finished = frame.state.tokens.filter((token) => token.color === player.color && token.progress === 57).length;
            return (
              <div className={`player-row ${player.id === frame.state.currentPlayerId ? "is-active" : ""} ${player.forfeited ? "is-left" : ""}`} key={player.id}>
                <span className={`avatar ${colorClass[player.color]}`}>{player.name.charAt(0)}</span>
                <span className="player-name"><strong>{player.name}</strong><small>{player.forfeited ? "Left" : `${finished}/4 home`}</small></span>
              </div>
            );
          })}
        </div>

        <div className="event-log">
          <div className="panel-heading"><span>Frame feed</span><small>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(frame.at)}</small></div>
          {frame.state.events.slice(0, 5).map((event) => <p key={event.id}><span className={`player-dot ${colorClass[event.color]}`} />{event.message}</p>)}
        </div>
      </aside>
    </section>
  );
}
