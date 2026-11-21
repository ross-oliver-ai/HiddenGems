import { db } from "@/db";
import { categories, postalServices } from "@/db/schema";

export const DEFAULT_CATEGORIES = [
  "Women's Clothing",
  "Men's Clothing",
  "Kids' Clothing",
  "Shoes",
  "Bags & Accessories",
  "Books",
  "Home & Kitchen",
  "Toys & Games",
  "Electronics",
  "Other",
];

export const DEFAULT_POSTAL_SERVICES = ["Royal Mail", "InPost", "Evri"];

export async function seedUserDefaults(userId: number) {
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((name) => ({ userId, name })));
  await db.insert(postalServices).values(DEFAULT_POSTAL_SERVICES.map((name) => ({ userId, name })));
}
