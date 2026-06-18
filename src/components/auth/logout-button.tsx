"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

export function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button className="nav-button icon-nav-button" type="submit" disabled={pending} aria-label={pending ? "Signing out" : "Sign out"} title={pending ? "Signing out" : "Sign out"}>
      {pending ? <LoaderCircle className="spin" size={14} /> : <LogOut size={14} />}
    </button>
  );
}
