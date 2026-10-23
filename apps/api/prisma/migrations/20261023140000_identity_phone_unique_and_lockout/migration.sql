-- Identidad: correo en minúsculas, teléfono canónico único, bloqueo de ingreso.
-- Defensiva: no elige un correo al azar si chocan; teléfonos inválidos o
-- duplicados se anulan con NOTICE. No obliga correo ni teléfono.

CREATE OR REPLACE FUNCTION identity_normalize_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  compact text;
  digits text;
  candidates int[] := ARRAY[]::int[];
  pos int;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  compact := regexp_replace(btrim(raw), '[\s.\-()]', '', 'g');
  IF compact = '' THEN
    RETURN NULL;
  END IF;

  IF left(compact, 1) = '+' AND left(compact, 3) <> '+54' THEN
    digits := substr(compact, 2);
    IF digits !~ '^\d+$' OR length(digits) < 8 OR length(digits) > 15 THEN
      RETURN NULL;
    END IF;
    RETURN '+' || digits;
  END IF;

  digits := regexp_replace(compact, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF left(digits, 4) = '0054' THEN
    digits := substr(digits, 5);
  ELSIF left(digits, 2) = '54' THEN
    digits := substr(digits, 3);
  END IF;

  IF left(digits, 1) = '0' THEN
    digits := substr(digits, 2);
  END IF;

  IF length(digits) = 11 AND left(digits, 1) = '9' THEN
    digits := substr(digits, 2);
  END IF;

  IF length(digits) = 12 THEN
    FOREACH pos IN ARRAY ARRAY[2, 3, 4] LOOP
      IF substr(digits, pos + 1, 2) = '15' THEN
        candidates := candidates || pos;
      END IF;
    END LOOP;
    IF coalesce(array_length(candidates, 1), 0) > 1 THEN
      RETURN NULL;
    END IF;
    IF coalesce(array_length(candidates, 1), 0) = 1 THEN
      pos := candidates[1];
      digits := left(digits, pos) || substr(digits, pos + 3);
    END IF;
  END IF;

  IF length(digits) <> 10 OR digits !~ '^\d{10}$' THEN
    RETURN NULL;
  END IF;
  RETURN '+549' || digits;
END;
$$;

UPDATE "users"
SET email = NULL
WHERE email IS NOT NULL AND btrim(email) = '';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT lower(btrim(email)) AS e, array_agg(id::text ORDER BY "createdAt") AS ids
    FROM "users"
    WHERE email IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Duplicate email after normalize: % ids %', r.e, r.ids;
  END LOOP;
END $$;

UPDATE "users"
SET email = lower(btrim(email))
WHERE email IS NOT NULL AND email <> lower(btrim(email));

DO $$
DECLARE
  r record;
  canonical text;
BEGIN
  FOR r IN
    SELECT id, phone
    FROM "users"
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
  LOOP
    canonical := identity_normalize_phone(r.phone);
    IF canonical IS NULL THEN
      RAISE NOTICE 'Unnormalizable phone for user % previous %', r.id, r.phone;
      UPDATE "users" SET phone = NULL WHERE id = r.id;
    ELSIF canonical <> r.phone THEN
      UPDATE "users" SET phone = canonical WHERE id = r.id;
    END IF;
  END LOOP;

  UPDATE "users"
  SET phone = NULL
  WHERE phone IS NOT NULL AND btrim(phone) = '';
END $$;

DO $$
DECLARE
  r record;
  keeper uuid;
  extra uuid;
  i int;
BEGIN
  FOR r IN
    SELECT phone, array_agg(id ORDER BY "createdAt", id) AS ids
    FROM "users"
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING count(*) > 1
  LOOP
    keeper := r.ids[1];
    FOR i IN 2..coalesce(array_length(r.ids, 1), 1) LOOP
      extra := r.ids[i];
      RAISE NOTICE 'Duplicate phone % keeping user % nulling %', r.phone, keeper, extra;
      UPDATE "users" SET phone = NULL WHERE id = extra;
    END LOOP;
  END LOOP;
END $$;

DROP FUNCTION identity_normalize_phone(text);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

ALTER TABLE "users"
  ADD COLUMN "failed_logins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" TIMESTAMP(3);
