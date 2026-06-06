import { Suspense } from "react";
import Link from "next/link";
import { RoomGame } from "@/components/game/room-game";

export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { code: "ABC234" } }],
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
      </nav>
      <div className="room-wrap">
        <Suspense fallback={<div className="room-loading"><span className="eyebrow">Private room</span><h1>Opening the table...</h1></div>}>
          <ResolvedRoom params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function ResolvedRoom({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomGame code={code.toUpperCase()} />;
}

function RadioMark() {
  return <span className="live-mark" aria-hidden="true" />;
}
