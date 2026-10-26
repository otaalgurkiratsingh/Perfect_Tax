import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { firmConfig } from "@firm/config";
import { verifySignedValue } from "@/lib/security/tokens";
import { UnsubscribeButton } from "./UnsubscribeButton";

export const metadata: Metadata = { title: "Unsubscribe" };
export const dynamic = "force-dynamic";

// Email unsubscribe (CASL). The link is signed so it can't be used to opt out
// someone else. A button press is required, so email link-scanners can't trigger it.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { c, a, s } = await searchParams;
  let address = "";
  try {
    address = Buffer.from(a ?? "", "base64url").toString("utf8");
  } catch {
    address = "";
  }
  const valid = (c === "email" || c === "sms") && Boolean(address) && Boolean(s) && verifySignedValue(`${c}:${address}`, s!);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-bold">Unsubscribe</h1>
        {valid ? (
          <>
            <p className="mt-3 text-lg">
              Stop automated {c === "email" ? "emails" : "text messages"} from {firmConfig.firm.name} to <b>{address}</b>?
            </p>
            <p className="mt-2 text-gray-700">
              We may still need to contact you about work you&apos;ve asked us to do — we&apos;ll do that personally.
            </p>
            <UnsubscribeButton channel={c!} a={a!} s={s!} />
          </>
        ) : (
          <p className="mt-3 text-lg">This unsubscribe link isn&apos;t valid. Please call us at {firmConfig.firm.phone} and we&apos;ll take care of it.</p>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
