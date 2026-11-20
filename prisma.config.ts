import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js precedence: local overrides first, then root .env defaults.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma Migrate needs Supabase's direct connection. The app uses the
    // pooled URL from DATABASE_URL at runtime.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
