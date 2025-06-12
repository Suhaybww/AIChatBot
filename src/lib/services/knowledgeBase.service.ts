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
          classification.extractedEntities.keywords, 
          { category, tags, limit, includeInactive }
        );
        
      case 'school':
        return this.searchSchoolDirect(
          query, 
          classification.extractedEntities.keywords, 
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
          url: item.sourceUrl || `#${item.type}-${item.id}`,
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
      const exactMatch = await db.course.findUnique({
        where: { code: entities.courseCode },
        include: { school: true }
      });
      
      if (exactMatch && (options.includeInactive || exactMatch.isActive)) {
        console.log(`✅ Found exact course match: ${exactMatch.code}`);
        return [this.courseToKnowledgeItem(exactMatch)];
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
      // General course search
      const searchConditions = entities.keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' as const } },
          { code: { contains: keyword, mode: 'insensitive' as const } },
          { description: { contains: keyword, mode: 'insensitive' as const } },
          { learningOutcomes: { contains: keyword, mode: 'insensitive' as const } }
        ]
      }));
      
      if (searchConditions.length > 0) {
        andConditions.push({ OR: searchConditions });
      } else {
        andConditions.push({
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { description: { contains: query, mode: 'insensitive' as const } }
          ]
        });
      }
    }
    
    const whereClause: Prisma.CourseWhereInput = {
      AND: andConditions
    };
    
    const courses = await db.course.findMany({
      where: whereClause,
      include: { school: true },
      orderBy: entities.courseCode ? { code: 'asc' } : { createdAt: 'desc' },
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
    
    const andConditions: Prisma.ProgramWhereInput[] = [
      options.includeInactive ? {} : { isActive: true }
    ];
    
    // If we have a program code
    if (entities.programCode) {
      andConditions.push({
        OR: [
          { code: { equals: entities.programCode, mode: 'insensitive' as const } },
          { code: { contains: entities.programCode, mode: 'insensitive' as const } }
        ]
      });
    } else {
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
    
    const programs = await db.program.findMany({
      where: whereClause,
      include: { school: true },
      orderBy: [{ createdAt: 'desc' }],
      take: options.limit
    });
    
    return programs.map(program => this.programToKnowledgeItem(program));
  }

  /**
   * Direct academic information search
   */
  private async searchAcademicInfoDirect(
    query: string,
    keywords: string[],
    options: { category?: string; tags?: string[]; limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`📋 Direct academic info search`);
    
    const andConditions: Prisma.AcademicInformationWhereInput[] = [
      options.includeInactive ? {} : { isActive: true },
      options.category ? { category: options.category } : {},
      options.tags?.length ? { tags: { hasSome: options.tags } } : {}
    ].filter(condition => Object.keys(condition).length > 0);
    
    // Add search conditions
    const searchConditions = [
      { title: { contains: query, mode: 'insensitive' as const } },
      { content: { contains: query, mode: 'insensitive' as const } },
      ...keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' as const } },
          { content: { contains: keyword, mode: 'insensitive' as const } },
          { tags: { has: keyword } }
        ]
      }))
    ];
    
    andConditions.push({ OR: searchConditions });
    
    const whereClause: Prisma.AcademicInformationWhereInput = {
      AND: andConditions
    };
    
    const results = await db.academicInformation.findMany({
      where: whereClause,
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' }
      ],
      take: options.limit
    });
    
    return results.map(item => this.academicInfoToKnowledgeItem(item));
  }

  /**
   * Direct school search
   */
  private async searchSchoolDirect(
    query: string,
    keywords: string[],
    options: { limit: number; includeInactive: boolean }
  ): Promise<KnowledgeBaseItem[]> {
    console.log(`🏫 Direct school search`);
    
    const searchConditions = [
      { name: { contains: query, mode: 'insensitive' as const } },
      { faculty: { contains: query, mode: 'insensitive' as const } },
      { description: { contains: query, mode: 'insensitive' as const } },
      ...keywords.map(keyword => ({
        OR: [
          { name: { contains: keyword, mode: 'insensitive' as const } },
          { shortName: { contains: keyword, mode: 'insensitive' as const } },
          { faculty: { contains: keyword, mode: 'insensitive' as const } }
        ]
      }))
    ];
    
    const schools = await db.academicSchool.findMany({
      where: { OR: searchConditions },
      orderBy: [{ createdAt: 'desc' }],
      take: options.limit
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
    
    const results: KnowledgeBaseItem[] = [];
    const keywords = this.extractKeywords(query);
    const limitPerTable = Math.ceil(options.limit / tables.length) + 2;
    
    for (const table of tables) {
      switch (table) {
        case 'course':
          const courses = await this.searchCourseDirect(
            query, 
            { keywords }, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          results.push(...courses);
          break;
          
        case 'program':
          const programs = await this.searchProgramDirect(
            query, 
            { keywords }, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          results.push(...programs);
          break;
          
        case 'academic_information':
          const academicInfo = await this.searchAcademicInfoDirect(
            query, 
            keywords, 
            { ...options, limit: limitPerTable }
          );
          results.push(...academicInfo);
          break;
          
        case 'school':
          const schools = await this.searchSchoolDirect(
            query, 
            keywords, 
            { limit: limitPerTable, includeInactive: options.includeInactive }
          );
          results.push(...schools);
          break;
      }
    }
    
    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.priority - a.priority)
      .slice(0, options.limit);
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
        corequisites: course.corequisites,
        school: course.school?.name,
        faculty: course.school?.faculty,
        coordinator: course.coordinatorName,
        coordinatorEmail: course.coordinatorEmail,
        coordinatorPhone: course.coordinatorPhone,
        learningOutcomes: course.learningOutcomes,
        assessmentTasks: course.assessmentTasks,
        hurdleRequirement: course.hurdleRequirement
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
      content: school.description || `${school.name} is part of the ${school.faculty} faculty at RMIT University.`,
      category: 'school',
      tags: ['school', 'faculty', school.shortName || '', school.faculty || ''].filter(Boolean),
      sourceUrl: school.website || '',
      priority: 5,
      isActive: true,
      structuredData: {
        shortName: school.shortName,
        faculty: school.faculty,
        website: school.website
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
    
    if (course.description) {
      parts.push(course.description);
    }
    
    if (course.creditPoints) {
      parts.push(`Credit Points: ${course.creditPoints}`);
    }
    
    if (course.deliveryMode && course.deliveryMode.length > 0) {
      parts.push(`Delivery Mode: ${course.deliveryMode.join(', ')}`);
    }
    
    if (course.campus && course.campus.length > 0) {
      parts.push(`Campus: ${course.campus.join(', ')}`);
    }
    
    if (course.prerequisites) {
      parts.push(`Prerequisites: ${course.prerequisites}`);
    }
    
    if (course.corequisites) {
      parts.push(`Corequisites: ${course.corequisites}`);
    }
    
    if (course.learningOutcomes) {
      parts.push(`Learning Outcomes: ${course.learningOutcomes}`);
    }
    
    if (course.assessmentTasks) {
      parts.push(`Assessment: ${course.assessmentTasks}`);
    }
    
    if (course.hurdleRequirement) {
      parts.push(`Hurdle Requirements: ${course.hurdleRequirement}`);
    }
    
    if (course.coordinatorName) {
      let coordinatorInfo = `Course Coordinator: ${course.coordinatorName}`;
      if (course.coordinatorEmail) {
        coordinatorInfo += ` (Email: ${course.coordinatorEmail})`;
      }
      if (course.coordinatorPhone) {
        coordinatorInfo += ` (Phone: ${course.coordinatorPhone})`;
      }
      parts.push(coordinatorInfo);
    }
    
    if (course.school) {
      parts.push(`School: ${course.school.name}`);
      if (course.school.faculty) {
        parts.push(`Faculty: ${course.school.faculty}`);
      }
    }
    
    return parts.join('\n\n');
  }

  /**
   * Build comprehensive program content
   */
  private buildProgramContent(program: ProgramWithSchool): string {
    const parts = [];
    
    if (program.description) {
      parts.push(program.description);
    }
    
    if (program.duration) {
      parts.push(`Duration: ${program.duration}`);
    }
    
    if (program.deliveryMode && program.deliveryMode.length > 0) {
      parts.push(`Delivery Mode: ${program.deliveryMode.join(', ')}`);
    }
    
    if (program.campus && program.campus.length > 0) {
      parts.push(`Campus: ${program.campus.join(', ')}`);
    }
    
    if (program.entryRequirements) {
      parts.push(`Entry Requirements: ${program.entryRequirements}`);
    }
    
    if (program.careerOutcomes) {
      parts.push(`Career Outcomes: ${program.careerOutcomes}`);
    }
    
    if (program.fees) {
      parts.push(`Fees: ${program.fees}`);
    }
    
    if (program.coordinatorName) {
      let coordinatorInfo = `Program Coordinator: ${program.coordinatorName}`;
      if (program.coordinatorEmail) {
        coordinatorInfo += ` (Email: ${program.coordinatorEmail})`;
      }
      parts.push(coordinatorInfo);
    }
    
    if (program.school) {
      parts.push(`School: ${program.school.name}`);
      if (program.school.faculty) {
        parts.push(`Faculty: ${program.school.faculty}`);
      }
    }
    
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
      return `# ${item.title}

**Course Code:** ${data.code}
**Type:** Course
**Level:** ${data.level}
**Credit Points:** ${data.creditPoints || 'Not specified'}
**School:** ${data.school || 'Not specified'}
**Faculty:** ${data.faculty || 'Not specified'}

## Course Coordinator
${data.coordinator ? `- Name: ${data.coordinator}
- Email: ${data.coordinatorEmail || 'Not provided'}
- Phone: ${data.coordinatorPhone || 'Not provided'}` : 'Coordinator information not available'}

## Prerequisites
${data.prerequisites || 'No prerequisites'}

## Corequisites
${data.corequisites || 'No corequisites'}

## Course Description
${item.content}

## Delivery Information
- **Delivery Mode:** ${Array.isArray(data.deliveryMode) ? data.deliveryMode.join(', ') : 'Not specified'}
- **Campus:** ${Array.isArray(data.campus) ? data.campus.join(', ') : 'Not specified'}

## Assessment
${data.assessmentTasks || 'Assessment information not available'}

## Learning Outcomes
${data.learningOutcomes || 'Learning outcomes not available'}

## Hurdle Requirements
${data.hurdleRequirement || 'No hurdle requirements'}

Source: ${item.sourceUrl || 'RMIT Course Database'}`;
    }
    
    if (item.type === 'program') {
      return `# ${item.title}

**Program Code:** ${data.code}
**Type:** ${data.level} Program
**Duration:** ${data.duration || 'Not specified'}
**School:** ${data.school || 'Not specified'}
**Faculty:** ${data.faculty || 'Not specified'}

## Program Coordinator
${data.coordinator ? `- Name: ${data.coordinator}
- Email: ${data.coordinatorEmail || 'Not provided'}
- Phone: ${data.coordinatorPhone || 'Not provided'}` : 'Coordinator information not available'}

## Program Description
${item.content}

## Entry Requirements
${data.entryRequirements || 'Entry requirements not specified'}

## Career Outcomes
${data.careerOutcomes || 'Career outcomes not specified'}

## Fees
${data.fees || 'Fee information not available'}

## Delivery Information
- **Delivery Mode:** ${Array.isArray(data.deliveryMode) ? data.deliveryMode.join(', ') : 'Not specified'}
- **Campus:** ${Array.isArray(data.campus) ? data.campus.join(', ') : 'Not specified'}

Source: ${item.sourceUrl || 'RMIT Program Database'}`;
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
    
    // Add structured data if available
    if (item.structuredData) {
      const structured = item.structuredData as Record<string, unknown>;
      const importantFields = ['code', 'level', 'coordinator', 'coordinatorEmail', 
                              'prerequisites', 'creditPoints', 'school', 'faculty'];
      
      const structuredInfo = Object.entries(structured)
        .filter(([key]) => importantFields.includes(key))
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
          const formattedKey = key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          return `${formattedKey}: ${value}`;
        })
        .join('\n');
      
      if (structuredInfo) {
        formattedEntry += `\n${structuredInfo}\n`;
      }
    }
    
    // Add content
    formattedEntry += `\nDetails:\n${item.content}`;
    
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
      'where', 'why', 'can', 'you', 'i', 'me', 'tell', 'about', 'find', 'show'
    ]);
    
    return query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }
}