-- "Where from" starter entries: add Car Boot, Charity Shop, Online Auction and Own Wardrobe to every existing account that
-- doesn't already have one with that name (any capitalisation, hidden or not). Nothing is renamed, hidden or deleted.
INSERT INTO "shops" ("user_id", "name")
SELECT u."id", d."name"
FROM "users" u
CROSS JOIN (VALUES ('Car Boot'), ('Charity Shop'), ('Online Auction'), ('Own Wardrobe')) AS d("name")
WHERE NOT EXISTS (
  SELECT 1 FROM "shops" s WHERE s."user_id" = u."id" AND lower(s."name") = lower(d."name")
);
