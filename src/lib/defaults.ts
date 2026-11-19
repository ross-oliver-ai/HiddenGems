import { db } from "@/db";
import { categories, postalServices } from "@/db/schema";

export const DEFAULT_CATEGORIES = [
  "Women's clothing",
  "Men's clothing",
  "Kids' clothing",
  "Shoes",
  "Bags & accessories",
  "Books",
  "Home & kitchen",
  "Toys & games",
  "Electronics",
  "Other",
];

export const DEFAULT_POSTAL_SERVICES = ["Royal Mail", "InPost", "Evri"];

export async function seedUserDefaults(userId: number) {
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((name) => ({ userId, name })));
  await db.insert(postalServices).values(DEFAULT_POSTAL_SERVICES.map((name) => ({ userId, name })));
}
