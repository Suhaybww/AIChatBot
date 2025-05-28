import { PrismaClient } from '@prisma/client';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your generated JSON files
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', '..', 'public', 'knowledge-base');

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string;
  category: string;
  type: string;
  priority: number;
  tags: string[];
  wordCount: number;
  lastUpdated: string;
}

interface KnowledgeBaseFile {
  category: string;
  lastUpdated: string;
  totalEntries: number;
  totalWordCount: number;
  entries: KnowledgeEntry[];
}

async function seedKnowledgeBase() {
  console.log('🌱 Starting knowledge base seeding...');

  try {
    // Clear existing knowledge base data
    console.log('🗑️ Clearing existing knowledge base...');
    await prisma.knowledgeBase.deleteMany();
    console.log('✅ Existing knowledge base cleared');

    // Get all JSON files from knowledge base directory
    const jsonFiles = await fs.readdir(KNOWLEDGE_BASE_DIR);
    const knowledgeFiles = jsonFiles.filter(file => file.endsWith('.json'));
    
    console.log(`📚 Found ${knowledgeFiles.length} knowledge base files:`);
    knowledgeFiles.forEach(file => console.log(`  • ${file}`));

    let totalEntriesAdded = 0;

    // Process each JSON file
    for (const filename of knowledgeFiles) {
      const filePath = path.join(KNOWLEDGE_BASE_DIR, filename);
      
      try {
        console.log(`\n📄 Processing: ${filename}`);
        
        const fileContent = await fs.readJson(filePath) as KnowledgeBaseFile;
        
        console.log(`  Category: ${fileContent.category}`);
        console.log(`  Entries: ${fileContent.totalEntries}`);
        console.log(`  Words: ${fileContent.totalWordCount}`);

        // Insert each entry into the database
        for (const entry of fileContent.entries) {
          await prisma.knowledgeBase.create({
            data: {
              id: entry.id,
              title: entry.title,
              content: entry.content,
              source: entry.source,
              category: entry.category,
              type: entry.type,
              priority: entry.priority,
              tags: entry.tags,
              wordCount: entry.wordCount,
              lastUpdated: new Date(entry.lastUpdated),
              isActive: true, // Set as active by default
              // createdAt and updatedAt will be set automatically
            },
          });
        }

        totalEntriesAdded += fileContent.totalEntries;
        console.log(`  ✅ Added ${fileContent.totalEntries} entries from ${filename}`);

      } catch (fileError) {
        console.error(`  ❌ Error processing ${filename}:`, fileError);
      }
    }

    console.log(`\n🎉 Knowledge base seeding completed!`);
    console.log(`📊 Summary:`);
    console.log(`  • Total files processed: ${knowledgeFiles.length}`);
    console.log(`  • Total entries added: ${totalEntriesAdded}`);
    
    // Verify seeding
    const finalCount = await prisma.knowledgeBase.count();
    console.log(`  • Database verification: ${finalCount} records`);

    if (finalCount !== totalEntriesAdded) {
      throw new Error(`Mismatch: Expected ${totalEntriesAdded} records, found ${finalCount}`);
    }

  } catch (error) {
    console.error('❌ Error seeding knowledge base:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedKnowledgeBase();
  } catch (error) {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
main();