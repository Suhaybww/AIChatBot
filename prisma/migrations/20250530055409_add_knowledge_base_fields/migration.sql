/*
  Warnings:

  - You are about to drop the column `isActive` on the `knowledge_base` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "knowledge_base_isActive_idx";

-- AlterTable
ALTER TABLE "knowledge_base" DROP COLUMN "isActive",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "knowledge_base_is_active_idx" ON "knowledge_base"("is_active");
