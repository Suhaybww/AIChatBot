/*
  Warnings:

  - You are about to drop the column `description` on the `academic_schools` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `academic_schools` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "academic_schools" DROP COLUMN "description",
DROP COLUMN "website";
