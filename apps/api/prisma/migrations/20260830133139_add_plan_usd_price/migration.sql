-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "fx_rate" DECIMAL(10,2),
ADD COLUMN     "fx_rate_source" TEXT,
ADD COLUMN     "price_ars_updated_at" TIMESTAMP(3),
ADD COLUMN     "price_usd" DECIMAL(10,2);
