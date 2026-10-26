/**
 * Demo / test data. LOCAL USE ONLY.
 *
 *   npm run db:seed                 (against the local Supabase from `npx supabase start`)
 *   npm run db:seed -- --allow-remote   (only for a throw-away demo project — never production)
 *
 * Creates:
 *   - an admin login (seed-admin@example.com; password printed below)
 *   - 3 intakes: individual (complete), couple (partial, abandoned, 1 reminder sent),
 *     business (submitted, missing documents requested)
 *   - 5 company clients in the last quarter, one per board status, with "Seed Trucking Ltd"
 *     run through the full cycle (requested → uploads → complete → statements read → processed)
 *
 * Messages are forced into dry-run mode. Re-running replaces the previous seed data.
 */
import { randomBytes } from "node:crypto";
import { loadEnvFile } from "./env";

loadEnvFile();
process.env.MESSAGING_MODE = "dry_run";

const SEED = "seed-";
const DAY = 86_400_000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes("--allow-remote")) {
    throw new Error(`Refusing to seed ${url}: not a local database. Pass --allow-remote only for a throw-away demo project.`);
  }
  const { adminClient, DOCUMENTS_BUCKET } = await import("@/lib/supabase/admin");
  const { createDraft, getIntake, saveDraft, submitIntake } = await import("@/lib/intake/server");
  const { createDocRequest } = await import("@/lib/docRequests");
  const { openQuarter, sendDayZeroRequests, loadClientQuarter, syncItemFromFiles, refreshClientQuarterStatus } = await import("@/lib/quarterly/engine");
  const { previousQuarter, quarterInfo } = await import("@/lib/quarterly/periods");
  const { extractStatement } = await import("@/lib/extraction");
  const { makeStatement, makeScannedStatement } = await import("../tests/fixtures/statements");
  const { PNG_1PX } = await import("../tests/fixtures/png");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const db = adminClient();

  const pdf = async (title: string) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.drawText(`${title} (sample document — not real)`, { x: 50, y: 740, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
    return Buffer.from(await doc.save());
  };
  const putFile = async (row: Record<string, unknown>, folder: string, name: string, bytes: Buffer, mime: string) => {
    const ext = name.split(".").pop();
    const path = `${folder}/${randomBytes(8).toString("hex")}.${ext}`;
    const { error } = await db.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: mime });
    if (error) throw new Error(`upload ${name}: ${error.message}`);
    const { data, error: e2 } = await db
      .from("documents")
      .insert({ ...row, storage_path: path, original_name: name, mime_type: mime, size_bytes: bytes.length, status: "uploaded", uploaded_at: new Date().toISOString() })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return data.id as string;
  };

  // ---------------------------------------------------------------- cleanup
  const { data: oldIntakes } = await db.from("intakes").select("id").like("email", `${SEED}%`);
  const { data: oldClients } = await db.from("clients").select("id").like("email", `${SEED}%`);
  const { data: oldDocs } = await db
    .from("documents")
    .select("storage_path")
    .or(
      [
        oldIntakes?.length ? `intake_id.in.(${oldIntakes.map((i) => i.id).join(",")})` : "",
        oldClients?.length ? `client_id.in.(${oldClients.map((c) => c.id).join(",")})` : "",
      ]
        .filter(Boolean)
        .join(",") || "id.is.null",
    );
  if (oldDocs?.length) await db.storage.from(DOCUMENTS_BUCKET).remove(oldDocs.map((d) => d.storage_path));
  if (oldIntakes?.length) await db.from("intakes").delete().in("id", oldIntakes.map((i) => i.id));
  if (oldClients?.length) await db.from("clients").delete().in("id", oldClients.map((c) => c.id));

  // ---------------------------------------------------------------- admin
  const adminEmail = `${SEED}admin@example.com`;
  const password = process.env.SEED_ADMIN_PASSWORD ?? `Seed-${randomBytes(9).toString("base64url")}9a`;
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  let adminId = users.users.find((u) => u.email === adminEmail)?.id;
  if (adminId) {
    await db.auth.admin.updateUserById(adminId, { password });
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
    if (error) throw error;
    adminId = data.user!.id;
  }
  await db.from("staff_profiles").upsert({ id: adminId, email: adminEmail, full_name: "Seed Admin", role: "admin", active: true });

  const consents = { engagement: true, privacy: true, communications: true, cra_authorization: true };
  const meta = { ip: "127.0.0.1", userAgent: "seed script" };
  const draft = async (answers: Record<string, unknown>, sins: { sin?: string; spouseSin?: string }, step: number) => {
    const { intakeId } = await createDraft({ kiosk: false });
    const { data: tok } = await db.from("access_tokens").select("id").eq("intake_id", intakeId).single();
    const intake = (await getIntake(intakeId))!;
    const r = await saveDraft(intake, { step, answers, ...sins }, tok!.id);
    if (!r.ok) throw new Error(`seed answers invalid: ${JSON.stringify(r.errors)}`);
    return intakeId;
  };
  const address = { street: "100 Sample Avenue", city: "Brampton", province: "ON", postalCode: "L6X 0A1" };

  // ---------------------------------------------------------------- intake 1: individual, complete
  const ind = await draft(
    {
      applicantType: "individual",
      primary: { fullLegalName: "Aman Seed Grewal", dateOfBirth: "1986-05-14", email: `${SEED}aman@example.com`, mobile: "416-555-0101", address, maritalStatus: "single", residencyStatus: "citizen" },
      services: ["t1_personal", "us_tax"],
      situation: { hadPreviousAccountant: true, previousAccountantName: "Sample Tax Co.", yearsUnfiled: 0, receivedCraLetter: false, urgentDeadline: false },
      referral: { source: "google" },
    },
    { sin: "130 692 544" },
    7,
  );
  await putFile({ intake_id: ind, doc_type: "government_id", source: "intake" }, `intakes/${ind}/government_id`, "drivers-licence.png", PNG_1PX, "image/png");
  await putFile({ intake_id: ind, doc_type: "last_return_noa", source: "intake" }, `intakes/${ind}/last_return_noa`, "notice-of-assessment-2025.pdf", await pdf("Notice of Assessment 2025"), "application/pdf");
  await putFile({ intake_id: ind, doc_type: "tax_slips", source: "intake" }, `intakes/${ind}/tax_slips`, "T4-2025.pdf", await pdf("T4 2025"), "application/pdf");
  const s1 = await submitIntake((await getIntake(ind))!, consents, meta);
  if (!s1.ok) throw new Error(`submit individual: ${JSON.stringify(s1)}`);

  // ---------------------------------------------------------------- intake 2: couple, partial + abandoned
  const couple = await draft(
    {
      applicantType: "couple",
      primary: { fullLegalName: "Ravinder Seed Sidhu", dateOfBirth: "1979-02-03", email: `${SEED}ravinder@example.com`, mobile: "647-555-0102", address, maritalStatus: "married", residencyStatus: "permanent_resident" },
      spouse: { fullLegalName: "Harleen Seed Sidhu", dateOfBirth: "1981-09-21", residencyStatus: "permanent_resident" },
      services: ["t1_personal"],
    },
    {},
    3,
  );
  await db
    .from("intakes")
    .update({ last_activity_at: new Date(Date.now() - 30 * 3_600_000).toISOString(), abandon_reminders_sent: 1, last_abandon_reminder_at: new Date(Date.now() - 6 * 3_600_000).toISOString() })
    .eq("id", couple);

  // ---------------------------------------------------------------- intake 3: business, missing docs
  const biz = await draft(
    {
      applicantType: "business",
      businessEntity: "corporation",
      primary: { fullLegalName: "Jaswinder Seed Bains", email: `${SEED}jaswinder@example.com`, mobile: "905-555-0103", role: "Director" },
      business: {
        legalName: "Seed Freight Inc.",
        businessNumber: "123456789",
        fiscalYearEnd: "12-31",
        incorporationDate: "2021-03-15",
        incorporationProvince: "ON",
        industry: "Trucking & transportation",
      },
      services: ["t2_corporate", "bookkeeping", "payroll", "hst_gst"],
      situation: { hadPreviousAccountant: false, yearsUnfiled: 1, receivedCraLetter: true, craLetterDetails: "HST review letter", urgentDeadline: true, deadlineDate: "2026-11-30" },
      referral: { source: "referral", detail: "Aman Grewal" },
    },
    {},
    7,
  );
  await putFile({ intake_id: biz, doc_type: "government_id", source: "intake" }, `intakes/${biz}/government_id`, "passport.png", PNG_1PX, "image/png");
  const s3 = await submitIntake((await getIntake(biz))!, consents, meta);
  if (!s3.ok) throw new Error(`submit business: ${JSON.stringify(s3)}`);
  await createDocRequest({ intakeId: biz, items: ["incorporation_docs", "void_cheque"], note: "Articles of incorporation and a void business cheque, please.", staffId: adminId });

  // ---------------------------------------------------------------- quarterly clients
  const mkClient = async (business_name: string, contact_name: string, key: string, services: string[]) => {
    const { data, error } = await db
      .from("clients")
      .insert({ business_name, contact_name, email: `${SEED}${key}@example.com`, phone: "+14165550199", whatsapp_phone: "+14165550199", services })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  };
  const trucking = await mkClient("Seed Trucking Ltd", "Gurpreet Seed", "trucking", ["bookkeeping", "payroll", "hst"]);
  const bakery = await mkClient("Seed Bakery Inc.", "Navneet Seed", "bakery", ["bookkeeping"]);
  const plumbing = await mkClient("Seed Plumbing", "Kulwant Seed", "plumbing", ["payroll"]);
  const consulting = await mkClient("Seed Consulting", "Simran Seed", "consulting", ["hst"]);
  await mkClient("Seed Cleaning Co.", "Manpreet Seed", "cleaning", ["hst"]);
  await db.from("intakes").update({ client_id: trucking.id }).eq("id", biz);

  const { year, quarter } = previousQuarter();
  const label = quarterInfo(year, quarter).label;
  await db.from("quarters").delete().eq("label", label).eq("opened_by", adminId); // replace an earlier seed quarter
  const { data: existingQ } = await db.from("quarters").select("id").eq("label", label).maybeSingle();
  if (existingQ) throw new Error(`${label} already exists and wasn't created by the seed — not touching it.`);
  const opened = await openQuarter(year, quarter, adminId);
  const cqOf = async (clientId: string) => (await db.from("client_quarters").select("id").eq("client_id", clientId).eq("quarter_id", opened.quarter.id).single()).data!.id as string;

  for (const c of [trucking, bakery, plumbing, consulting]) await sendDayZeroRequests(opened.quarter.id, await cqOf(c.id));

  // Seed Trucking: full cycle.
  const tq = await loadClientQuarter(await cqOf(trucking.id));
  const folder = (key: string) => `clients/${trucking.id}/${label}/${key}`;
  const bankItem = tq!.items.find((i) => i.item_key === "bank_statements")!;
  const stA = await makeStatement({ layout: "A", seed: 11, year, quarter, count: 42, opening: 18250.75 });
  const stB = await makeStatement({ layout: "B", seed: 12, year, quarter, count: 25, opening: 3120.0, bankName: "Prairie Commerce Bank" });
  const bankDocs = [
    await putFile({ client_id: trucking.id, client_quarter_id: tq!.cq.id, checklist_item_id: bankItem.id, doc_type: "bank_statements", source: "quarter_link" }, folder("bank_statements"), "operating-account.pdf", stA.bytes, "application/pdf"),
    await putFile({ client_id: trucking.id, client_quarter_id: tq!.cq.id, checklist_item_id: bankItem.id, doc_type: "bank_statements", source: "quarter_link" }, folder("bank_statements"), "savings-account.pdf", stB.bytes, "application/pdf"),
    await putFile({ client_id: trucking.id, client_quarter_id: tq!.cq.id, checklist_item_id: bankItem.id, doc_type: "bank_statements", source: "quarter_link" }, folder("bank_statements"), "visa-photo-scan.pdf", await makeScannedStatement(), "application/pdf"),
  ];
  for (const item of tq!.items) {
    if (item.item_key === "bank_statements") continue;
    if (["pay_stubs", "sales_summary", "cheque_images"].includes(item.item_key)) {
      await putFile({ client_id: trucking.id, client_quarter_id: tq!.cq.id, checklist_item_id: item.id, doc_type: item.item_key, source: "quarter_link" }, folder(item.item_key), `${item.item_key}.pdf`, await pdf(item.label), "application/pdf");
    } else {
      await db.from("checklist_items").update({ status: "not_applicable", client_note: "Nothing this quarter", received_at: new Date().toISOString() }).eq("id", item.id);
    }
  }
  for (const item of tq!.items) await syncItemFromFiles(item.id);
  for (const docId of bankDocs) {
    const { data: d } = await db.from("documents").select("storage_path").eq("id", docId).single();
    const { data: file } = await db.storage.from(DOCUMENTS_BUCKET).download(d!.storage_path);
    const r = await extractStatement(new Uint8Array(await file!.arrayBuffer()));
    await db.from("extractions").insert({
      document_id: docId,
      client_quarter_id: tq!.cq.id,
      status: r.failed ? "failed" : r.status,
      confidence: r.confidence,
      reason: r.reason,
      transaction_count: r.transactions.length,
      total_debits: r.status === "extracted" ? r.totalDebits : null,
      total_credits: r.status === "extracted" ? r.totalCredits : null,
      opening_balance: r.openingBalance,
      closing_balance: r.closingBalance,
      reconciled: r.reconciled,
      transactions: r.transactions,
      created_by: adminId,
    });
  }
  await db.from("client_quarters").update({ status: "processed", processed_at: new Date().toISOString(), processed_by: adminId }).eq("id", tq!.cq.id);

  // Seed Bakery: partial (one item in). Seed Consulting: complete (nothing to send). Plumbing: requested. Cleaning: not sent.
  const bq = await loadClientQuarter(await cqOf(bakery.id));
  const cheque = bq!.items.find((i) => i.item_key === "cheque_images")!;
  await putFile({ client_id: bakery.id, client_quarter_id: bq!.cq.id, checklist_item_id: cheque.id, doc_type: "cheque_images", source: "quarter_link" }, `clients/${bakery.id}/${label}/cheque_images`, "cheques.png", PNG_1PX, "image/png");
  await syncItemFromFiles(cheque.id);
  const cq4 = await loadClientQuarter(await cqOf(consulting.id));
  for (const item of cq4!.items) await db.from("checklist_items").update({ status: "not_applicable", received_at: new Date().toISOString() }).eq("id", item.id);
  await refreshClientQuarterStatus(cq4!.cq.id);
  // Make the reminder schedule visible on the board.
  await db.from("client_quarters").update({ requested_at: new Date(Date.now() - 9 * DAY).toISOString(), last_reminder_day: 7, last_reminder_at: new Date(Date.now() - 2 * DAY).toISOString() }).in("id", [bq!.cq.id, await cqOf(plumbing.id)]);

  const { data: board } = await db.from("client_quarters").select("status, clients(business_name)").eq("quarter_id", opened.quarter.id);
  console.log("\nSeed complete.\n");
  console.log(`Staff login: ${adminEmail}`);
  console.log(`Password:    ${password}`);
  console.log("(You'll be asked to set up 2-step sign-in with an authenticator app on first login.)\n");
  console.log("Intakes: Aman Seed Grewal (individual, New) · Ravinder Seed Sidhu (couple, unfinished, 1 reminder sent) · Jaswinder Seed Bains / Seed Freight Inc. (business, Docs Missing)");
  console.log(`Quarter ${label}:`);
  for (const r of (board ?? []) as unknown as { status: string; clients: { business_name: string } }[]) console.log(`  ${r.clients.business_name.padEnd(22)} ${r.status}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
