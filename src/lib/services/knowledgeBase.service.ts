import { db } from "@/server/db/db";
import type { SearchResult } from "./search.service";
import type { JsonValue } from "@prisma/client/runtime/library";
import type { Course, Program, AcademicInformation, AcademicSchool, Prisma } from "@prisma/client";
import { QueryClassifier, type ConversationContext as QueryContext, type QueryClassification } from "./queryClassifier";

type CourseWithSchool = Course & { school: AcademicSchool | null };
type ProgramWithSchool = Program & { school: AcademicSchool | null };

export interface KnowledgeBaseItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  sourceUrl: string;
  priority: number;
  isActive: boolean;
  structuredData?: JsonValue;
  createdAt: Date;
  updatedAt: Date;
  type: 'academic_information' | 'program' | 'course' | 'school';
}

export interface KnowledgeSearchOptions {
  category?: string;
  tags?: string[];
  limit?: number;
  includeInactive?: boolean;
  searchMode?: 'exact' | 'fuzzy' | 'semantic';
  tables?: ('academic_information' | 'program' | 'course' | 'school')[];
}


export class KnowledgeBaseService {
  
  /**
   * Main search method - routes to appropriate table(s) based on query classification
   */
  async searchKnowledge(
    query: string, 
    options: KnowledgeSearchOptions = {},
    context?: QueryContext
  ): Promise<KnowledgeBaseItem[]> {
    const {
      category,
      tags,
      limit = 10,
      includeInactive = false
    } = options;

    // Classify the query to determine which table(s) to search
    const classification = QueryClassifier.classify(query, context);
    console.log(`🎯 Query classification:`, classification);
    
    // Route to specific table based on classification
    switch (classification.primaryTable) {
      case 'course':
        return this.searchCourseDirect(
          query, 
          classification.extractedEntities, 
          { limit, includeInactive }
        );
        
      case 'program':
        return this.searchProgramDirect(
          query, 
          classification.extractedEntities, 
          { limit, includeInactive }
        );
        
      case 'academic_information':
        return this.searchAcademicInfoDirect(
          query, 
          classification.extractedEntities, 
          { category, tags, limit, includeInactive }
        );
        
      case 'school':
        return this.searchSchoolDirect(
          query, 
          classification.extractedEntities, 
          { limit, includeInactive }
        );
        
      default:
        // Mixed query - search multiple tables
        return this.searchMultipleTables(
          query, 
          classification.secondaryTables as ('course' | 'program' | 'academic_information' | 'school')[], 
          { category, tags, limit, includeInactive }
        );
    }
  }

  /**
   * Search for results in knowledge base format - MAIN SEARCH ENTRY POINT
   */
  async searchForResults(
    query: string, 
    enhancedTerms: string[], 
    context?: QueryContext
  ): Promise<SearchResult[]> {
    try {
      console.log(`🔍 KnowledgeBase search for: "${query}" with terms:`, enhancedTerms);
      
      // Classify the query
      const classification = QueryClassifier.classify(query, context);
      
      // Get results based on classification
      const results = await this.searchKnowledge(query, { limit: 15 }, context);
      
      console.log(`📚 Found ${results.length} results from ${classification.primaryTable || 'multiple tables'}`);
      
      // Convert to SearchResult format
      const searchResults = results.map((item, index) => {
        // For specific queries (course/program), return FULL content
        const shouldReturnFullContent = 
          classification.queryType === 'specific_course' || 
          classification.queryType === 'specific_program';
        
        return {
          id: `${item.type}_${item.id}`,
          title: item.title,
          content: shouldReturnFullContent ? item.content : this.prepareContentSnippet(item.content, query, enhancedTerms),
          url: item.sourceUrl && item.sourceUrl !== '' && !item.sourceUrl.startsWith('#') ? item.sourceUrl : '',
          source: 'knowledge_base' as const,
          relevanceScore: this.calculateRelevanceScore(item, classification, index),
          searchQuery: query,
          timestamp: new Date(),
          metadata: this.extractKnowledgeMetadata(item)
        };
      });

      // Sort by relevance and return top results
      const finalResults = searchResults
        .filter(r => r.relevanceScore > 0.1)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 15);

      console.log(`✅ Returning ${finalResults.length} filtered and ranked results`);
      return finalResults;

    } catch (error) {
      console.error('❌ Knowledge base search error:', error);
      return [];
    }
  }

  /**
   * Direct course search - ONLY searches course table
   */
  private async searchCourseDirect(
    query: string,
    entities: QueryClassification['extractedEntities'],
    options: { limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`📚 Direct course search`);
    
    // If we have a specific course code, try exact match first
    if (entities.courseCode) {
      console.log(`🎯 Looking for specific course: ${entities.courseCode}`);
      const exactMatch = await db.course.findUnique({
        where: { code: entities.courseCode },
        include: { school: true }
      });
      
      if (exactMatch && (options.includeInactive || exactMatch.isActive)) {
        console.log(`✅ Found exact course match: ${exactMatch.code} - ${exactMatch.title}`);
        console.log(`📊 Coordinator: ${exactMatch.coordinatorName || 'Not specified'}`);
        console.log(`📊 Prerequisites: ${exactMatch.prerequisites || 'None'}`);
        return [this.courseToKnowledgeItem(exactMatch)];
      } else {
        console.log(`❌ Exact course match not found for: ${entities.courseCode}`);
      }
    }
    
    // Otherwise, do a fuzzy search
    const andConditions: Prisma.CourseWhereInput[] = [
      options.includeInactive ? {} : { isActive: true }
    ];
    
    if (entities.courseCode) {
      // Search for partial matches of the course code
      andConditions.push({
        OR: [
          { code: { contains: entities.courseCode, mode: 'insensitive' } },
          { title: { contains: entities.courseCode, mode: 'insensitive' } }
        ]
      });
    } else {
      console.log(`🔍 General course search for: "${query}"`);
      console.log(`🔍 Keywords: ${entities.keywords.join(', ')}`);
      
      // Build prioritized search with SEPARATE queries for better control
      console.log(`🔍 Building prioritized search strategy`);
      
      // STRATEGY 1: Try exact AND matches first (highest priority)
      if (entities.keywords.length >= 2) {
        console.log(`🎯 First trying AND condition for keywords: ${entities.keywords.join(', ')}`);
        const exactMatches = await db.course.findMany({
          where: {
            AND: [
              { isActive: options.includeInactive ? undefined : true },
              {
                AND: entities.keywords.map(keyword => ({
                  title: { contains: keyword, mode: 'insensitive' as const }
                }))
              }
            ].filter(Boolean)
          },
          include: { school: true },
          orderBy: [{ title: 'asc' }, { code: 'asc' }],
          take: Math.min(options.limit, 10)
        });
        
        console.log(`✅ Found ${exactMatches.length} exact AND matches`);
        if (exactMatches.length > 0) {
          console.log('🎯 Returning exact matches (highest priority)');
          exactMatches.forEach(course => {
            console.log(`   ✅ ${course.code} - ${course.title}`);
          });
          return exactMatches.map(course => this.courseToKnowledgeItem(course));
        }
      }
      
      // STRATEGY 2: If no exact matches, try broader search
      console.log(`🔍 No exact matches found, trying broader search`);
      const searchConditions = [];
      
      // 1. Full query in title
      searchConditions.push({
        title: { contains: query, mode: 'insensitive' as const }
      });
      
      // 2. Individual keywords in title (OR logic)
      entities.keywords.forEach(keyword => {
        searchConditions.push({
          title: { contains: keyword, mode: 'insensitive' as const }
        });
      });
      
      // 3. Keywords in description (fallback)
      entities.keywords.forEach(keyword => {
        searchConditions.push({
          description: { contains: keyword, mode: 'insensitive' as const }
        });
      });
      
      console.log(`🔍 Created ${searchConditions.length} search conditions`);
      andConditions.push({ OR: searchConditions });
    }
    
    const whereClause: Prisma.CourseWhereInput = {
      AND: andConditions
    };
    
    const courses = await db.course.findMany({
      where: whereClause,
      include: { school: true },
      orderBy: entities.courseCode ? 
        { code: 'asc' } : 
        [
          // For course name searches, prioritize title relevance
          { title: 'asc' },  // Alphabetical order helps with exact matches
          { code: 'asc' },
          { createdAt: 'desc' }
        ],
      take: options.limit
    });
    
    return courses.map(course => this.courseToKnowledgeItem(course));
  }

  /**
   * Direct program search - ONLY searches program table
   */
  private async searchProgramDirect(
    query: string,
    entities: QueryClassification['extractedEntities'],
    options: { limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`🎓 Direct program search`);
    console.log(`🔍 Program search query: "${query}"`);
    console.log(`🎯 Extracted entities:`, entities);
    console.log(`⚙️ Search options:`, options);
    
    const andConditions: Prisma.ProgramWhereInput[] = [
      options.includeInactive ? {} : { isActive: true }
    ];
    
    // If we have a program code
    if (entities.programCode) {
      console.log(`🔍 Searching by program code: ${entities.programCode}`);
      andConditions.push({
        OR: [
          { code: { equals: entities.programCode, mode: 'insensitive' as const } },
          { code: { contains: entities.programCode, mode: 'insensitive' as const } }
        ]
      });
    } else {
      console.log(`🔍 Searching by keywords: ${entities.keywords.join(', ')}`);
      // Search by keywords
      const searchConditions = entities.keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' as const } },
          { description: { contains: keyword, mode: 'insensitive' as const } },
          { careerOutcomes: { contains: keyword, mode: 'insensitive' as const } },
          { tags: { has: keyword } }
        ]
      }));
      
      if (searchConditions.length > 0) {
        andConditions.push({ OR: searchConditions });
      } else {
        console.log(`🔍 Fallback: searching by full query: "${query}"`);
        andConditions.push({
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { description: { contains: query, mode: 'insensitive' as const } }
          ]
        });
      }
    }
    
    const whereClause: Prisma.ProgramWhereInput = {
      AND: andConditions
    };
    
    console.log(`📊 Program search where clause:`, JSON.stringify(whereClause, null, 2));
    
    const programs = await db.program.findMany({
      where: whereClause,
      include: { school: true },
      orderBy: [{ createdAt: 'desc' }],
      take: options.limit
    });
    
    console.log(`📚 Program search results: Found ${programs.length} programs`);
    programs.forEach((program, index) => {
      console.log(`   ${index + 1}. ${program.code} - ${program.title}`);
    });
    
    return programs.map(program => this.programToKnowledgeItem(program));
  }

  /**
   * Direct academic information search
   */
  private async searchAcademicInfoDirect(
    query: string,
    entities: QueryClassification['extractedEntities'],
    options: { category?: string; tags?: string[]; limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`📋 Direct academic info search`);
    console.log(`🔍 Academic info search query: "${query}"`);
    console.log(`🎯 Extracted entities:`, entities);
    console.log(`🏷️ Keywords: ${entities.keywords.join(', ')}`);
    console.log(`⚙️ Search options:`, options);
    
    const andConditions: Prisma.AcademicInformationWhereInput[] = [
      options.includeInactive ? {} : { isActive: true },
      options.category ? { category: options.category } : {},
      options.tags?.length ? { tags: { hasSome: options.tags } } : {}
    ].filter(condition => Object.keys(condition).length > 0);
    
    // Add search conditions based on extracted entities
    const searchConditions = [
      { title: { contains: query, mode: 'insensitive' as const } },
      { content: { contains: query, mode: 'insensitive' as const } },
      ...entities.keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' as const } },
          { content: { contains: keyword, mode: 'insensitive' as const } },
          { tags: { has: keyword } }
        ]
      }))
    ];
    
    // Add context-based search enhancements
    if (entities.courseCode) {
      console.log(`🔗 Context: Looking for academic info related to course ${entities.courseCode}`);
      searchConditions.push({
        OR: [
          { content: { contains: entities.courseCode, mode: 'insensitive' as const } },
          { tags: { has: entities.courseCode } }
        ]
      });
    }
    
    if (entities.programCode) {
      console.log(`🔗 Context: Looking for academic info related to program ${entities.programCode}`);
      searchConditions.push({
        OR: [
          { content: { contains: entities.programCode, mode: 'insensitive' as const } },
          { tags: { has: entities.programCode } }
        ]
      });
    }
    
    andConditions.push({ OR: searchConditions });
    
    const whereClause: Prisma.AcademicInformationWhereInput = {
      AND: andConditions
    };
    
    console.log(`📊 Academic info search where clause:`, JSON.stringify(whereClause, null, 2));
    
    const results = await db.academicInformation.findMany({
      where: whereClause,
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' }
      ],
      take: options.limit
    });
    
    console.log(`📚 Academic info search results: Found ${results.length} items`);
    results.forEach((item, index) => {
      console.log(`   ${index + 1}. [${item.category}] ${item.title.substring(0, 50)}${item.title.length > 50 ? '...' : ''}`);
    });
    
    return results.map(item => this.academicInfoToKnowledgeItem(item));
  }

  /**
   * Direct school search
   */
  private async searchSchoolDirect(
    query: string,
    entities: QueryClassification['extractedEntities'],
    options: { limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`🏫 Direct school search`);
    console.log(`🔍 School search query: "${query}"`);
    console.log(`🎯 Extracted entities:`, entities);
    console.log(`🏷️ Keywords: ${entities.keywords.join(', ')}`);
    console.log(`⚙️ Search options:`, options);
    
    const searchConditions = [
      { name: { contains: query, mode: 'insensitive' as const } },
      { faculty: { contains: query, mode: 'insensitive' as const } },
      ...entities.keywords.map(keyword => ({
        OR: [
          { name: { contains: keyword, mode: 'insensitive' as const } },
          { shortName: { contains: keyword, mode: 'insensitive' as const } },
          { faculty: { contains: keyword, mode: 'insensitive' as const } }
        ]
      }))
    ];
    
    // Add context-based search enhancements
    if (entities.courseCode) {
      console.log(`🔗 Context: Looking for school that offers course ${entities.courseCode}`);
      // We could enhance this by finding courses with this code and their schools
      // For now, we'll search by the course code in school names/faculties
      searchConditions.push({
        OR: [
          { name: { contains: entities.courseCode, mode: 'insensitive' as const } },
          { shortName: { contains: entities.courseCode, mode: 'insensitive' as const } }
        ]
      });
    }
    
    if (entities.programCode) {
      console.log(`🔗 Context: Looking for school that offers program ${entities.programCode}`);
      // Similar context enhancement for programs
      searchConditions.push({
        OR: [
          { name: { contains: entities.programCode, mode: 'insensitive' as const } },
          { shortName: { contains: entities.programCode, mode: 'insensitive' as const } }
        ]
      });
    }
    
    const whereClause = { OR: searchConditions };
    console.log(`📊 School search where clause:`, JSON.stringify(whereClause, null, 2));
    
    const schools = await db.academicSchool.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }],
      take: options.limit
    });
    
    console.log(`📚 School search results: Found ${schools.length} schools`);
    schools.forEach((school, index) => {
      console.log(`   ${index + 1}. ${school.name} (${school.faculty || 'No faculty specified'})`);
    });
    
    return schools.map(school => this.schoolToKnowledgeItem(school));
  }

  /**
   * Search multiple tables for mixed queries
   */
  private async searchMultipleTables(
    query: string,
    tables: ('course' | 'program' | 'academic_information' | 'school')[],
    options: KnowledgeSearchOptions & { limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`🔍 Multi-table search across:`, tables);
    console.log(`🔍 Multi-table search query: "${query}"`);
    console.log(`⚙️ Multi-table search options:`, options);
    
    const results: KnowledgeBaseItem[] = [];
    const keywords = this.extractKeywords(query);
    const limitPerTable = Math.ceil(options.limit / tables.length) + 2;
    
    console.log(`🏷️ Extracted keywords: ${keywords.join(', ')}`);
    console.log(`📊 Limit per table: ${limitPerTable}`);
    
    for (const table of tables) {
      console.log(`\n🔍 Searching ${table} table...`);
      
      switch (table) {
        case 'course':
          const courses = await this.searchCourseDirect(
            query, 
            { keywords }, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          console.log(`   ✅ Found ${courses.length} courses`);
          results.push(...courses);
          break;
          
        case 'program':
          const programs = await this.searchProgramDirect(
            query, 
            { keywords }, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          console.log(`   ✅ Found ${programs.length} programs`);
          results.push(...programs);
          break;
          
        case 'academic_information':
          const academicInfo = await this.searchAcademicInfoDirect(
            query, 
            { keywords }, 
            { ...options, limit: limitPerTable }
          );
          console.log(`   ✅ Found ${academicInfo.length} academic info items`);
          results.push(...academicInfo);
          break;
          
        case 'school':
          const schools = await this.searchSchoolDirect(
            query, 
            { keywords }, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          console.log(`   ✅ Found ${schools.length} schools`);
          results.push(...schools);
          break;
      }
    }
    
    console.log(`\n📊 Multi-table search summary:`);
    console.log(`   Total results before sorting: ${results.length}`);
    
    // Sort by relevance and return top results
    const finalResults = results
      .sort((a, b) => b.priority - a.priority)
      .slice(0, options.limit);
      
    console.log(`   Final results after sorting and limiting: ${finalResults.length}`);
    
    return finalResults;
  }

  /**
   * Calculate relevance score based on query classification
   */
  private calculateRelevanceScore(
    item: KnowledgeBaseItem,
    classification: QueryClassification,
    index: number
  ): number {
    let baseScore = 0.5;
    
    // Exact matches get highest scores
    if (classification.extractedEntities.courseCode && 
        item.type === 'course' && 
        item.structuredData && 
        (item.structuredData as Record<string, unknown>).code === classification.extractedEntities.courseCode) {
      return 1.0; // Perfect match
    }
    
    if (classification.extractedEntities.programCode && 
        item.type === 'program' && 
        item.structuredData && 
        (item.structuredData as Record<string, unknown>).code === classification.extractedEntities.programCode) {
      return 1.0; // Perfect match
    }
    
    // Primary table matches get higher scores
    if (item.type === classification.primaryTable) {
      baseScore += 0.3;
    }
    
    // Priority boost
    baseScore += (item.priority / 100) * 0.2;
    
    // Position penalty (earlier results are better)
    baseScore -= index * 0.02;
    
    return Math.max(0.1, Math.min(1.0, baseScore));
  }

  /**
   * Conversion methods - Transform database models to KnowledgeBaseItem
   */
  private courseToKnowledgeItem(course: CourseWithSchool): KnowledgeBaseItem {
    return {
      id: course.id,
      title: `${course.code} - ${course.title}`,
      content: this.buildCourseContent(course),
      category: course.level.toLowerCase(),
      tags: [course.code, course.level.toLowerCase()],
      sourceUrl: course.sourceUrl || '',
      priority: 10, // Courses get high priority
      isActive: course.isActive,
      structuredData: {
        code: course.code,
        level: course.level,
        creditPoints: course.creditPoints,
        deliveryMode: course.deliveryMode,
        campus: course.campus,
        prerequisites: course.prerequisites,
        school: course.school?.name,
        faculty: course.school?.faculty,
        coordinator: course.coordinatorName,
        coordinatorEmail: course.coordinatorEmail,
        coordinatorPhone: course.coordinatorPhone,
        learningOutcomes: course.learningOutcomes,
        assessmentTasks: course.assessmentTasks
      },
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      type: 'course'
    };
  }

  private programToKnowledgeItem(program: ProgramWithSchool): KnowledgeBaseItem {
    return {
      id: program.id,
      title: `${program.code} - ${program.title}`,
      content: this.buildProgramContent(program),
      category: program.level.toLowerCase(),
      tags: [...program.tags, program.level.toLowerCase()],
      sourceUrl: program.sourceUrl || '',
      priority: 8, // Programs get high priority
      isActive: program.isActive,
      structuredData: {
        code: program.code,
        level: program.level,
        duration: program.duration,
        deliveryMode: program.deliveryMode,
        campus: program.campus,
        school: program.school?.name,
        faculty: program.school?.faculty,
        coordinator: program.coordinatorName,
        coordinatorEmail: program.coordinatorEmail,
        coordinatorPhone: program.coordinatorPhone,
        entryRequirements: program.entryRequirements,
        careerOutcomes: program.careerOutcomes,
        fees: program.fees,
        ...program.structuredData as object
      },
      createdAt: program.createdAt,
      updatedAt: program.updatedAt,
      type: 'program'
    };
  }

  private academicInfoToKnowledgeItem(item: AcademicInformation): KnowledgeBaseItem {
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category,
      tags: item.tags,
      sourceUrl: item.sourceUrl || '',
      priority: item.priority,
      isActive: item.isActive,
      structuredData: item.structuredData,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      type: 'academic_information'
    };
  }

  private schoolToKnowledgeItem(school: AcademicSchool): KnowledgeBaseItem {
    return {
      id: school.id,
      title: school.name,
      content: `${school.name} is part of the ${school.faculty} faculty at RMIT University.`,
      category: 'school',
      tags: ['school', 'faculty', school.shortName || '', school.faculty || ''].filter(Boolean),
      sourceUrl: '',
      priority: 5,
      isActive: true,
      structuredData: {
        shortName: school.shortName,
        faculty: school.faculty
      },
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      type: 'school'
    };
  }

  /**
   * Build comprehensive course content
   */
  private buildCourseContent(course: CourseWithSchool): string {
    const parts = [];
    if (course.description) parts.push(course.description);
    if (course.creditPoints) parts.push(`Credit Points: ${course.creditPoints}`);
    if (course.deliveryMode && course.deliveryMode.length > 0) parts.push(`Delivery Mode: ${course.deliveryMode.join(', ')}`);
    if (course.campus && course.campus.length > 0) parts.push(`Campus: ${course.campus.join(', ')}`);
    if (course.prerequisites) parts.push(`Prerequisites: ${course.prerequisites}`);
    if (course.learningOutcomes) parts.push(`Learning Outcomes: ${course.learningOutcomes}`);
    if (course.assessmentTasks) parts.push(`Assessment: ${course.assessmentTasks}`);
    if (course.coordinatorName) {
      let coordinatorInfo = `Course Coordinator: ${course.coordinatorName}`;
      if (course.coordinatorEmail) coordinatorInfo += ` (Email: ${course.coordinatorEmail})`;
      if (course.coordinatorPhone) coordinatorInfo += ` (Phone: ${course.coordinatorPhone})`;
      parts.push(coordinatorInfo);
    }
    if (course.school) {
      parts.push(`School: ${course.school.name}`);
      if (course.school.faculty) parts.push(`Faculty: ${course.school.faculty}`);
    }
    // Add any additional fields present in the course object
    const extraFields = [
      'code', 'level', 'sourceUrl', 'tags', 'createdAt', 'updatedAt'
    ];
    extraFields.forEach(field => {
      // @ts-expect-error: dynamic property access for known extra fields
      const value = course[field];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          parts.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${value.join(', ')}`);
        } else if (typeof value === 'object' && value instanceof Date) {
          parts.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${value.toISOString()}`);
        } else {
          parts.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${String(value)}`);
        }
      }
    });
    return parts.join('\n\n');
  }

  /**
   * Build contextual program content based on query intent
   */
  private buildProgramContent(program: ProgramWithSchool): string {
    const parts = [];
    
    // Always include core information
    if (program.description) {
      parts.push(program.description);
    }
    
    // Core program details
    if (program.duration) {
      parts.push(`Duration: ${program.duration}`);
    }
    
    if (program.deliveryMode && program.deliveryMode.length > 0) {
      parts.push(`Delivery Mode: ${program.deliveryMode.join(', ')}`);
    }
    
    if (program.campus && program.campus.length > 0) {
      parts.push(`Campus: ${program.campus.join(', ')}`);
    }
    
    if (program.school) {
      parts.push(`School: ${program.school.name}`);
      if (program.school.faculty) {
        parts.push(`Faculty: ${program.school.faculty}`);
      }
    }
    
    // Additional details based on context (can be accessed via structured data if needed)
    // Entry requirements, fees, coordinator info are available in structuredData
    // but not included in main content unless specifically relevant
    
    return parts.join('\n\n');
  }

  /**
   * Prepare content snippet for general queries
   */
  private prepareContentSnippet(
    content: string,
    query: string,
    searchTerms: string[]
  ): string {
    const maxLength = 400;
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Find the best snippet that contains query or important terms
    let bestStart = 0;
    let bestScore = 0;
    
    // Look for query match first
    const queryIndex = contentLower.indexOf(queryLower);
    if (queryIndex !== -1) {
      bestStart = Math.max(0, queryIndex - 100);
      bestScore = 1.0;
    } else {
      // Look for term matches
      searchTerms.forEach(term => {
        const termIndex = contentLower.indexOf(term.toLowerCase());
        if (termIndex !== -1) {
          const score = 0.5 + (term.length / 20);
          if (score > bestScore) {
            bestScore = score;
            bestStart = Math.max(0, termIndex - 100);
          }
        }
      });
    }
    
    // Extract snippet
    let snippet = content.slice(bestStart, bestStart + maxLength);
    
    // Clean up snippet
    if (bestStart > 0) {
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 50) {
        snippet = '...' + snippet.slice(firstSpace);
      } else {
        snippet = '...' + snippet;
      }
    }
    
    if (bestStart + maxLength < content.length) {
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > snippet.length - 50) {
        snippet = snippet.slice(0, lastSpace) + '...';
      } else {
        snippet = snippet + '...';
      }
    }
    
    return snippet.trim();
  }

  /**
   * Extract metadata from knowledge base item
   */
  private extractKnowledgeMetadata(item: KnowledgeBaseItem): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {
      type: item.type,
      category: item.category
    };
    
    if (item.structuredData) {
      const structured = item.structuredData as Record<string, unknown>;
      Object.assign(metadata, structured);
    }
    
    return metadata;
  }

  /**
   * Get categories from all tables
   */
  async getCategories(): Promise<string[]> {
    const [academicCategories] = await Promise.all([
      db.academicInformation.findMany({
        distinct: ["category"],
        where: { isActive: true },
        select: { category: true },
        orderBy: { category: 'asc' }
      })
    ]);

    const categories = [
      ...academicCategories.map(x => x.category),
      'undergraduate',
      'postgraduate',
      'programs',
      'courses', 
      'schools'
    ];

    return Array.from(new Set(categories))
      .filter(Boolean)
      .filter(cat => cat.length > 0);
  }

  /**
   * Get structured knowledge for AI responses
   */
  async getStructuredKnowledgeForAI(
    query: string, 
    category?: string,
    context?: QueryContext
  ): Promise<string> {
    console.log(`🤖 Getting structured knowledge for AI: "${query}"`);
    
    // Get results using the main search method
    const results = await this.searchKnowledge(query, {
      category,
      limit: 5
    }, context);

    if (results.length === 0) {
      return "No specific RMIT knowledge found for this query.";
    }

    console.log(`📚 Found ${results.length} knowledge items for AI`);
    
    // Classify the query to determine formatting
    const classification = QueryClassifier.classify(query, context);
    
    // For specific course/program queries, provide detailed single result
    if ((classification.queryType === 'specific_course' || classification.queryType === 'specific_program') 
        && results.length > 0) {
      return this.formatSingleItemForAI(results[0]);
    }
    
    // For general queries, provide multiple results
    return results.map(item => this.formatItemForAI(item)).join('\n\n---\n\n');
  }

  /**
   * Format single item with full details for AI
   */
  private formatSingleItemForAI(item: KnowledgeBaseItem): string {
    const data = item.structuredData as Record<string, unknown>;
    if (item.type === 'course') {
      return `# ${item.title}\n\n` +
        `**Course Code:** ${data.code}\n` +
        `**Type:** Course\n` +
        `**Level:** ${data.level}\n` +
        `**Credit Points:** ${data.creditPoints || 'Not specified'}\n` +
        `**School:** ${data.school || 'Not specified'}\n` +
        `**Faculty:** ${data.faculty || 'Not specified'}\n` +
        `\n## Course Description\n${item.content}\n` +
        `\n## Course Coordinator\n${data.coordinator ? `- Name: ${data.coordinator}\n- Email: ${data.coordinatorEmail || 'Not provided'}\n- Phone: ${data.coordinatorPhone || 'Not provided'}` : 'Coordinator information not available'}\n` +
        `\n## Prerequisites\n${data.prerequisites || 'No prerequisites'}\n` +
        `\n## Delivery Information\n- **Delivery Mode:** ${Array.isArray(data.deliveryMode) ? data.deliveryMode.join(', ') : 'Not specified'}\n- **Campus:** ${Array.isArray(data.campus) ? data.campus.join(', ') : 'Not specified'}\n` +
        `\n## Assessment\n${data.assessmentTasks || 'Assessment information not available'}\n` +
        `\n## Learning Outcomes\n${data.learningOutcomes || 'Learning outcomes not available'}\n` +
        `\nSource: ${item.sourceUrl || 'RMIT Course Database'}\n` +
        `\n## All Available Data\nThe following additional information is available for this course:\n` +
        Object.entries(data)
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `- **${key}**: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
          .join('\n');
    }
    if (item.type === 'program') {
      return `# ${item.title}\n\n` +
        `**Program Code:** ${data.code}\n` +
        `**Type:** ${data.level} Program\n` +
        `**Duration:** ${data.duration || 'Not specified'}\n` +
        `**School:** ${data.school || 'Not specified'}\n` +
        `**Faculty:** ${data.faculty || 'Not specified'}\n` +
        `\n## Program Description\n${item.content}\n` +
        `\n## Program Coordinator\n${data.coordinator ? `- Name: ${data.coordinator}\n- Email: ${data.coordinatorEmail || 'Not provided'}\n- Phone: ${data.coordinatorPhone || 'Not provided'}` : 'Coordinator information not available'}\n` +
        `\n## Entry Requirements\n${data.entryRequirements || 'Entry requirements not specified'}\n` +
        `\n## Career Outcomes\n${data.careerOutcomes || 'Career outcomes not specified'}\n` +
        `\n## Fees Information\n${data.fees || 'Fee information not available'}\n` +
        `\n## Delivery Information\n- **Delivery Mode:** ${Array.isArray(data.deliveryMode) ? data.deliveryMode.join(', ') : 'Not specified'}\n- **Campus:** ${Array.isArray(data.campus) ? data.campus.join(', ') : 'Not specified'}\n` +
        `\nSource: ${item.sourceUrl || 'RMIT Program Database'}\n` +
        `\n## All Available Data\nThe following additional information is available for this program:\n` +
        Object.entries(data)
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `- **${key}**: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
          .join('\n');
    }
    // Default formatting for other types
    return this.formatItemForAI(item);
  }

  /**
   * Format item for AI response
   */
  private formatItemForAI(item: KnowledgeBaseItem): string {
    let formattedEntry = `## ${item.title}\n`;
    formattedEntry += `Type: ${item.type}\n`;
    formattedEntry += `Category: ${item.category}\n`;
    
    // Add content first
    formattedEntry += `\nDetails:\n${item.content}`;
    
    // Add ALL structured data if available
    if (item.structuredData) {
      const structured = item.structuredData as Record<string, unknown>;
      
      const structuredInfo = Object.entries(structured)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => {
          const formattedKey = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
          
          const formattedValue = Array.isArray(value) ? value.join(', ') : value;
          return `${formattedKey}: ${formattedValue}`;
        })
        .join('\n');
      
      if (structuredInfo) {
        formattedEntry += `\n\n### Complete Information:\n${structuredInfo}`;
      }
    }
    
    // Add source URL if available
    if (item.sourceUrl && item.sourceUrl !== '#' && !item.sourceUrl.startsWith('#')) {
      formattedEntry += `\n\nSource: ${item.sourceUrl}`;
    }
    
    // Add tags for context
    if (item.tags.length > 0) {
      formattedEntry += `\nRelated Topics: ${item.tags.join(', ')}`;
    }
    
    return formattedEntry;
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'what', 'how', 'when',
      'where', 'why', 'can', 'you', 'i', 'me', 'tell', 'about', 'find', 'show',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'have', 'has', 'had', 'get', 'got', 'give', 'want', 'need', 'like',
      'make', 'take', 'go', 'come', 'see', 'know', 'think', 'say', 'please',
      'help', 'information', 'details', 'more', 'some', 'any', 'all', 'much',
      'many', 'most', 'other', 'such', 'even', 'just', 'only', 'also', 'very',
      'really', 'actually', 'basically', 'generally', 'specifically', 'particularly'
    ]);
    
    return query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => /^[a-zA-Z]+$/.test(word)); // Only alphabetic words
  }
}