import { Suspense } from "react";
import Link from "next/link";
import { AuthNav } from "@/components/auth/auth-nav";
import { RoomGame } from "@/components/game/room-game";
import { RouteLoading } from "@/components/loading/route-loading";
import { requireSession } from "@/lib/auth/dal";

export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { code: "ABC234" }, cookies: [{ name: "ludo_session", value: null }] }],
};

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <main className="room-page">
      <nav className="site-nav">
        <Link className="brand" href="/" aria-label="Ludo home">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>Ludo<span className="brand-accent">.</span></span>
        </Link>
        <div className="nav-status"><RadioMark /> Live multiplayer</div>
        <Suspense fallback={<div className="nav-status">Account</div>}>
          <AuthNav />
        </Suspense>
      </nav>
      <div className="room-wrap">
        <Suspense fallback={<RouteLoading eyebrow="Private room" title="Opening the table..." detail="Checking your seat and session." />}>
          <ResolvedRoom params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function ResolvedRoom({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const session = await requireSession(`/room/${roomCode}`);
  return <RoomGame code={roomCode} user={{ displayName: session.user.displayName }} />;
}

function RadioMark() {
  return <span className="live-mark" aria-hidden="true" />;
}
