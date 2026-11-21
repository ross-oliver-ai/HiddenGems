-- Capitalise the first letter of every word in existing category names ("Women's clothing" -> "Women's Clothing").
-- Only first letters change; the rest of each word is left exactly as the user typed it.
UPDATE "categories" SET "name" = (
  SELECT string_agg(upper(left(w, 1)) || substr(w, 2), ' ' ORDER BY ord)
  FROM unnest(string_to_array("categories"."name", ' ')) WITH ORDINALITY AS t(w, ord)
)
WHERE "name" ~ '(^| )[a-z]';
