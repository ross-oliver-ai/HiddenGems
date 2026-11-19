// Creates (or resets) the admin account.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='something-long' npm run db:seed
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users } from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!url || !email || !password) {
    throw new Error("Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD");
  }
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes(".railway.internal") ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool);
  const passwordHash = await bcrypt.hash(password, 12);

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, role: "admin", mustChangePassword: false, disabled: false })
      .where(eq(users.id, existing.id));
    console.log(`Updated admin account ${email}`);
  } else {
    await db.insert(users).values({
      email,
      name: "Admin",
      passwordHash,
      role: "admin",
      mustChangePassword: false,
    });
    console.log(`Created admin account ${email}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
