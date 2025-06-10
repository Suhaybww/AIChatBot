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
  course_title?: string;
  course_type?: string; // 'program' or 'subject'
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
  core_subjects?: string[];
  elective_subjects?: string[];
  course_description?: string;
  // Subject-specific fields
  assessment?: string;
  learning_outcomes?: string;
  contact_hours?: string;
  semester_offered?: string;
  related_courses?: string[];
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
  urls_processed?: number;
  pages_with_content: number;
  unchanged_skipped?: number;
  errors?: number;
  error_details?: string[];
  crawl_delay_used?: number;
  incremental_mode?: boolean;
  validation_enabled?: boolean;
  validation_summary?: {
    total_validated_fields: number;
    pages_with_course_codes: number;
    pages_with_fees: number;
    pages_with_duration: number;
  };
  course_codes_found?: string[];
  total_course_codes?: number;
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
    .substring(0, 20);
  return `${prefix}-${hash}`;
}

// Extract tags from structured data with priority for course information
function extractTags(structuredData: StructuredData): string[] {
  const tags: string[] = [];
  
  // High priority tags
  if (structuredData.course_code) {
    tags.push(`code:${structuredData.course_code}`);
    tags.push(structuredData.course_code); // Also add plain code for easier search
    
    // Check if it's a subject (4 letters + 4 digits pattern)
    if (/^[A-Z]{4}\d{4}$/.test(structuredData.course_code)) {
      tags.push('type:subject');
      // Extract subject area from code (e.g., COSC from COSC1234)
      const subjectArea = structuredData.course_code.substring(0, 4);
      tags.push(`area:${subjectArea}`);
    } else {
      tags.push('type:program');
    }
  }
  if (structuredData.course_type) {
    tags.push(`type:${structuredData.course_type}`);
  }
  if (structuredData.course_title) {
    tags.push('has_title');
  }
  if (structuredData.prerequisites) {
    tags.push('has_prerequisites');
  }
  if (structuredData.duration) {
    tags.push('has_duration');
    // Extract duration type
    const durationLower = structuredData.duration.toLowerCase();
    if (durationLower.includes('year')) tags.push('duration_years');
    if (durationLower.includes('month')) tags.push('duration_months');
    if (durationLower.includes('semester')) tags.push('duration_semesters');
  }
  if (structuredData.fees) {
    tags.push('has_fees');
  }
  if (structuredData.atar) {
    tags.push('has_atar');
  }
  if (structuredData.credit_points) {
    tags.push('has_credit_points');
  }
  if (structuredData.campus) {
    tags.push('has_campus');
    // Extract campus names
    const campusLower = structuredData.campus.toLowerCase();
    if (campusLower.includes('city')) tags.push('campus:city');
    if (campusLower.includes('bundoora')) tags.push('campus:bundoora');
    if (campusLower.includes('brunswick')) tags.push('campus:brunswick');
  }
  if (structuredData.study_mode) {
    tags.push('has_study_mode');
    const modeLower = structuredData.study_mode.toLowerCase();
    if (modeLower.includes('full')) tags.push('mode:fulltime');
    if (modeLower.includes('part')) tags.push('mode:parttime');
    if (modeLower.includes('online')) tags.push('mode:online');
  }
  if (structuredData.core_subjects && structuredData.core_subjects.length > 0) {
    tags.push('has_core_subjects');
  }
  if (structuredData.elective_subjects && structuredData.elective_subjects.length > 0) {
    tags.push('has_elective_subjects');
  }
  if (structuredData.assessment) {
    tags.push('has_assessment');
  }
  if (structuredData.learning_outcomes) {
    tags.push('has_learning_outcomes');
  }
  if (structuredData.semester_offered) {
    tags.push('has_semester');
  }
  if (structuredData.related_courses && structuredData.related_courses.length > 0) {
    tags.push('has_related_courses');
  }
  
  // Add all structured data keys as tags for searchability
  Object.keys(structuredData).forEach(key => {
    if (structuredData[key] && !tags.includes(key)) {
      tags.push(key);
    }
  });
  
  return tags;
}

// Calculate priority based on completeness of data
function calculatePriority(structuredData: StructuredData): number {
  let priority = 0;
  
  // High priority for having a course code
  if (structuredData.course_code) priority += 10;
  
  // Type-specific priority
  if (structuredData.course_type === 'subject') {
    // Subject-specific priorities
    if (structuredData.prerequisites) priority += 10; // Very important for subjects
    if (structuredData.credit_points) priority += 8;
    if (structuredData.assessment) priority += 6;
    if (structuredData.learning_outcomes) priority += 5;
    if (structuredData.semester_offered) priority += 4;
    if (structuredData.campus) priority += 3;
  } else {
    // Program-specific priorities
    if (structuredData.prerequisites) priority += 8;
    if (structuredData.duration) priority += 6;
    if (structuredData.fees) priority += 5;
    if (structuredData.atar) priority += 5;
    if (structuredData.credit_points) priority += 4;
    if (structuredData.campus) priority += 3;
    if (structuredData.core_subjects && structuredData.core_subjects.length > 0) priority += 5;
  }
  
  // Common priorities
  if (structuredData.career_outcomes) priority += 3;
  if (structuredData.study_mode) priority += 2;
  if (structuredData.course_title) priority += 2;
  if (structuredData.related_courses && structuredData.related_courses.length > 0) priority += 2;
  
  return priority;
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
    const courseCodesSeen = new Set<string>();

    // Process each JSON file
    for (const filename of knowledgeFiles) {
      const filePath = path.join(KNOWLEDGE_BASE_DIR, filename);
      
      try {
        console.log(`\n📄 Processing: ${filename}`);
        const fileContent = await fs.readJson(filePath) as KnowledgeBaseFile;
        
        console.log(`  Category: ${fileContent.category}`);
        console.log(`  Pages: ${fileContent.total_pages}`);
        console.log(`  Last scraped: ${fileContent.scrape_date}`);
        
        // Show course codes found if available
        if (fileContent.metadata.course_codes_found) {
          console.log(`  Course codes found: ${fileContent.metadata.total_course_codes || fileContent.metadata.course_codes_found.length}`);
        }

        // Process pages in batches for better performance
        const batchSize = 50;
        let coursePagesAdded = 0;
        
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

            // Track course codes
            if (page.structured_data?.course_code) {
              courseCodesSeen.add(page.structured_data.course_code);
            }

            const pageId = generateUniqueId('page', page.url, fileContent.category, pageIndex);
            const tags = extractTags(page.structured_data || {});
            const priority = calculatePriority(page.structured_data || {});

            try {
              const knowledgeEntry = await prisma.knowledgeBase.upsert({
                where: { id: pageId },
                update: {
                  title: page.title,
                  content: page.full_text || '',
                  category: fileContent.category,
                  sourceUrl: page.url,
                  tags: tags,
                  structuredData: (page.structured_data || {}) as Prisma.InputJsonValue,
                  priority: priority,
                  isActive: true,
                  updatedAt: new Date()
                },
                create: {
                  id: pageId,
                  title: page.title,
                  content: page.full_text || '',
                  category: fileContent.category,
                  sourceUrl: page.url,
                  tags: tags,
                  structuredData: (page.structured_data || {}) as Prisma.InputJsonValue,
                  priority: priority,
                  isActive: true
                }
              });
              
              if (page.structured_data?.course_code) {
                coursePagesAdded++;
              }
              
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
        console.log(`  📊 Course pages with codes: ${coursePagesAdded}`);
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
          .sort();
        
        console.log(`\n🗂️ Processing chunks for category: ${category}`);
        console.log(`  Found ${chunkFiles.length} chunk files`);

        // Process chunks in batches
        const batchSize = 100;
        let chunksProcessed = 0;
        let courseChunksAdded = 0;
        
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

              const tags = extractTags(chunkData.structured_data || {});
              const priority = calculatePriority(chunkData.structured_data || {}) - 5; // Slightly lower than full pages

              const chunkEntry = await prisma.knowledgeBase.upsert({
                where: { id: chunkId },
                update: {
                  title: `${chunkData.page_title} - Part ${chunkData.chunk_index + 1}/${chunkData.total_chunks}`,
                  content: chunkData.text || '',
                  category: chunkData.metadata.category,
                  sourceUrl: chunkData.page_url,
                  tags: tags,
                  structuredData: (chunkData.structured_data || {}) as Prisma.InputJsonValue,
                  priority: priority,
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
                  tags: tags,
                  structuredData: (chunkData.structured_data || {}) as Prisma.InputJsonValue,
                  priority: priority,
                  chunkIndex: chunkData.chunk_index,
                  totalChunks: chunkData.total_chunks,
                  isActive: true
                }
              });
              
              if (chunkData.structured_data?.course_code) {
                courseChunksAdded++;
              }
              
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
        console.log(`  📊 Course chunks with codes: ${courseChunksAdded}`);
      }
    } else {
      console.log('\n⚠️ No chunks directory found - skipping chunk processing');
    }

    // Final summary
    console.log(`\n🎉 Knowledge base seeding completed!`);
    console.log(`📊 Summary:`);
    console.log(`  • Total entries added: ${totalEntriesAdded}`);
    console.log(`  • Total errors: ${totalErrors}`);
    console.log(`  • Unique course codes found: ${courseCodesSeen.size}`);
    
    // Verify seeding
    const finalCount = await prisma.knowledgeBase.count();
    const pageCount = await prisma.knowledgeBase.count({
      where: { id: { startsWith: 'page-' } }
    });
    const chunkCount = await prisma.knowledgeBase.count({
      where: { id: { startsWith: 'chunk-' } }
    });
    const coursesWithCodes = await prisma.knowledgeBase.count({
      where: {
        structuredData: {
          path: ['course_code'],
          not: Prisma.DbNull
        }
      }
    });
    const coursesWithPrereqs = await prisma.knowledgeBase.count({
      where: {
        structuredData: {
          path: ['prerequisites'],
          not: Prisma.DbNull
        }
      }
    });
    
    console.log(`\n📈 Database verification:`);
    console.log(`  • Total records: ${finalCount}`);
    console.log(`  • Pages: ${pageCount}`);
    console.log(`  • Chunks: ${chunkCount}`);
    console.log(`  • Entries with course codes: ${coursesWithCodes}`);
    console.log(`  • Entries with prerequisites: ${coursesWithPrereqs}`);
    
    // Show sample data with course information
    const samplePrograms = await prisma.knowledgeBase.findMany({
      where: {
        tags: {
          has: 'type:program'
        },
        structuredData: {
          path: ['course_code'],
          not: Prisma.DbNull
        }
      },
      orderBy: { priority: 'desc' },
      take: 3
    });
    
    const sampleSubjects = await prisma.knowledgeBase.findMany({
      where: {
        tags: {
          has: 'type:subject'
        },
        structuredData: {
          path: ['course_code'],
          not: Prisma.DbNull
        }
      },
      orderBy: { priority: 'desc' },
      take: 3
    });
    
    if (samplePrograms.length > 0) {
      console.log(`\n📝 Sample program entries:`);
      samplePrograms.forEach(entry => {
        const structuredData = entry.structuredData as StructuredData;
        console.log(`  • ${entry.title}`);
        console.log(`    Code: ${structuredData.course_code || 'N/A'}`);
        console.log(`    Prerequisites: ${structuredData.prerequisites ? 'Yes' : 'No'}`);
        console.log(`    Duration: ${structuredData.duration || 'N/A'}`);
        console.log(`    Priority: ${entry.priority}`);
      });
    }
    
    if (sampleSubjects.length > 0) {
      console.log(`\n📚 Sample subject entries:`);
      sampleSubjects.forEach(entry => {
        const structuredData = entry.structuredData as StructuredData;
        console.log(`  • ${entry.title}`);
        console.log(`    Code: ${structuredData.course_code || 'N/A'}`);
        console.log(`    Prerequisites: ${structuredData.prerequisites ? 'Yes' : 'No'}`);
        console.log(`    Credit Points: ${structuredData.credit_points || 'N/A'}`);
        console.log(`    Assessment: ${structuredData.assessment ? 'Yes' : 'No'}`);
        console.log(`    Priority: ${entry.priority}`);
      });
    }

    // Show course codes by type
    const programCodes = Array.from(courseCodesSeen).filter(code => !/^[A-Z]{4}\d{4}$/.test(code));
    const subjectCodes = Array.from(courseCodesSeen).filter(code => /^[A-Z]{4}\d{4}$/.test(code));
    
    if (programCodes.length > 0) {
      console.log(`\n🎓 Sample program codes in database:`);
      programCodes.slice(0, 5).forEach(code => {
        console.log(`  • ${code}`);
      });
    }
    
    if (subjectCodes.length > 0) {
      console.log(`\n📖 Sample subject codes in database:`);
      subjectCodes.slice(0, 5).forEach(code => {
        console.log(`  • ${code}`);
      });
    }

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