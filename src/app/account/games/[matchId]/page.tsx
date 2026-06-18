import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuthNav } from "@/components/auth/auth-nav";
import { MatchReplay } from "@/components/game/match-replay";
import { LinkPendingIndicator } from "@/components/loading/link-pending-indicator";
import { getAuthorizedMatch } from "@/lib/auth/dal";

export const unstable_instant = false;

export default async function MatchReplayPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  let decodedMatchId = matchId;
  try {
    decodedMatchId = decodeURIComponent(matchId);
  } catch {
    notFound();
  }
  const match = await getAuthorizedMatch(decodedMatchId);
  if (!match) notFound();

  return (
    <main>
      <nav className="site-nav">
        <Link className="brand" href="/" aria-label="Ludo home">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>Ludo<span className="brand-accent">.</span></span>
        </Link>
        <Suspense fallback={<div className="nav-status">Account</div>}>
          <AuthNav />
        </Suspense>
      </nav>
      <div className="replay-page">
        <Link className="back-link" href="/account"><ArrowLeft size={15} /> Account <LinkPendingIndicator /></Link>
        <MatchReplay match={match} />
      </div>
    </main>
  );
}
