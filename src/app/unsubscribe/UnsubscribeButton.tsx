"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeButton({ channel, a, s }: { channel: string; a: string; s: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="mt-6 rounded-xl bg-green-700 p-4 text-lg font-semibold text-white">Done — you&apos;re unsubscribed.</p>;
  return (
    <div className="mt-6 space-y-3">
      <Button disabled={pending} onClick={() => start(async () => setDone((await confirmUnsubscribe(channel, a, s)).ok))}>
        Yes, unsubscribe me
      </Button>
      {done === false ? <p className="text-red-700">Something went wrong. Please try again later.</p> : null}
    </div>
  );
}
