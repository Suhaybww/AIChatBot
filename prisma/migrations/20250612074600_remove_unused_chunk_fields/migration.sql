/*
  Warnings:

  - You are about to drop the column `chunk_index` on the `knowledge_base` table. All the data in the column will be lost.
  - You are about to drop the column `total_chunks` on the `knowledge_base` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "knowledge_base" DROP COLUMN "chunk_index",
DROP COLUMN "total_chunks";
