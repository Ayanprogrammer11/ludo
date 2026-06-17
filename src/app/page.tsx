import { ArrowRight, Radio, ShieldCheck, Users } from "lucide-react";
import { Suspense } from "react";
import { AuthNav } from "@/components/auth/auth-nav";
import { LocalGame } from "@/components/game/local-game";
import { OnlineLobby } from "@/components/online-lobby";
import { createGame } from "@/lib/game/engine";
import { getOptionalUser } from "@/lib/auth/dal";

export default function Home() {
  // A deterministic initial match lets Cache Components include the complete table in the PPR shell.
  const initialGame = createGame(["Ayan", "Mira", "Noah", "Zoya"], "local-preview");

  return (
    <main>
      <nav className="site-nav">
        <a className="brand" href="#" aria-label="Ludo home">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>Ludo<span className="brand-accent">.</span></span>
        </a>
        <div className="nav-status"><Radio size={14} /> Live multiplayer</div>
        <Suspense fallback={<div className="nav-status">Account</div>}>
          <AuthNav />
        </Suspense>
      </nav>

      <div className="page-wrap">
        <header className="hero">
          <div>
            <span className="eyebrow">The classic, thoughtfully rebuilt</span>
            <h1>Bring everyone<br />to the <em>table.</em></h1>
          </div>
          <div className="hero-copy">
            <p>Fast turns, familiar rules, and just enough luck to keep every match interesting.</p>
            <div className="hero-features">
              <span><ShieldCheck size={16} /> Traditional rules</span>
              <span><Users size={16} /> 2-4 players</span>
            </div>
            <a href="#online">Start an online room <ArrowRight size={16} /></a>
          </div>
        </header>

        <Suspense fallback={<OnlineLobby user={null} />}>
          <OnlineLobbySlot />
        </Suspense>
        <div id="play"><LocalGame initialState={initialGame} /></div>
        <footer><span>Built for long-distance friends and crowded sofas.</span><span>v0.1 · Local play preview</span></footer>
      </div>
    </main>
  );
}

async function OnlineLobbySlot() {
  const user = await getOptionalUser();
  return <OnlineLobby user={user} />;
}
