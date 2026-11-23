import { createHash, createDecipheriv } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client";
import { createClient, type User } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type JsonRecord = Record<string, unknown>;
type LocalJson = {
  filePath: string;
  value: unknown;
};

const credentialFields = new Set([
  "access_token",
  "auth_uid",
  "confirmation_token",
  "otp",
  "otp_hash",
  "password",
  "password_confirmation",
  "password_hash",
  "refresh_token",
  "reset_token",
  "session_version",
  "supabase_uid",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsIn(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function scrubCredentials(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map(item => {
      const scrubbed = scrubCredentials(item);
      changed ||= scrubbed.changed;
      return scrubbed.value;
    });
    return { value: items, changed };
  }

  if (!isRecord(value)) return { value, changed: false };

  let changed = false;
  const result: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (credentialFields.has(key.toLowerCase())) {
      changed = true;
      continue;
    }
    const scrubbed = scrubCredentials(item);
    changed ||= scrubbed.changed;
    result[key] = scrubbed.value;
  }
  return { value: result, changed };
}

async function readOptionalJson(filePath: string): Promise<LocalJson | undefined> {
  try {
    return { filePath, value: JSON.parse(await fs.readFile(filePath, "utf8")) };
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw new Error(`Could not read valid JSON from ${filePath}.`, { cause: error });
  }
}

async function getDecryptionKeys(dataDir: string): Promise<Buffer[]> {
  const secrets = [
    process.env.FUSSION_AUTH_ENCRYPTION_KEY,
    process.env.FUSSION_SESSION_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  try {
    const persisted = (await fs.readFile(path.join(dataDir, ".auth-secret"), "utf8")).trim();
    if (persisted) secrets.push(persisted);
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") throw error;
  }

  return [...new Set(secrets)].map(secret =>
    createHash("sha256").update(secret).digest(),
  );
}

async function decryptLegacyEmail(value: string, keys: Buffer[]): Promise<string> {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted)
    throw new Error("A legacy account has an invalid encrypted email.");

  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch { }
  }

  throw new Error("A legacy account email could not be decrypted with configured keys.");
}

function addPlainAuthEvidence(
  value: unknown,
  emails: Set<string>,
  userIds: Set<string>,
) {
  for (const item of recordsIn(value)) {
    if (!isRecord(item)) continue;
    const email = normalizeEmail(item.email);
    if (email) emails.add(email);
    if (typeof item.supabase_uid === "string" && item.supabase_uid)
      userIds.add(item.supabase_uid);
  }
}

async function collectLegacyAuthEvidence(
  values: unknown[],
  emails: Set<string>,
  userIds: Set<string>,
  keys: Buffer[],
) {
  addPlainAuthEvidence(values, emails, userIds);
  for (const item of recordsIn(values)) {
    if (!isRecord(item)) continue;
    const encryptedEmail = item.recovery_email_encrypted ?? item.email_encrypted;
    if (typeof encryptedEmail === "string")
      emails.add((await decryptLegacyEmail(encryptedEmail, keys)).trim().toLowerCase());
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const setupToken = process.env.FUSSION_ADMIN_SETUP_TOKEN;
  if (!connectionString || !supabaseUrl || !serviceRoleKey)
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY are required.");
  if (apply && (!setupToken || setupToken.length < 32))
    throw new Error("Configure FUSSION_ADMIN_SETUP_TOKEN with at least 32 characters before applying the reset.");

  const dataDir = path.resolve(process.env.FUSSION_DATA_DIR || "./data");
  const keys = await getDecryptionKeys(dataDir);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    const [vendorRecords, requestRecords, authRecords, otpRecords, setupClaim] =
      await Promise.all([
        prisma.storeRecord.findMany({ where: { collection: "vendors" } }),
        prisma.storeRecord.findMany({ where: { collection: "vendor_requests" } }),
        prisma.storeRecord.findMany({ where: { collection: "users_auth" } }),
        prisma.storeRecord.findMany({ where: { collection: "auth_otps" } }),
        prisma.storeRecord.findMany({
          where: { collection: "system_flags", recordId: "first_admin_registration" },
          select: { recordId: true },
        }),
      ]);

    const localFiles = await Promise.all([
      "users_auth.json",
      "users_auth.json.bak",
      "auth_otps.json",
      "auth_otps.json.bak",
      "vendor_requests",
      "vendor_requests.json",
      "vendor_requests.json.bak",
      "vendors.json",
      "vendors.json.bak",
    ].map(file => readOptionalJson(path.join(dataDir, file))));
    const presentFiles = localFiles.filter((file): file is LocalJson => Boolean(file));
    const vendorEmails = new Set<string>();
    const authEmails = new Set<string>();
    const authUserIds = new Set<string>();
    const addVendorEvidence = (records: unknown[]) => {
      for (const item of records) {
        if (!isRecord(item)) continue;
        const email = normalizeEmail(item.email);
        if (email) vendorEmails.add(email);
        if (typeof item.supabase_uid === "string" && item.supabase_uid)
          authUserIds.add(item.supabase_uid);
      }
    };

    addVendorEvidence(vendorRecords.map(record => record.data));
    addVendorEvidence(requestRecords.map(record => record.data));
    for (const file of presentFiles) {
      const base = path.basename(file.filePath);
      if (base.startsWith("vendors.json") || base.startsWith("vendor_requests"))
        addVendorEvidence(recordsIn(file.value));
    }

    await collectLegacyAuthEvidence(
      authRecords.map(record => record.data),
      authEmails,
      authUserIds,
      keys,
    );
    for (const file of presentFiles) {
      if (path.basename(file.filePath).startsWith("users_auth.json"))
        await collectLegacyAuthEvidence(recordsIn(file.value), authEmails, authUserIds, keys);
    }

    const authUsers: User[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`Could not list Supabase Auth users: ${error.message}`);
      authUsers.push(...data.users);
      if (data.users.length < 1000) break;
    }
    const usersToDelete = authUsers.filter(user => {
      const role = user.app_metadata?.role;
      const email = normalizeEmail(user.email);
      return role === "admin" || role === "vendor" ||
        authUserIds.has(user.id) ||
        Boolean(email && (vendorEmails.has(email) || authEmails.has(email)));
    });

    const sanitizedRequests = requestRecords.flatMap(record => {
      const result = scrubCredentials(record.data);
      return result.changed ? [{ record, data: result.value }] : [];
    });
    const localWrites = presentFiles.flatMap(file => {
      const base = path.basename(file.filePath);
      if (base.startsWith("users_auth.json") || base.startsWith("auth_otps.json")) {
        const emptyValue = Array.isArray(file.value) ? [] : {};
        return JSON.stringify(file.value) === JSON.stringify(emptyValue)
          ? []
          : [{ ...file, value: emptyValue }];
      }
      if (base.startsWith("vendor_requests")) {
        const result = scrubCredentials(file.value);
        return result.changed ? [{ ...file, value: result.value }] : [];
      }
      return [];
    });

    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      authUsersEligibleForDeletion: usersToDelete.length,
      authAdmins: usersToDelete.filter(user => user.app_metadata?.role === "admin").length,
      authVendors: usersToDelete.filter(user => user.app_metadata?.role === "vendor").length,
      otherLinkedAuthUsers: usersToDelete.filter(user =>
        user.app_metadata?.role !== "admin" && user.app_metadata?.role !== "vendor",
      ).length,
      vendorProfilesPreserved: vendorRecords.length,
      vendorApplicationsPreserved: requestRecords.length,
      legacyAuthRecordsToClear: authRecords.length,
      legacyResetTokensToClear: otpRecords.length,
      adminSetupClaimsToClear: setupClaim.length,
      applicationsWithCredentialFieldsToScrub: sanitizedRequests.length,
      localCredentialFilesToUpdate: localWrites.length,
      adminSetupTokenReady: Boolean(setupToken && setupToken.length >= 32),
      storeContentTouched: false,
    }));

    if (!apply) {
      console.log("Dry run only. Re-run with --apply to execute this exact scope.");
      return;
    }

    let deletedUsers = 0;
    for (const user of usersToDelete) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error)
        throw new Error(`Failed to delete a targeted Auth identity after ${deletedUsers} of ${usersToDelete.length} deletions: ${error.message}`);
      deletedUsers += 1;
    }

    await prisma.$transaction(async tx => {
      await tx.storeRecord.deleteMany({ where: { collection: "users_auth" } });
      await tx.storeRecord.deleteMany({ where: { collection: "auth_otps" } });
      await tx.storeRecord.deleteMany({
        where: { collection: "system_flags", recordId: "first_admin_registration" },
      });
      for (const item of sanitizedRequests) {
        await tx.storeRecord.update({
          where: {
            collection_recordId: {
              collection: "vendor_requests",
              recordId: item.record.recordId,
            },
          },
          data: { data: JSON.parse(JSON.stringify(item.data)) as Prisma.InputJsonValue },
        });
      }
    }, { maxWait: 15000, timeout: 30000 });

    for (const file of localWrites) {
      await fs.writeFile(file.filePath, `${JSON.stringify(file.value, null, 2)}\n`, "utf8");
    }

    console.log(`Reset complete. Deleted ${deletedUsers} targeted Auth identities; vendor profiles, applications, and store content were preserved.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("Credential reset failed:", error);
  process.exitCode = 1;
});
