import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Import JSON data
const programsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../rmit_knowledge_base/programs_data.json'), 'utf-8')
);

async function main() {
  console.log('🎓 Starting programs database seeding...');

  try {
    // Clear existing programs data (optional - remove if you want to keep existing data)
    console.log('🗑️ Clearing existing programs data...');
    await prisma.program.deleteMany();

    // Seed Programs
    console.log('📚 Seeding Programs...');
    let seededCount = 0;
    let skippedCount = 0;
    const seenCodes = new Set();
    
    for (const program of programsData) {
      // Skip entries without code (required field)
      if (!program.code || program.code.trim() === '') {
        console.log(`⚠️ Skipping entry "${program.title}" - no program code`);
        skippedCount++;
        continue;
      }

      // Skip duplicate codes
      if (seenCodes.has(program.code)) {
        console.log(`⚠️ Skipping duplicate program code: ${program.code}`);
        skippedCount++;
        continue;
      }
      seenCodes.add(program.code);

      try {
        await prisma.program.upsert({
          where: { code: program.code },
          update: {
            title: program.title || null,
            level: program.level,
            duration: program.duration || null,
            deliveryMode: program.deliveryMode || [],
            campus: program.campus || [],
            description: program.description || null,
            careerOutcomes: program.careerOutcomes || null,
            entryRequirements: program.entryRequirements || null,
            fees: program.fees || null,
            coordinatorName: program.coordinatorName || null,
            coordinatorEmail: program.coordinatorEmail || null,
            coordinatorPhone: program.coordinatorPhone || null,
            structuredData: program.structuredData || null,
            tags: program.tags || [],
            schoolId: program.schoolId || null,
            sourceUrl: program.sourceUrl || null,
            embedding: program.embedding || null,
            isActive: program.isActive ?? true,
            updatedAt: new Date(program.updatedAt),
          },
          create: {
            code: program.code,
            title: program.title || null,
            level: program.level,
            duration: program.duration || null,
            deliveryMode: program.deliveryMode || [],
            campus: program.campus || [],
            description: program.description || null,
            careerOutcomes: program.careerOutcomes || null,
            entryRequirements: program.entryRequirements || null,
            fees: program.fees || null,
            coordinatorName: program.coordinatorName || null,
            coordinatorEmail: program.coordinatorEmail || null,
            coordinatorPhone: program.coordinatorPhone || null,
            structuredData: program.structuredData || null,
            tags: program.tags || [],
            schoolId: program.schoolId || null,
            sourceUrl: program.sourceUrl || null,
            embedding: program.embedding || null,
            isActive: program.isActive ?? true,
            createdAt: new Date(program.createdAt),
            updatedAt: new Date(program.updatedAt),
          },
        });
        
        seededCount++;
        
        if (seededCount % 50 === 0) {
          console.log(`📊 Progress: ${seededCount} programs processed...`);
        }
      } catch (error) {
        console.error(`❌ Error seeding program ${program.code}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`✅ Created/Updated ${seededCount} programs`);
    console.log(`⚠️ Skipped ${skippedCount} programs (duplicates or missing codes)`);

    console.log('🎉 Database seeding completed successfully!');
    
    // Print summary
    const programCount = await prisma.program.count();
    
    console.log('\n📊 Seeding Summary:');
    console.log(`   📚 Programs in database: ${programCount}`);
    console.log(`   ✅ Successfully seeded: ${seededCount}`);
    console.log(`   ⚠️ Skipped: ${skippedCount}`);
    console.log(`   📈 Total processed: ${seededCount + skippedCount}`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });