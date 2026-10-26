import type { Metadata } from "next";
import QRCode from "qrcode";
import { firmConfig } from "@firm/config";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/staff/auth";

export const metadata: Metadata = { title: "Office QR code" };

// Printable sign for the office: clients scan with their own phone.
export default async function QrPage() {
  await requireStaff();
  const url = `${env.siteUrl}/start`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">Office QR code</h1>
        <p className="text-gray-600">
          Print this and put it at the front desk. For an office tablet, open <code className="font-mono">{url}?kiosk=1</code> — it forgets the
          client&apos;s answers after they finish.
        </p>
      </div>
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow print:shadow-none">
        <p className="text-2xl font-black">{firmConfig.firm.name}</p>
        <p className="mt-2 text-xl">New client? Scan to get started</p>
        <div className="mx-auto mt-6 w-64" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 break-all font-mono text-sm">{url}</p>
        <p className="mt-2 text-gray-600">About {firmConfig.intake.estimatedMinutes} minutes · works on any phone</p>
      </div>
    </div>
  );
}
