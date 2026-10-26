import type { Metadata } from "next";
import { firmConfig } from "@firm/config";
import { fillFirmText } from "@/lib/config";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { StartForm } from "./StartForm";

export const metadata: Metadata = { title: "Become a client" };
export const dynamic = "force-dynamic";

export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const kiosk = sp.kiosk === "1";
  const slots = firmConfig.intake.documentSlots.filter((d) => d.key !== "other");
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-3xl font-bold">Become a client</h1>
        <p className="mt-3 text-lg text-gray-800">{fillFirmText(firmConfig.intake.startIntro)}</p>
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Helpful to have nearby</h2>
          <p className="mt-1 text-gray-600">Don&apos;t have them all? No problem — you can send them later.</p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-lg">
            {slots.map((s) => (
              <li key={s.key}>{s.label}</li>
            ))}
          </ul>
        </section>
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Your information is safe</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-gray-800">
            {firmConfig.intake.safetyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
        <StartForm kiosk={kiosk} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
      </main>
      <PublicFooter />
    </div>
  );
}
