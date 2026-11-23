import { db } from "@/db";
import { categories, platforms, postalServices, shops } from "@/db/schema";

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

/** "Where from" starter entries (A to Z). Anyone can rename, hide or add to them. */
export const DEFAULT_SHOPS = ["Car Boot", "Charity Shop", "Online Auction", "Own Wardrobe"];

export const DEFAULT_POSTAL_SERVICES = ["Royal Mail", "InPost", "Evri"];

/** In this order: the first one is what a new listing starts with. */
export const DEFAULT_PLATFORMS = ["Vinted", "eBay", "Depop", "Facebook Marketplace", "Gumtree"];

export async function seedUserDefaults(userId: number) {
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((name) => ({ userId, name })));
  await db.insert(postalServices).values(DEFAULT_POSTAL_SERVICES.map((name) => ({ userId, name })));
  await db.insert(platforms).values(DEFAULT_PLATFORMS.map((name) => ({ userId, name })));
  await db.insert(shops).values(DEFAULT_SHOPS.map((name) => ({ userId, name })));
}
