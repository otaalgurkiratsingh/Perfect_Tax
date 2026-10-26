import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/Brand";
import { publicIntakeConfig } from "@/lib/config/public";
import { DocRequestUpload } from "./DocRequestUpload";

export const metadata: Metadata = { title: "Upload documents" };
export const dynamic = "force-dynamic";

export default function UploadPage() {
  const cfg = publicIntakeConfig();
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <DocRequestUpload firmPhone={cfg.firmPhone} />
      </main>
      <PublicFooter />
    </div>
  );
}
