"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { convertToClient } from "@/app/staff/(app)/intakes/[id]/actions";
import { staffButtonSecondary } from "./AuthCard";

export function CreateClientButton({ intakeId, existingClientId }: { intakeId: string; existingClientId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (existingClientId) {
    return (
      <Link href={`/staff/clients/${existingClientId}`} className={staffButtonSecondary}>
        Open client record
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={staffButtonSecondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await convertToClient(intakeId);
            if (r.clientId) router.push(`/staff/clients/${r.clientId}`);
            else setError(r.error ?? "Could not create client");
          })
        }
      >
        Create client
      </button>
      {error ? <span className="text-red-700">{error}</span> : null}
    </span>
  );
}
