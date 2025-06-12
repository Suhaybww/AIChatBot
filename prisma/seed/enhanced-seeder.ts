import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', '..', 'rmit_knowledge_base');

// Types for the two different scraper outputs
interface GeneralScrapedItem {
  url: string;
  title: string;
  content: string;
  category: string;
  structured_data?: Record<string, unknown>;
  tags?: string[];
}

interface CourseDetailItem {
  course_title: string;
  school?: string;
  course_code?: string;
  course_coordinator?: string;
  course_coordinator_email?: string;
  course_coordinator_phone?: string;
  course_description?: string;
  assessment_tasks?: string;
  hurdle_requirement?: string;
  required_prior_study?: string;
  required_concurrent_study?: string;
  source_url: string;
  scraped_at?: string;
}

interface ProcessingStats {
  totalProcessed: number;
  duplicatesSkipped: number;
  errors: number;
  coursesAdded: number;
  generalContentAdded: number;
}

interface DeduplicationCache {
  urls: Set<string>;
  courseCodes: Set<string>;
  contentHashes: Set<string>;
}

class KnowledgeBaseSeeder {
  private stats: ProcessingStats = {
    totalProcessed: 0,
    duplicatesSkipped: 0,
    errors: 0,
    coursesAdded: 0,
    generalContentAdded: 0
  };
  
  private deduplicationCache: DeduplicationCache = {
    urls: new Set(),
    courseCodes: new Set(),
    contentHashes: new Set()
  };

  private readonly BATCH_SIZE = 100;
  private readonly MAX_CONTENT_LENGTH = 50000;
  private readonly STATE_FILE = path.join(KNOWLEDGE_BASE_DIR, 'seeding_state.json');

  async saveState() {
    const state = {
      stats: this.stats,
      processedUrls: Array.from(this.deduplicationCache.urls),
      timestamp: new Date().toISOString()
    };
    await fs.writeJson(this.STATE_FILE, state);
  }

  async loadState(): Promise<boolean> {
    try {
      if (await fs.pathExists(this.STATE_FILE)) {
        const state = await fs.readJson(this.STATE_FILE);
        this.stats = state.stats;
        this.deduplicationCache.urls = new Set(state.processedUrls || []);
        console.log(`📂 Resumed from previous state: ${this.stats.totalProcessed} items processed`);
        return true;
      }
    } catch {
      console.warn('⚠️ Could not load previous state, starting fresh');
    }
    return false;
  }

  generateUniqueId(prefix: string, ...parts: (string | number)[]): string {
    const combined = parts.join('-');
    const hash = crypto.createHash('sha256')
      .update(combined)
      .digest('hex')
      .substring(0, 16);
    return `${prefix}-${hash}`;
  }

  getContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  isDuplicate(url: string, content?: string, courseCode?: string): boolean {
    // Check URL duplication
    if (this.deduplicationCache.urls.has(url)) {
      return true;
    }

    // Check course code duplication for detailed course data
    if (courseCode && this.deduplicationCache.courseCodes.has(courseCode)) {
      return true;
    }

    // Check content duplication
    if (content) {
      const contentHash = this.getContentHash(content);
      if (this.deduplicationCache.contentHashes.has(contentHash)) {
        return true;
      }
      this.deduplicationCache.contentHashes.add(contentHash);
    }

    return false;
  }

  extractTags(structuredData: Record<string, unknown>, category: string): string[] {
    const tags: string[] = [category];
    
    if (structuredData.course_code && typeof structuredData.course_code === 'string') {
      tags.push(`code:${structuredData.course_code}`);
      tags.push(structuredData.course_code);
      
      // Determine if it's a subject or program
      if (/^[A-Z]{4}\d{4}$/.test(structuredData.course_code)) {
        tags.push('type:subject');
        const subjectArea = structuredData.course_code.substring(0, 4);
        tags.push(`area:${subjectArea}`);
      } else {
        tags.push('type:program');
      }
    }

    // Add metadata tags
    Object.keys(structuredData).forEach(key => {
      const value = structuredData[key];
      if (value && typeof value === 'string') {
        if (key.includes('campus')) tags.push('has_campus');
        if (key.includes('fee')) tags.push('has_fees');
        if (key.includes('duration')) tags.push('has_duration');
        if (key.includes('prerequisite') || key.includes('prior_study')) tags.push('has_prerequisites');
        if (key.includes('assessment')) tags.push('has_assessment');
        if (key.includes('school')) tags.push('has_school');
        if (key.includes('coordinator')) tags.push('has_coordinator');
      }
    });

    return Array.from(new Set(tags)); // Remove duplicates
  }

  calculatePriority(structuredData: Record<string, unknown>, dataSource: 'course' | 'general'): number {
    let priority = dataSource === 'course' ? 15 : 5; // Course data gets higher base priority

    if (structuredData.course_code) priority += 10;
    if (structuredData.course_title || structuredData.title) priority += 5;
    if (structuredData.required_prior_study || structuredData.prerequisites) priority += 8;
    if (structuredData.assessment_tasks || structuredData.assessment) priority += 6;
    if (structuredData.course_description) priority += 4;
    if (structuredData.school) priority += 3;
    if (structuredData.course_coordinator) priority += 3;

    return Math.min(priority, 30); // Cap at 30
  }

  normalizeGeneralContent(item: GeneralScrapedItem): {
    title: string;
    content: string;
    category: string;
    sourceUrl: string;
    structuredData: Record<string, unknown>;
    tags: string[];
    priority: number;
  } {
    return {
      title: item.title,
      content: item.content?.substring(0, this.MAX_CONTENT_LENGTH) || '',
      category: item.category,
      sourceUrl: item.url,
      structuredData: {
        ...item.structured_data,
        data_source: 'general_scraper'
      },
      tags: this.extractTags(item.structured_data || {}, item.category),
      priority: this.calculatePriority(item.structured_data || {}, 'general')
    };
  }

  normalizeCourseContent(item: CourseDetailItem): {
    title: string;
    content: string;
    category: string;
    sourceUrl: string;
    structuredData: Record<string, unknown>;
    tags: string[];
    priority: number;
  } {
    const structuredData = {
      course_code: item.course_code,
      course_title: item.course_title,
      school: item.school,
      course_coordinator: item.course_coordinator,
      course_coordinator_email: item.course_coordinator_email,
      course_coordinator_phone: item.course_coordinator_phone,
      required_prior_study: item.required_prior_study,
      required_concurrent_study: item.required_concurrent_study,
      assessment_tasks: item.assessment_tasks,
      hurdle_requirement: item.hurdle_requirement,
      data_source: 'course_scraper'
    };

    return {
      title: item.course_title || `Course ${item.course_code}`,
      content: item.course_description?.substring(0, this.MAX_CONTENT_LENGTH) || '',
      category: 'course-details',
      sourceUrl: item.source_url,
      structuredData,
      tags: this.extractTags(structuredData, 'course-details'),
      priority: this.calculatePriority(structuredData, 'course')
    };
  }

  async processInBatches<T>(
    items: T[],
    processor: (batch: T[]) => Promise<unknown[]>,
    description: string
  ): Promise<void> {
    console.log(`🔄 Processing ${items.length} ${description} in batches of ${this.BATCH_SIZE}`);
    
    for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
      const batch = items.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(items.length / this.BATCH_SIZE);
      
      try {
        console.log(`  📦 Processing batch ${batchNumber}/${totalBatches} (${((i + batch.length) / items.length * 100).toFixed(1)}%)`);
        await processor(batch);
        
        // Save state every 10 batches
        if (batchNumber % 10 === 0) {
          await this.saveState();
        }
        
      } catch (error) {
        console.error(`❌ Error in batch ${batchNumber}:`, error);
        this.stats.errors++;
      }
    }
  }

  async upsertBatch(normalizedItems: {
    title: string;
    content: string;
    category: string;
    sourceUrl: string;
    structuredData: Record<string, unknown>;
    tags: string[];
    priority: number;
  }[]): Promise<void> {
    const operations = normalizedItems.map(item => {
      const id = this.generateUniqueId('kb', item.sourceUrl);
      
      return prisma.knowledgeBase.upsert({
        where: { id },
        update: {
          title: item.title,
          content: item.content,
          category: item.category,
          sourceUrl: item.sourceUrl,
          tags: item.tags,
          structuredData: item.structuredData as Prisma.InputJsonValue,
          priority: item.priority,
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          id,
          title: item.title,
          content: item.content,
          category: item.category,
          sourceUrl: item.sourceUrl,
          tags: item.tags,
          structuredData: item.structuredData as Prisma.InputJsonValue,
          priority: item.priority,
          isActive: true
        }
      });
    });

    await prisma.$transaction(operations);
  }

  async processGeneralContent(): Promise<void> {
    const generalFile = path.join(KNOWLEDGE_BASE_DIR, 'rmit_knowledge_base.json');
    
    if (!await fs.pathExists(generalFile)) {
      console.log('⚠️ General knowledge base file not found, skipping...');
      return;
    }

    console.log('📚 Loading general knowledge base content...');
    const generalData = await fs.readJson(generalFile) as GeneralScrapedItem[];
    
    // Filter out already processed items
    const unprocessedItems = generalData.filter(item => 
      !this.isDuplicate(item.url, item.content)
    );

    console.log(`📊 Found ${unprocessedItems.length} new items out of ${generalData.length} total (${generalData.length - unprocessedItems.length} already processed)`);

    if (unprocessedItems.length === 0) {
      console.log('✅ All general content already processed');
      return;
    }

    await this.processInBatches(
      unprocessedItems,
      async (batch) => {
        const normalizedBatch = batch
          .map(item => this.normalizeGeneralContent(item))
          .filter(item => item.content.length > 50); // Filter out items with minimal content

        if (normalizedBatch.length > 0) {
          await this.upsertBatch(normalizedBatch);
          
          // Update caches
          batch.forEach(item => {
            this.deduplicationCache.urls.add(item.url);
          });
          
          this.stats.totalProcessed += normalizedBatch.length;
          this.stats.generalContentAdded += normalizedBatch.length;
        }
        
        return normalizedBatch;
      },
      'general content items'
    );
  }

  async processCourseDetails(): Promise<void> {
    const courseFile = path.join(KNOWLEDGE_BASE_DIR, 'rmit_course_details.json');
    
    if (!await fs.pathExists(courseFile)) {
      console.log('⚠️ Course details file not found, skipping...');
      return;
    }

    console.log('🎓 Loading detailed course content...');
    const courseData = await fs.readJson(courseFile) as CourseDetailItem[];
    
    // Filter out already processed items
    const unprocessedItems = courseData.filter(item => 
      !this.isDuplicate(item.source_url, item.course_description, item.course_code)
    );

    console.log(`📊 Found ${unprocessedItems.length} new course items out of ${courseData.length} total (${courseData.length - unprocessedItems.length} already processed)`);

    if (unprocessedItems.length === 0) {
      console.log('✅ All course content already processed');
      return;
    }

    await this.processInBatches(
      unprocessedItems,
      async (batch) => {
        const normalizedBatch = batch
          .map(item => this.normalizeCourseContent(item))
          .filter(item => item.title && item.title !== 'Course '); // Filter out items without proper titles

        if (normalizedBatch.length > 0) {
          await this.upsertBatch(normalizedBatch);
          
          // Update caches
          batch.forEach(item => {
            this.deduplicationCache.urls.add(item.source_url);
            if (item.course_code) {
              this.deduplicationCache.courseCodes.add(item.course_code);
            }
          });
          
          this.stats.totalProcessed += normalizedBatch.length;
          this.stats.coursesAdded += normalizedBatch.length;
        }
        
        return normalizedBatch;
      },
      'course detail items'
    );
  }

  async optimizeDatabase(): Promise<void> {
    console.log('\n🔧 Optimizing database...');
    
    // Remove duplicate entries (keeping highest priority)
    await prisma.$executeRaw`
      DELETE FROM knowledge_base kb1 
      USING knowledge_base kb2 
      WHERE kb1.id > kb2.id 
      AND kb1.source_url = kb2.source_url 
      AND kb1.priority <= kb2.priority
    `;
    
    console.log('✅ Database optimization complete');
  }

  async generateReport(): Promise<void> {
    const totalRecords = await prisma.knowledgeBase.count();
    const courseRecords = await prisma.knowledgeBase.count({
      where: { category: 'course-details' }
    });
    const recordsWithCodes = await prisma.knowledgeBase.count({
      where: {
        structuredData: {
          path: ['course_code'],
          not: Prisma.DbNull
        }
      }
    });

    const topCourses = await prisma.knowledgeBase.findMany({
      where: { 
        category: 'course-details',
        structuredData: {
          path: ['course_code'],
          not: Prisma.DbNull
        }
      },
      orderBy: { priority: 'desc' },
      take: 5
    });

    console.log(`\n📈 Final Report:`);
    console.log(`  Total records in database: ${totalRecords.toLocaleString()}`);
    console.log(`  Course detail records: ${courseRecords.toLocaleString()}`);
    console.log(`  Records with course codes: ${recordsWithCodes.toLocaleString()}`);
    console.log(`  Processing stats:`);
    console.log(`    - Total processed: ${this.stats.totalProcessed.toLocaleString()}`);
    console.log(`    - Courses added: ${this.stats.coursesAdded.toLocaleString()}`);
    console.log(`    - General content added: ${this.stats.generalContentAdded.toLocaleString()}`);
    console.log(`    - Duplicates skipped: ${this.stats.duplicatesSkipped.toLocaleString()}`);
    console.log(`    - Errors: ${this.stats.errors}`);

    if (topCourses.length > 0) {
      console.log(`\n🏆 Top priority courses:`);
      topCourses.forEach((course, index) => {
        const data = course.structuredData as Record<string, unknown>;
        console.log(`  ${index + 1}. ${course.title} (${data?.course_code}) - Priority: ${course.priority}`);
      });
    }
  }

  async seed(): Promise<void> {
    console.log('🌱 Starting RMIT knowledge base seeding...');
    console.log(`📁 Looking for files in: ${KNOWLEDGE_BASE_DIR}\n`);
    
    try {
      // Load previous state if available
      await this.loadState();

      // Clear existing knowledge base data if starting fresh
      if (this.stats.totalProcessed === 0) {
        console.log('🗑️ Clearing existing knowledge base...');
        const deleteResult = await prisma.knowledgeBase.deleteMany();
        console.log(`✅ Cleared ${deleteResult.count} existing records\n`);
      }

      // Create directory if it doesn't exist
      await fs.ensureDir(KNOWLEDGE_BASE_DIR);

      // Process course details first (higher priority)
      await this.processCourseDetails();
      
      // Then process general content
      await this.processGeneralContent();

      // Optimize database
      await this.optimizeDatabase();

      // Generate final report
      await this.generateReport();

      // Save final state
      await this.saveState();

      console.log('\n🎉 Seeding completed successfully!');

    } catch (error) {
      console.error('❌ Fatal error during seeding:', error);
      await this.saveState(); // Save progress even on error
      throw error;
    }
  }
}

// Main execution
async function main() {
  const seeder = new KnowledgeBaseSeeder();
  
  try {
    await seeder.seed();
  } catch (error) {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { KnowledgeBaseSeeder };