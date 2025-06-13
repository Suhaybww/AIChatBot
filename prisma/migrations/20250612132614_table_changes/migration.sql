/*
  Warnings:

  - You are about to drop the `knowledge_base` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "program_level" AS ENUM ('DIPLOMA', 'BACHELOR', 'BACHELOR_HONOURS', 'MASTER', 'DOCTORATE', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "course_level" AS ENUM ('UNDERGRADUATE', 'POSTGRADUATE');

-- CreateEnum
CREATE TYPE "delivery_mode" AS ENUM ('ON_CAMPUS', 'ONLINE', 'BLENDED', 'DISTANCE');

-- DropTable
DROP TABLE "knowledge_base";

-- CreateTable
CREATE TABLE "academic_schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "faculty" TEXT,
    "description" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" "program_level" NOT NULL,
    "duration" TEXT,
    "deliveryMode" "delivery_mode"[],
    "campus" TEXT[],
    "description" TEXT,
    "careerOutcomes" TEXT,
    "entryRequirements" TEXT,
    "fees" TEXT,
    "coordinator_name" TEXT,
    "coordinator_email" TEXT,
    "coordinator_phone" TEXT,
    "structured_data" JSONB,
    "tags" TEXT[],
    "school_id" TEXT,
    "source_url" TEXT,
    "embedding" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_information" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "tags" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 5,
    "structured_data" JSONB,
    "source_url" TEXT,
    "embedding" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creditPoints" INTEGER,
    "level" "course_level" NOT NULL,
    "deliveryMode" "delivery_mode"[],
    "campus" TEXT[],
    "description" TEXT,
    "learningOutcomes" TEXT,
    "assessmentTasks" TEXT,
    "hurdleRequirement" TEXT,
    "prerequisites" TEXT,
    "corequisites" TEXT,
    "coordinator_name" TEXT,
    "coordinator_email" TEXT,
    "coordinator_phone" TEXT,
    "school_id" TEXT,
    "source_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "embedding" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_schools_name_key" ON "academic_schools"("name");

-- CreateIndex
CREATE INDEX "academic_schools_name_idx" ON "academic_schools"("name");

-- CreateIndex
CREATE INDEX "academic_schools_faculty_idx" ON "academic_schools"("faculty");

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateIndex
CREATE INDEX "programs_code_idx" ON "programs"("code");

-- CreateIndex
CREATE INDEX "programs_level_idx" ON "programs"("level");

-- CreateIndex
CREATE INDEX "programs_title_idx" ON "programs"("title");

-- CreateIndex
CREATE INDEX "programs_school_id_idx" ON "programs"("school_id");

-- CreateIndex
CREATE INDEX "programs_is_active_idx" ON "programs"("is_active");

-- CreateIndex
CREATE INDEX "programs_deliveryMode_idx" ON "programs"("deliveryMode");

-- CreateIndex
CREATE INDEX "programs_tags_idx" ON "programs"("tags");

-- CreateIndex
CREATE INDEX "academic_information_category_idx" ON "academic_information"("category");

-- CreateIndex
CREATE INDEX "academic_information_subcategory_idx" ON "academic_information"("subcategory");

-- CreateIndex
CREATE INDEX "academic_information_priority_idx" ON "academic_information"("priority");

-- CreateIndex
CREATE INDEX "academic_information_is_active_idx" ON "academic_information"("is_active");

-- CreateIndex
CREATE INDEX "academic_information_tags_idx" ON "academic_information"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_code_idx" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_title_idx" ON "courses"("title");

-- CreateIndex
CREATE INDEX "courses_level_idx" ON "courses"("level");

-- CreateIndex
CREATE INDEX "courses_school_id_idx" ON "courses"("school_id");

-- CreateIndex
CREATE INDEX "courses_is_active_idx" ON "courses"("is_active");

-- CreateIndex
CREATE INDEX "courses_deliveryMode_idx" ON "courses"("deliveryMode");

-- CreateIndex
CREATE INDEX "courses_creditPoints_idx" ON "courses"("creditPoints");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "academic_schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "academic_schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
