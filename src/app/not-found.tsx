import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Home, SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The Ludo table you were looking for could not be found.",
};

export default function NotFound() {
  return (
    <main className="status-page">
      <section className="status-panel">
        <SearchX size={34} aria-hidden="true" />
        <div>
          <span className="eyebrow">404</span>
          <h1>This table is not on the board.</h1>
          <p>The link may be stale, the match may be private, or the page never existed.</p>
        </div>
        <div className="status-actions">
          <Link className="primary-action" href="/"><Home size={16} /> Home</Link>
          <Link className="secondary-action" href="/account"><ArrowLeft size={16} /> Account</Link>
        </div>
      </section>
    </main>
  );
}
