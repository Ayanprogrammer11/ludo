"use client";

import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="status-page">
      <section className="status-panel">
        <TriangleAlert size={34} aria-hidden="true" />
        <div>
          <span className="eyebrow">Something slipped</span>
          <h1>The table needs a quick reset.</h1>
          <p>Try the request again. If the problem stays, head home and start fresh.</p>
        </div>
        <div className="status-actions">
          <button className="primary-action" type="button" onClick={() => unstable_retry()}>
            <RotateCcw size={16} /> Try again
          </button>
          <Link className="secondary-action" href="/"><Home size={16} /> Home</Link>
        </div>
      </section>
    </main>
  );
}
