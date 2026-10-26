import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { publicIntakeConfig } from "@/lib/config/public";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "Client form" };
export const dynamic = "force-dynamic";

// No third-party scripts on this page: only our own code sees what clients type.
export default function IntakePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4">
        <Wizard cfg={publicIntakeConfig()} />
      </main>
      <PublicFooter />
    </div>
  );
}
