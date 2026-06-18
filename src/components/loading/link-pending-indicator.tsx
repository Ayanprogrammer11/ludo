"use client";

import { useLinkStatus } from "next/link";

export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span className={`link-hint ${pending ? "is-pending" : ""}`} aria-hidden="true" />;
}
