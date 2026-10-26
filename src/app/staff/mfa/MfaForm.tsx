"use client";

import { useActionState, useEffect, useState } from "react";
import { startMfaEnrollment, verifyMfa, type FormState, type MfaEnrollment } from "../actions";
import { staffButton, staffInput } from "@/components/staff/AuthCard";

export function MfaForm({ factorId }: { factorId: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyMfa, {});
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (factorId) return;
    startMfaEnrollment().then((r) => ("error" in r ? setError(r.error) : setEnrollment(r)));
  }, [factorId]);

  const id = factorId ?? enrollment?.factorId;
  return (
    <div className="space-y-4">
      {!factorId ? (
        <>
          <p className="text-gray-700">
            For client privacy, the dashboard needs a second step at sign-in. Scan this code with an authenticator app (Google
            Authenticator, Microsoft Authenticator, 1Password…), then type the 6-digit code it shows.
          </p>
          {enrollment ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt="QR code for your authenticator app" className="mx-auto h-48 w-48" />
              <p className="text-center text-sm text-gray-600">
                Can&apos;t scan? Enter this key: <code data-testid="mfa-secret" className="break-all font-mono">{enrollment.secret}</code>
              </p>
            </>
          ) : (
            <p>{error ?? "Preparing…"}</p>
          )}
        </>
      ) : (
        <p className="text-gray-700">Open your authenticator app and type the current 6-digit code.</p>
      )}
      {id ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="factorId" value={id} />
          <input type="hidden" name="enrolling" value={factorId ? "0" : "1"} />
          <label className="block font-medium">
            6-digit code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className={`${staffInput} font-mono tracking-widest`} />
          </label>
          {state.error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {state.error}
            </p>
          ) : null}
          <button disabled={pending} className={`${staffButton} w-full`}>
            {pending ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
