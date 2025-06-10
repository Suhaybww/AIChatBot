import { db } from "@/server/db/db";
import type { SearchResult } from "./search.service";
import type { JsonValue } from "@prisma/client/runtime/library";

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
}

export interface KnowledgeSearchOptions {
  category?: string;
  tags?: string[];
  limit?: number;
  includeInactive?: boolean;
  searchMode?: 'exact' | 'fuzzy' | 'semantic';
}

export class KnowledgeBaseService {
  
  /**
   * Search knowledge base with enhanced options
   */
  async searchKnowledge(
    query: string, 
    options: KnowledgeSearchOptions = {}
  ): Promise<KnowledgeBaseItem[]> {
    const {
      category,
      tags,
      limit = 10,
      includeInactive = false,
      searchMode = 'fuzzy'
    } = options;

    // Build search conditions based on mode
    const searchConditions = this.buildSearchConditions(query, searchMode, tags);

    const results = await db.knowledgeBase.findMany({
      where: {
        AND: [
          searchConditions,
          category ? { category } : {},
          includeInactive ? {} : { isActive: true }
        ]
      },
      orderBy: [
        { priority: "desc" },
        { updatedAt: "desc" }
      ],
      take: limit * 2, // Get more for post-filtering
    });

    // Post-process and rank results
    const rankedResults = this.rankKnowledgeResults(results, query);
    return rankedResults.slice(0, limit);
  }

  /**
   * Search for results in knowledge base format
   */
  async searchForResults(query: string, enhancedTerms: string[]): Promise<SearchResult[]> {
    try {
      // Build comprehensive search query
      const searchConditions = this.buildEnhancedSearchConditions(query, enhancedTerms);
      
      const kbResults = await db.knowledgeBase.findMany({
        where: {
          isActive: true,
          AND: [searchConditions]
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        take: 30 // Get more for better ranking
      });

      // Convert to SearchResult format with enhanced relevance scoring
      const searchResults = kbResults.map((item) => {
        const relevanceScore = this.calculateEnhancedRelevance(
          query, 
          enhancedTerms, 
          item
        );
        
        return {
          id: `kb_${item.id}`,
          title: item.title,
          content: this.prepareContentSnippet(item.content, query, enhancedTerms),
          url: item.sourceUrl || `#knowledge-base-${item.id}`,
          source: 'knowledge_base' as const,
          relevanceScore,
          searchQuery: query,
          timestamp: new Date(),
          metadata: this.extractKnowledgeMetadata(item)
        };
      });

      // Sort by relevance and return top results
      return searchResults
        .filter(r => r.relevanceScore > 0.1)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 15);

    } catch (error) {
      console.error('❌ Knowledge base search error:', error);
      return [];
    }
  }

  /**
   * Build search conditions based on search mode
   */
  private buildSearchConditions(
    query: string,
    searchMode: 'exact' | 'fuzzy' | 'semantic',
    tags?: string[]
  ) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    switch (searchMode) {
      case 'exact':
        return {
          OR: [
            { title: { equals: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } }
          ],
          ...(tags?.length ? { tags: { hasSome: tags } } : {})
        };
      
      case 'fuzzy':
      default:
        return {
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { content: { contains: query, mode: 'insensitive' as const } },
            ...queryWords.map(word => ({
              OR: [
                { title: { contains: word, mode: 'insensitive' as const } },
                { content: { contains: word, mode: 'insensitive' as const } },
                { tags: { has: word } }
              ]
            })),
            ...(tags?.length ? [{ tags: { hasSome: tags } }] : [])
          ]
        };
      
      case 'semantic':
        // For semantic search, we'd ideally use vector embeddings
        // For now, use enhanced fuzzy search
        return {
          OR: [
            ...this.generateSemanticVariations(query).map(variation => ({
              OR: [
                { title: { contains: variation, mode: 'insensitive' as const } },
                { content: { contains: variation, mode: 'insensitive' as const } }
              ]
            })),
            ...queryWords.map(word => ({
              OR: [
                { title: { contains: word, mode: 'insensitive' as const } },
                { content: { contains: word, mode: 'insensitive' as const } },
                { category: { contains: word, mode: 'insensitive' as const } }
              ]
            }))
          ]
        };
    }
  }

  /**
   * Build enhanced search conditions for comprehensive searching
   */
  private buildEnhancedSearchConditions(query: string, enhancedTerms: string[]) {
    const conditions = [];
    
    // Direct query match
    conditions.push(
      { title: { contains: query, mode: 'insensitive' as const } },
      { content: { contains: query, mode: 'insensitive' as const } }
    );
    
    // Enhanced terms matching
    enhancedTerms.forEach(term => {
      conditions.push(
        { title: { contains: term, mode: 'insensitive' as const } },
        { content: { contains: term, mode: 'insensitive' as const } },
        { tags: { has: term } },
        { category: { contains: term, mode: 'insensitive' as const } }
      );
    });
    
    // Course code pattern matching
    const courseCodeMatch = query.match(/\b([A-Z]{2,4}\d{3,5})\b/i);
    if (courseCodeMatch) {
      conditions.push(
        { title: { contains: courseCodeMatch[1], mode: 'insensitive' as const } },
        { content: { contains: courseCodeMatch[1], mode: 'insensitive' as const } },
        { structuredData: { path: ['course_code'], string_contains: courseCodeMatch[1] } }
      );
    }
    
    return { OR: conditions };
  }

  /**
   * Calculate enhanced relevance score
   */
  private calculateEnhancedRelevance(
    query: string,
    searchTerms: string[],
    item: KnowledgeBaseItem
  ): number {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const contentLower = item.content.toLowerCase();
    const queryLower = query.toLowerCase();

    // Title matching (highest weight)
    if (titleLower === queryLower) {
      score += 1.0;
    } else if (titleLower.includes(queryLower)) {
      score += 0.7;
    } else {
      // Partial title matching
      const queryWords = queryLower.split(/\s+/);
      const titleWords = titleLower.split(/\s+/);
      const matchingWords = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw)));
      score += (matchingWords.length / queryWords.length) * 0.5;
    }

    // Search terms matching
    const uniqueTerms = Array.from(new Set(searchTerms.map(t => t.toLowerCase())));
    uniqueTerms.forEach(term => {
      if (titleLower.includes(term)) {
        score += 0.3 / uniqueTerms.length;
      }
      if (contentLower.includes(term)) {
        score += 0.2 / uniqueTerms.length;
      }
      if (item.tags.some(tag => tag.toLowerCase().includes(term))) {
        score += 0.25 / uniqueTerms.length;
      }
      if (item.category.toLowerCase().includes(term)) {
        score += 0.15 / uniqueTerms.length;
      }
    });

    // Structured data matching
    if (item.structuredData) {
      const structuredStr = JSON.stringify(item.structuredData).toLowerCase();
      if (structuredStr.includes(queryLower)) {
        score += 0.3;
      }
    }

    // Priority boost
    score += (item.priority / 100) * 0.2;

    // Recency boost (items updated recently)
    const daysSinceUpdate = (Date.now() - item.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 30) {
      score += 0.1;
    } else if (daysSinceUpdate < 90) {
      score += 0.05;
    }

    // Category-specific boosts
    const importantCategories = ['programs', 'courses', 'admissions', 'fees'];
    if (importantCategories.includes(item.category.toLowerCase())) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Prepare content snippet with keyword highlighting context
   */
  private prepareContentSnippet(
    content: string,
    query: string,
    searchTerms: string[]
  ): string {
    const maxLength = 500;
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
          const score = 0.5 + (term.length / 20); // Longer terms get higher score
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
      // Start at word boundary
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 50) {
        snippet = '...' + snippet.slice(firstSpace);
      } else {
        snippet = '...' + snippet;
      }
    }
    
    if (bestStart + maxLength < content.length) {
      // End at word boundary
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
    const metadata: Record<string, unknown> = {};
    
    if (item.structuredData) {
      const structured = item.structuredData as Record<string, unknown>;
      
      // Extract common fields
      if (structured.course_code) metadata.courseCode = structured.course_code;
      if (structured.program_type) metadata.programType = structured.program_type;
      if (structured.faculty) metadata.faculty = structured.faculty;
      if (structured.duration) metadata.duration = structured.duration;
      if (structured.campus) metadata.campus = structured.campus;
    }
    
    // Extract from content patterns
    const courseCodeMatch = item.content.match(/\b([A-Z]{2,4}\d{3,5})\b/);
    if (courseCodeMatch && !metadata.courseCode) {
      metadata.courseCode = courseCodeMatch[1];
    }
    
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Generate semantic variations of a query
   */
  private generateSemanticVariations(query: string): string[] {
    const variations = [query];
    const queryLower = query.toLowerCase();
    
    // Common RMIT variations
    const replacements = {
      'bachelor': ['undergraduate', 'bachelors', 'bsc', 'ba'],
      'master': ['postgraduate', 'masters', 'msc', 'ma'],
      'course': ['program', 'degree', 'subject'],
      'fee': ['cost', 'price', 'tuition'],
      'requirement': ['prerequisite', 'entry requirement', 'criteria'],
      'apply': ['application', 'enrol', 'enroll', 'admission']
    };
    
    for (const [original, alternatives] of Object.entries(replacements)) {
      if (queryLower.includes(original)) {
        alternatives.forEach(alt => {
          variations.push(query.replace(new RegExp(original, 'gi'), alt));
        });
      }
    }
    
    return Array.from(new Set(variations)).slice(0, 5);
  }

  /**
   * Rank knowledge results by relevance
   */
  private rankKnowledgeResults(
    results: KnowledgeBaseItem[],
    query: string
  ): KnowledgeBaseItem[] {
    const scored = results.map(item => ({
      item,
      score: this.calculateSimpleRelevance(query, item)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);
  }

  /**
   * Simple relevance calculation for basic searches
   */
  private calculateSimpleRelevance(query: string, item: KnowledgeBaseItem): number {
    const queryLower = query.toLowerCase();
    const titleLower = item.title.toLowerCase();
    const contentLower = item.content.toLowerCase();
    
    let score = 0;
    
    // Exact matches
    if (titleLower === queryLower) score += 2.0;
    else if (titleLower.includes(queryLower)) score += 1.0;
    
    if (contentLower.includes(queryLower)) score += 0.5;
    
    // Word matching
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    queryWords.forEach(word => {
      if (titleLower.includes(word)) score += 0.3;
      if (contentLower.includes(word)) score += 0.1;
      if (item.tags.some(tag => tag.toLowerCase().includes(word))) score += 0.2;
    });
    
    // Priority boost
    score += item.priority * 0.01;
    
    return score;
  }

  /**
   * Get categories from knowledge base
   */
  async getCategories(): Promise<string[]> {
    const categories = await db.knowledgeBase.findMany({
      distinct: ["category"],
      where: { isActive: true },
      select: { category: true },
      orderBy: { category: 'asc' }
    });

    return categories
      .map(x => x.category)
      .filter(Boolean)
      .filter(cat => cat.length > 0);
  }

  /**
   * Get knowledge item by ID
   */
  async getKnowledgeById(id: string): Promise<KnowledgeBaseItem | null> {
    return await db.knowledgeBase.findUnique({
      where: { id }
    });
  }

  /**
   * Create new knowledge item
   */
  async createKnowledgeItem(
    data: Omit<KnowledgeBaseItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<KnowledgeBaseItem> {
    const { structuredData, ...rest } = data;
    
    // Validate and clean tags
    const cleanedTags = rest.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0);
    
    return await db.knowledgeBase.create({
      data: {
        ...rest,
        tags: cleanedTags,
        ...(structuredData && { structuredData })
      }
    });
  }

  /**
   * Update knowledge item
   */
  async updateKnowledgeItem(
    id: string, 
    data: Partial<Omit<KnowledgeBaseItem, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<KnowledgeBaseItem> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    Object.keys(data).forEach(key => {
      if (key === 'tags' && data.tags) {
        // Clean tags
        updateData.tags = data.tags
          .map(tag => tag.trim().toLowerCase())
          .filter(tag => tag.length > 0);
      } else if (key !== 'structuredData' && data[key as keyof typeof data] !== undefined) {
        updateData[key] = data[key as keyof typeof data];
      }
    });
    
    if (data.structuredData !== undefined) {
      updateData.structuredData = data.structuredData;
    }
    
    return await db.knowledgeBase.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Delete knowledge item
   */
  async deleteKnowledgeItem(id: string): Promise<void> {
    await db.knowledgeBase.delete({
      where: { id }
    });
  }

  /**
   * Get structured knowledge for AI responses
   */
  async getStructuredKnowledgeForAI(
    query: string, 
    category?: string
  ): Promise<string> {
    // Enhanced search with better filtering
    const searchTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const results = await db.knowledgeBase.findMany({
      where: {
        AND: [
          {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { content: { contains: query, mode: "insensitive" as const } },
              ...searchTerms.map(term => ({
                OR: [
                  { title: { contains: term, mode: "insensitive" as const } },
                  { content: { contains: term, mode: "insensitive" as const } },
                  { tags: { has: term } }
                ]
              }))
            ]
          },
          category ? { category } : {},
          { isActive: true }
        ]
      },
      orderBy: [
        { priority: "desc" },
        { updatedAt: "desc" }
      ],
      take: 10
    });

    // Format results for AI consumption
    if (results.length === 0) {
      return "No specific RMIT knowledge found for this query.";
    }

    return results.map(r => {
      let formattedEntry = `## ${r.title}\n`;
      formattedEntry += `Category: ${r.category}\n`;
      
      // Add structured data if available
      if (r.structuredData) {
        const structured = r.structuredData as Record<string, unknown>;
        const structuredInfo = Object.entries(structured)
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
      formattedEntry += `\nDetails:\n${r.content}`;
      
      // Add source URL if available
      if (r.sourceUrl && r.sourceUrl !== '#') {
        formattedEntry += `\n\nSource: ${r.sourceUrl}`;
      }
      
      // Add tags for context
      if (r.tags.length > 0) {
        formattedEntry += `\nRelated Topics: ${r.tags.join(', ')}`;
      }
      
      return formattedEntry;
    }).join('\n\n---\n\n');
  }

  /**
   * Get related knowledge items
   */
  async getRelatedKnowledge(
    itemId: string, 
    limit: number = 5
  ): Promise<KnowledgeBaseItem[]> {
    const item = await this.getKnowledgeById(itemId);
    if (!item) return [];
    
    // Find items with similar tags or in the same category
    const related = await db.knowledgeBase.findMany({
      where: {
        AND: [
          { id: { not: itemId } },
          { isActive: true },
          {
            OR: [
              { category: item.category },
              { tags: { hasSome: item.tags } }
            ]
          }
        ]
      },
      orderBy: { priority: 'desc' },
      take: limit * 2
    });
    
    // Score by similarity
    const scored = related.map(r => ({
      item: r,
      score: this.calculateSimilarity(item, r)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.item);
  }

  /**
   * Calculate similarity between two knowledge items
   */
  private calculateSimilarity(item1: KnowledgeBaseItem, item2: KnowledgeBaseItem): number {
    let score = 0;
    
    // Same category
    if (item1.category === item2.category) score += 0.3;
    
    // Overlapping tags
    const commonTags = item1.tags.filter(t => item2.tags.includes(t));
    score += (commonTags.length / Math.max(item1.tags.length, item2.tags.length)) * 0.5;
    
    // Title similarity
    const title1Words = new Set(item1.title.toLowerCase().split(/\s+/));
    const title2Words = new Set(item2.title.toLowerCase().split(/\s+/));
    const commonWords = Array.from(title1Words).filter(w => title2Words.has(w));
    score += (commonWords.length / Math.max(title1Words.size, title2Words.size)) * 0.2;
    
    return score;
  }
}