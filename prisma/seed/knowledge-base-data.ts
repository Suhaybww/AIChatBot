import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', '..', 'rmit_knowledge_base');

interface StructuredData {
  course_code?: string;
  prerequisites?: string;
  career_outcomes?: string;
  study_mode?: string;
  duration?: string;
  fees?: string;
  credit_points?: string;
  atar?: string;
  campus?: string;
  intake?: string;
  subjects?: string[];
  [key: string]: unknown;
}

interface PageData {
  title: string;
  url: string;
  content_sections: Array<{
    heading: string | null;
    paragraphs: string[];
  }>;
  structured_data: StructuredData;
  full_text: string;
}

interface Metadata {
  total_urls_found: number;
  urls_processed: number;
  pages_with_content: number;
  unchanged_skipped: number;
  errors: number;
  error_details: string[];
  crawl_delay_used: number;
  incremental_mode: boolean;
  validation_enabled: boolean;
  validation_summary?: {
    total_validated_fields: number;
    pages_with_course_codes: number;
    pages_with_fees: number;
    pages_with_duration: number;
  };
}

interface KnowledgeBaseFile {
  category: string;
  scrape_date: string;
  total_pages: number;
  metadata: Metadata;
  pages: PageData[];
}

interface ChunkMetadata {
  start_char?: number;
  end_char?: number;
  category: string;
}

interface ChunkData {
  page_title: string;
  page_url: string;
  page_index: number;
  chunk_index: number;
  total_chunks: number;
  text: string;
  structured_data: StructuredData;
  metadata: ChunkMetadata;
}

// Generate a unique ID with better collision resistance
function generateUniqueId(prefix: string, ...parts: (string | number)[]): string {
  const combined = parts.join('-');
  const hash = crypto.createHash('sha256')
    .update(combined)
    .digest('hex')
    .substring(0, 20); // Use more characters for better uniqueness
  return `${prefix}-${hash}`;
}

async function seedKnowledgeBase() {
  console.log('🌱 Starting knowledge base seeding...');

  try {
    // Check if knowledge base directory exists
    if (!await fs.pathExists(KNOWLEDGE_BASE_DIR)) {
      console.error(`❌ Knowledge base directory not found: ${KNOWLEDGE_BASE_DIR}`);
      console.log('Please run the Python scraper first to generate the knowledge base files.');
      process.exit(1);
    }

    // Clear existing knowledge base data
    console.log('🗑️ Clearing existing knowledge base...');
    const deleteResult = await prisma.knowledgeBase.deleteMany();
    console.log(`✅ Cleared ${deleteResult.count} existing records`);

    // Get all JSON files from knowledge base directory
    const jsonFiles = await fs.readdir(KNOWLEDGE_BASE_DIR);
    const knowledgeFiles = jsonFiles.filter(file => 
      file.endsWith('.json') && 
      !file.endsWith('_min.json') && 
      !file.endsWith('_metadata.json') &&
      !file.includes('scraping_summary') &&
      !file.includes('scraper_state')
    );
    
    if (knowledgeFiles.length === 0) {
      console.warn('⚠️ No knowledge base files found. Please run the scraper first.');
      return;
    }

    console.log(`📚 Found ${knowledgeFiles.length} knowledge base files:`);
    knowledgeFiles.forEach(file => console.log(`  • ${file}`));

    let totalEntriesAdded = 0;
    let totalErrors = 0;
    const processedUrls = new Set<string>();

    // Process each JSON file
    for (const filename of knowledgeFiles) {
      const filePath = path.join(KNOWLEDGE_BASE_DIR, filename);
      
      try {
        console.log(`\n📄 Processing: ${filename}`);
        const fileContent = await fs.readJson(filePath) as KnowledgeBaseFile;
        
        console.log(`  Category: ${fileContent.category}`);
        console.log(`  Pages: ${fileContent.total_pages}`);
        console.log(`  Last scraped: ${fileContent.scrape_date}`);

        // Process pages in batches for better performance
        const batchSize = 50;
        for (let i = 0; i < fileContent.pages.length; i += batchSize) {
          const batch = fileContent.pages.slice(i, i + batchSize);
          const batchPromises = batch.map(async (page, batchIndex) => {
            const pageIndex = i + batchIndex;
            
            // Skip if we've already processed this URL
            if (processedUrls.has(page.url)) {
              console.log(`  ⚠️ Skipping duplicate URL: ${page.url}`);
              return null;
            }
            processedUrls.add(page.url);

            const pageId = generateUniqueId('page', page.url, fileContent.category, pageIndex);

            try {
              const knowledgeEntry = await prisma.knowledgeBase.upsert({
                where: { id: pageId },
                update: {
                  title: page.title,
                  content: page.full_text || '',
                  category: fileContent.category,
                  sourceUrl: page.url,
                  tags: Object.keys(page.structured_data || {}),
                  structuredData: (page.structured_data || {}) as Prisma.InputJsonValue,
                  priority: 0,
                  isActive: true,
                  updatedAt: new Date()
                },
                create: {
                  id: pageId,
                  title: page.title,
                  content: page.full_text || '',
                  category: fileContent.category,
                  sourceUrl: page.url,
                  tags: Object.keys(page.structured_data || {}),
                  structuredData: (page.structured_data || {}) as Prisma.InputJsonValue,
                  priority: 0,
                  isActive: true
                }
              });
              return knowledgeEntry;
            } catch (error) {
              if (error instanceof PrismaClientKnownRequestError) {
                console.error(`  ❌ Error processing page "${page.title}":`, error.message);
                console.error(`     Code: ${error.code}`);
              } else if (error instanceof Error) {
                console.error(`  ❌ Error processing page "${page.title}":`, error.message);
              } else {
                console.error(`  ❌ Error processing page "${page.title}":`, String(error));
              }
              totalErrors++;
              return null;
            }
          });

          const results = await Promise.all(batchPromises);
          const successCount = results.filter(r => r !== null).length;
          totalEntriesAdded += successCount;
          
          console.log(`  ✅ Batch ${Math.floor(i / batchSize) + 1}: Added ${successCount}/${batch.length} pages`);
        }

        console.log(`  ✅ Completed ${filename}: ${fileContent.pages.length} pages processed`);
      } catch (fileError) {
        if (fileError instanceof Error) {
          console.error(`  ❌ Error processing file ${filename}:`, fileError.message);
        } else {
          console.error(`  ❌ Error processing file ${filename}:`, String(fileError));
        }
        totalErrors++;
      }
    }

    // Process chunk files
    const chunksDir = path.join(KNOWLEDGE_BASE_DIR, 'chunks');
    if (await fs.pathExists(chunksDir)) {
      console.log('\n🧱 Processing chunk files...');
      const categoryDirs = await fs.readdir(chunksDir);
      
      for (const category of categoryDirs) {
        const categoryPath = path.join(chunksDir, category);
        const stat = await fs.stat(categoryPath);
        
        if (!stat.isDirectory()) continue;
        
        const chunkFiles = (await fs.readdir(categoryPath))
          .filter(file => file.endsWith('.json'))
          .sort(); // Sort to ensure consistent ordering
        
        console.log(`\n🗂️ Processing chunks for category: ${category}`);
        console.log(`  Found ${chunkFiles.length} chunk files`);

        // Process chunks in batches
        const batchSize = 100;
        let chunksProcessed = 0;
        
        for (let i = 0; i < chunkFiles.length; i += batchSize) {
          const batch = chunkFiles.slice(i, i + batchSize);
          const batchPromises = batch.map(async (chunkFile) => {
            const chunkPath = path.join(categoryPath, chunkFile);
            
            try {
              const chunkData = await fs.readJson(chunkPath) as ChunkData;
              
              // Create unique ID using page URL, chunk index, and filename
              const chunkId = generateUniqueId(
                'chunk',
                chunkData.page_url,
                chunkData.page_index.toString(),
                chunkData.chunk_index.toString(),
                chunkFile
              );

              const chunkEntry = await prisma.knowledgeBase.upsert({
                where: { id: chunkId },
                update: {
                  title: `${chunkData.page_title} - Part ${chunkData.chunk_index + 1}/${chunkData.total_chunks}`,
                  content: chunkData.text || '',
                  category: chunkData.metadata.category,
                  sourceUrl: chunkData.page_url,
                  tags: Object.keys(chunkData.structured_data || {}),
                  structuredData: (chunkData.structured_data || {}) as Prisma.InputJsonValue,
                  priority: 1,
                  chunkIndex: chunkData.chunk_index,
                  totalChunks: chunkData.total_chunks,
                  isActive: true,
                  updatedAt: new Date()
                },
                create: {
                  id: chunkId,
                  title: `${chunkData.page_title} - Part ${chunkData.chunk_index + 1}/${chunkData.total_chunks}`,
                  content: chunkData.text || '',
                  category: chunkData.metadata.category,
                  sourceUrl: chunkData.page_url,
                  tags: Object.keys(chunkData.structured_data || {}),
                  structuredData: (chunkData.structured_data || {}) as Prisma.InputJsonValue,
                  priority: 1,
                  chunkIndex: chunkData.chunk_index,
                  totalChunks: chunkData.total_chunks,
                  isActive: true
                }
              });
              return chunkEntry;
            } catch (chunkError) {
              if (chunkError instanceof PrismaClientKnownRequestError) {
                if (chunkError.code === 'P2002') {
                  console.warn(`  ⚠️ Duplicate chunk skipped: ${chunkFile}`);
                } else {
                  console.error(`  ❌ Error processing chunk ${chunkFile}:`, chunkError.message);
                  totalErrors++;
                }
              } else if (chunkError instanceof Error) {
                console.error(`  ❌ Error processing chunk ${chunkFile}:`, chunkError.message);
                totalErrors++;
              } else {
                console.error(`  ❌ Error processing chunk ${chunkFile}:`, String(chunkError));
                totalErrors++;
              }
              return null;
            }
          });

          const results = await Promise.all(batchPromises);
          const successCount = results.filter(r => r !== null).length;
          chunksProcessed += successCount;
          totalEntriesAdded += successCount;
          
          console.log(`  ✅ Batch ${Math.floor(i / batchSize) + 1}: Processed ${successCount}/${batch.length} chunks`);
        }
        
        console.log(`  ✅ Completed ${category}: ${chunksProcessed} chunks added`);
      }
    } else {
      console.log('\n⚠️ No chunks directory found - skipping chunk processing');
    }

    // Final summary
    console.log(`\n🎉 Knowledge base seeding completed!`);
    console.log(`📊 Summary:`);
    console.log(`  • Total entries added: ${totalEntriesAdded}`);
    console.log(`  • Total errors: ${totalErrors}`);
    
    // Verify seeding
    const finalCount = await prisma.knowledgeBase.count();
    const pageCount = await prisma.knowledgeBase.count({
      where: { id: { startsWith: 'page-' } }
    });
    const chunkCount = await prisma.knowledgeBase.count({
      where: { id: { startsWith: 'chunk-' } }
    });
    
    console.log(`\n📈 Database verification:`);
    console.log(`  • Total records: ${finalCount}`);
    console.log(`  • Pages: ${pageCount}`);
    console.log(`  • Chunks: ${chunkCount}`);
    
    // Show sample data
    const sampleEntries = await prisma.knowledgeBase.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`\n📝 Sample entries:`);
    sampleEntries.forEach(entry => {
      console.log(`  • ${entry.title.substring(0, 60)}...`);
      console.log(`    Category: ${entry.category}, Tags: ${entry.tags.slice(0, 3).join(', ')}`);
    });

  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Fatal error seeding knowledge base:', error.message);
      console.error('Stack trace:', error.stack);
    } else {
      console.error('❌ Fatal error seeding knowledge base:', String(error));
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding with proper error handling
seedKnowledgeBase()
  .then(() => {
    console.log('\n✅ Seeding script completed successfully');
    process.exit(0);
  })
  .catch((e) => {
    if (e instanceof Error) {
      console.error('\n💥 Seeding script failed:', e.message);
      console.error('Stack trace:', e.stack);
    } else {
      console.error('\n💥 Seeding script failed:', String(e));
    }
    process.exit(1);
  });