"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="status-page">
          <section className="status-panel">
            <title>Ludo - Something went wrong</title>
            <div>
              <span className="eyebrow">Application error</span>
              <h1>The game could not finish loading.</h1>
              <p>Retry the render, or return home with a full page load.</p>
            </div>
            <div className="status-actions">
              <button className="primary-action" type="button" onClick={() => unstable_retry()}>
                <RotateCcw size={16} /> Try again
              </button>
              <Link className="secondary-action" href="/">Home</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
