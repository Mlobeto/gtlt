-- Baja de miembros (REVOKED) y marcas para cortar pases.
-- Solo se agrega el valor al enum; no se usa en esta misma transacción.

ALTER TYPE "MembershipStatus" ADD VALUE 'REVOKED';

ALTER TABLE "users" ADD COLUMN "sessions_valid_after" TIMESTAMP(3);

ALTER TABLE "memberships" ADD COLUMN "revoked_at" TIMESTAMP(3);
ALTER TABLE "memberships" ADD COLUMN "revoked_by_id" UUID;
ALTER TABLE "memberships" ADD COLUMN "sessions_valid_after" TIMESTAMP(3);

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_revoked_by_id_fkey"
  FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
