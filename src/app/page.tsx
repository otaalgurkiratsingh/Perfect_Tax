import Link from "next/link";
import { firmConfig } from "@firm/config";
import { BrandMark, PublicFooter } from "@/components/Brand";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="bg-white border-b-4 border-accent">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <BrandMark size="lg" />
        </div>
      </section>
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="mt-2 text-gray-700">What would you like to do?</p>
        <div className="mt-6 grid gap-4">
          <Link href="/start" className="block rounded-xl bg-accent px-5 py-5 text-accent-text shadow">
            <span className="block text-xl font-bold">Become a client</span>
            <span className="block opacity-90">About {firmConfig.intake.estimatedMinutes} minutes · works on any phone</span>
          </Link>
          <Link href="/portal/login" className="block rounded-xl border-2 border-brand bg-white px-5 py-5">
            <span className="block text-xl font-bold">I&apos;m already a client</span>
            <span className="block text-gray-700">Upload documents for this quarter</span>
          </Link>
        </div>
        <p className="mt-10 text-sm text-gray-500">
          <Link href="/staff/login" className="underline">
            Staff sign in
          </Link>
        </p>
      </section>
      <PublicFooter />
    </main>
  );
}
