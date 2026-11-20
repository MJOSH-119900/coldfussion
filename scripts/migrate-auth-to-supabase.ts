import dotenv from "dotenv";
import { createHash, createDecipheriv } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type AuthRecord = Record<string, unknown> & {
  role?: string;
  status?: string;
  vendor_id?: string;
  supabase_uid?: string;
  password?: string;
};

function isAuthRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getEncryptionKeys() {
  const configured = [process.env.FUSSION_AUTH_ENCRYPTION_KEY, process.env.FUSSION_SESSION_SECRET]
    .filter((value): value is string => Boolean(value));
  const dataDir = path.resolve(process.env.FUSSION_DATA_DIR || "./data");
  let persisted = "";
  try { persisted = (await fs.readFile(path.join(dataDir, ".auth-secret"), "utf8")).trim(); } catch {}
  const secrets = [...new Set([...configured, persisted].filter(Boolean))];
  if (!secrets.length)
    throw new Error("No authentication encryption key is configured or persisted.");
  return secrets.map(secret => createHash("sha256").update(secret).digest());
}

async function decryptLegacySecret(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted)
    throw new Error("An existing account contains an invalid encrypted email.");
  for (const key of await getEncryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch { }
  }
  throw new Error("Could not decrypt a legacy recovery email with the available encryption keys.");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!connectionString || !supabaseUrl || !publishableKey || !serviceRoleKey || !siteUrl) {
    throw new Error("Set DATABASE_URL, Supabase URL/key/service-role key, and NEXT_PUBLIC_SITE_URL first.");
  }

  const callback = new URL("/auth/callback", siteUrl);
  callback.searchParams.set("next", "/password-reset/complete");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const records = await prisma.storeRecord.findMany({
      where: { collection: "users_auth" },
    });

    for (const record of records) {
      if (!isAuthRecord(record.data))
        continue;
      const authRecord = record.data as AuthRecord;
      if ((authRecord.role !== "admin" && authRecord.role !== "vendor") ||
          authRecord.status !== "active")
        continue;

      const email = authRecord.role === "admin"
        ? await decryptLegacySecret(String(
          authRecord.recovery_email_encrypted || authRecord.email_encrypted || "",
        ))
        : String(authRecord.email || record.recordId);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error(`Could not determine the email for legacy account ${record.recordId}.`);

      let userId = authRecord.supabase_uid;
      let invitationSent = false;
      if (!userId) {
        let page = 1;
        let existingUserId: string | undefined;
        while (!existingUserId) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error)
            throw new Error(`Could not check Supabase Auth users: ${error.message}`);
          existingUserId = data.users.find(
            user => user.email?.toLowerCase() === email.toLowerCase(),
          )?.id;
          if (existingUserId || data.users.length < 1000)
            break;
          page += 1;
        }

        if (existingUserId) {
          userId = existingUserId;
        } else {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: callback.toString(),
          });
          if (error || !data.user) {
            throw new Error(`Could not invite Supabase Auth user for role record ${record.recordId}: ${error?.message || "No user returned."}`);
          }
          userId = data.user.id;
          invitationSent = true;
        }

        const updated = { ...authRecord, supabase_uid: userId };
        delete updated.password;
        await prisma.storeRecord.update({
          where: {
            collection_recordId: {
              collection: "users_auth",
              recordId: record.recordId,
            },
          },
          data: { data: updated as Prisma.InputJsonValue },
        });
      }

      const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: {
          role: authRecord.role,
          ...(authRecord.vendor_id ? { vendor_id: authRecord.vendor_id } : {}),
        },
      });
      if (metadataError)
        throw new Error(`Could not set role metadata for ${email}: ${metadataError.message}`);

      if (!invitationSent) {
        const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: callback.toString(),
        });
        if (resetError)
          throw new Error(`Could not send a password reset email for role record ${record.recordId}: ${resetError.message}`);
      }

      console.log(`Migrated ${authRecord.role} account; setup email sent.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("Supabase Auth migration failed:", error);
  process.exitCode = 1;
});
