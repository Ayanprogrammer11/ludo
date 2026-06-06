"use client";

import { ArrowRight, LoaderCircle, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { emitAck, getRealtimeSocket, saveRoomIdentity } from "@/lib/realtime/client";
import type { RoomIdentity, RoomSnapshot } from "@/lib/realtime/types";

type JoinAck = { identity: RoomIdentity; snapshot: RoomSnapshot };

export function OnlineLobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  async function submit(kind: "create" | "join") {
    if (!name.trim()) {
      setError("Add your name first.");
      return;
    }
    setBusy(kind);
    setError("");
    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();
    const result = await emitAck<JoinAck>(
      kind === "create" ? "create_room" : "join_room",
      kind === "create" ? { name } : { name, code },
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    saveRoomIdentity(result.identity);
    router.push(`/room/${result.identity.roomCode}`);
  }

  return (
    <section className="online-lobby" id="online" aria-labelledby="online-title">
      <div className="lobby-intro">
        <span className="eyebrow">Play across the miles</span>
        <h2 id="online-title">Start an online table</h2>
        <p>Private rooms, live turns, and automatic reconnection when someone&apos;s signal drops.</p>
      </div>
      <div className="lobby-actions">
        <label>
          <span>Your name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="What should we call you?" />
        </label>
        <button className="primary-action" type="button" onClick={() => void submit("create")} disabled={busy !== null}>
          {busy === "create" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
          Create room <ArrowRight size={15} />
        </button>
        <div className="join-row">
          <label>
            <span>Invite code</span>
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" />
          </label>
          <button className="secondary-action" type="button" onClick={() => void submit("join")} disabled={busy !== null || code.length !== 6}>
            {busy === "join" ? <LoaderCircle className="spin" size={17} /> : <Users size={17} />} Join
          </button>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
