// Runs before `next build` on Vercel production deploys so the database is always updated
// with (or before) the new code. If it fails, the build fails and the live site is left untouched.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  if (process.env.VERCEL_ENV !== "production" && process.env.MIGRATE_ON_BUILD !== "1") {
    console.log("Skipping database migrations (not a production deploy)");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL isn't set, so the database can't be updated");
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes(".railway.internal") ? undefined : { rejectUnauthorized: false },
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Database migration failed:", e);
  process.exit(1);
});
