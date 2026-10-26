import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { firmConfig } from "@firm/config";
import { QuarterUpload } from "@/components/public/QuarterUpload";

export const metadata: Metadata = { title: "Upload your documents" };
export const dynamic = "force-dynamic";

export default function QuarterLinkPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <QuarterUpload firmPhone={firmConfig.firm.phone} />
      </main>
      <PublicFooter />
    </div>
  );
}
