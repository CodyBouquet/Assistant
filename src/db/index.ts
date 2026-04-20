import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// During `next build`, NEXT_PHASE === 'phase-production-build' and
// DATABASE_URL may be missing (the build can run before the DB is wired).
// postgres() is non-connecting — it's safe to construct with a placeholder
// so the drizzle instance is a real pg instance that Auth.js's DrizzleAdapter
// can type-detect. Any actual query would fail loudly, but authenticated
// routes are force-dynamic and don't run at build time.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const connectionString =
  process.env.DATABASE_URL ??
  (isBuild
    ? "postgresql://build:build@127.0.0.1:5432/build"
    : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  prepare: false,
});

export const db = drizzle(client, { schema });
export { schema };
