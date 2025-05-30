/*
  Warnings:

  - You are about to drop the column `createdAt` on the `knowledge_base` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `knowledge_base` table. All the data in the column will be lost.
  - Added the required column `source_url` to the `knowledge_base` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `knowledge_base` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "knowledge_base" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "chunk_index" INTEGER,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source_url" TEXT NOT NULL,
ADD COLUMN     "structured_data" JSONB,
ADD COLUMN     "total_chunks" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
