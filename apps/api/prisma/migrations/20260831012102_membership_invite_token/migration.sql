/*
  Warnings:

  - A unique constraint covering the columns `[invite_token]` on the table `memberships` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "invite_token" TEXT,
ADD COLUMN     "invite_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_invite_token_key" ON "memberships"("invite_token");
