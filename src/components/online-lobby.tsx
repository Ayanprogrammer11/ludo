"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, LogIn, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LinkPendingIndicator } from "@/components/loading/link-pending-indicator";
import type { SafeUser } from "@/lib/auth/types";
import { emitAck, getRealtimeSocket, saveRoomIdentity } from "@/lib/realtime/client";
import type { RoomIdentity, RoomSnapshot } from "@/lib/realtime/types";

type JoinAck = { identity: RoomIdentity; snapshot: RoomSnapshot };

export function OnlineLobby({ user }: { user: SafeUser | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [navigating, setNavigating] = useState<"create" | "join" | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState("");
  const pending = busy ?? navigating;

  async function submit(kind: "create" | "join") {
    if (!user) {
      setError("Sign in before starting an online room.");
      return;
    }
    setBusy(kind);
    setError("");
    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();
    const result = await emitAck<JoinAck>(
      kind === "create" ? "create_room" : "join_room",
      kind === "create" ? {} : { code },
    );
    if (!result.ok) {
      setBusy(null);
      setError(result.error.message);
      return;
    }
    saveRoomIdentity(result.identity);
    setBusy(null);
    setNavigating(kind);
    startTransition(() => router.push(`/room/${result.identity.roomCode}`));
  }

  return (
    <section className="online-lobby" id="online" aria-labelledby="online-title">
      <div className="lobby-intro">
        <span className="eyebrow">Play across the miles</span>
        <h2 id="online-title">Start an online table</h2>
        <p>Private rooms, live turns, automatic reconnection, and match results tied to your account.</p>
      </div>
      <div className="lobby-actions" aria-busy={Boolean(pending)}>
        {user ? (
          <div className="signed-in-row">
            <span>Playing as</span>
            <strong>{user.displayName}</strong>
          </div>
        ) : (
          <div className="signed-in-row">
            <span>Account required</span>
            <strong>Save stats and keep rooms abuse-resistant.</strong>
          </div>
        )}
        <button className="primary-action" type="button" onClick={() => void submit("create")} disabled={pending !== null}>
          {pending === "create" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
          {pending === "create" ? "Creating room..." : "Create room"} <ArrowRight size={15} />
        </button>
        <div className="join-row">
          <label>
            <span>Invite code</span>
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC234" />
          </label>
          <button className="secondary-action" type="button" onClick={() => void submit("join")} disabled={pending !== null || code.length !== 6}>
            {pending === "join" ? <LoaderCircle className="spin" size={17} /> : <Users size={17} />} {pending === "join" ? "Joining..." : "Join"}
          </button>
        </div>
        {!user ? <Link className="secondary-action lobby-login" href="/login?next=/%23online"><LogIn size={17} /> Sign in <LinkPendingIndicator /></Link> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
