import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { History, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { AuthNav } from "@/components/auth/auth-nav";
import { ProfileForm } from "@/components/auth/profile-form";
import { LinkPendingIndicator } from "@/components/loading/link-pending-indicator";
import { RouteLoading } from "@/components/loading/route-loading";
import { getAccountDashboard } from "@/lib/auth/dal";

export default function AccountPage() {
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
      <div className="account-page">
        <Suspense fallback={<RouteLoading eyebrow="Account" title="Loading your table..." detail="Fetching your profile, stats, and match history." />}>
          <AccountContent />
        </Suspense>
      </div>
    </main>
  );
}

async function AccountContent() {
  const dashboard = await getAccountDashboard();
  const { user, stats, recentMatches } = dashboard;
  const joined = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(user.createdAt);

  return (
    <>
      <section className="account-hero">
        <div>
          <span className="eyebrow">Player account</span>
          <h1>{user.displayName}</h1>
          <p>{user.email} · Joined {joined}</p>
        </div>
        <div className="account-trust"><ShieldCheck size={18} /> First-party account</div>
      </section>

      <section className="stat-strip" aria-label="Match statistics">
        <Stat icon={<History size={18} />} label="Matches" value={stats.matchesPlayed.toString()} />
        <Stat icon={<Trophy size={18} />} label="Wins" value={stats.wins.toString()} />
        <Stat icon={<UserRound size={18} />} label="Losses" value={stats.losses.toString()} />
        <Stat icon={<ShieldCheck size={18} />} label="Win rate" value={`${stats.winRate}%`} />
      </section>

      <div className="account-grid">
        <section className="account-section">
          <div className="section-heading">
            <h2>Profile</h2>
            <p>Changes apply to new rooms and future match records.</p>
          </div>
          <ProfileForm displayName={user.displayName} />
        </section>

        <section className="account-section">
          <div className="section-heading">
            <h2>Past games</h2>
            <p>{recentMatches.length ? "Your latest online match results." : "Online results will appear here after finished matches."}</p>
          </div>
          <div className="match-list">
            {recentMatches.length ? recentMatches.map((match) => {
              const content = (
                <>
                  <div>
                    <strong>{match.outcome === "won" ? "Won" : "Lost"} · Room {match.roomCode}</strong>
                    <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(match.playedAt)}</small>
                  </div>
                  <span>{match.hasReplay ? "Replay" : match.winnerName ? `${match.winnerName} won` : "No replay"}</span>
                </>
              );
              return match.hasReplay ? (
                <Link className="match-row" href={`/account/games/${encodeURIComponent(match.id)}`} key={match.id}>{content}<LinkPendingIndicator /></Link>
              ) : (
                <article className="match-row is-disabled" key={match.id}>{content}</article>
              );
            }) : <div className="empty-history">Finish an online match to start building your record.</div>}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-item">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
