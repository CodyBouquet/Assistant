import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// Lazy connection. Importing this module must not throw, because Next.js
// evaluates server modules at build time (page data collection) even when
// DATABASE_URL isn't available. The connection is established on first
// query, not on import.

let _db: DrizzleDb | null = null;

function init(): DrizzleDb {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 1,
    prepare: false,
  });
  _db = drizzle(client, { schema });
  return _db;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const instance = init();
    const val = Reflect.get(instance, prop, instance);
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export { schema };
