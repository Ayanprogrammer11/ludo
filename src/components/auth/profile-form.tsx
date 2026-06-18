"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState } from "react";
import type { AuthActionState } from "@/lib/auth/actions";
import { updateProfileAction } from "@/lib/auth/actions";

const initialState: AuthActionState = { message: "" };

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form className="profile-form" action={action} aria-busy={pending}>
      <label>
        <span>Display name</span>
        <input name="displayName" defaultValue={displayName} minLength={2} maxLength={24} required />
        {state.errors?.displayName ? <small>{state.errors.displayName[0]}</small> : null}
      </label>
      {state.message ? <p className={state.message === "Profile updated." ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
      <button className="secondary-action" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
