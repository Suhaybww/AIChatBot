import { db } from "@/server/db/db";
import { Role } from "@prisma/client";
import type { SearchResponse } from "./search.service";
import { promptService } from "./prompt.service";
import { KnowledgeBaseService } from "./knowledgeBase.service";
import type { ConversationContext as QueryContext } from "./queryClassifier";

export interface ConversationContext {
  recentMessages: Array<{
    id: string;
    content: string;
    role: Role;
    createdAt: Date;
  }>;
  sessionSummary?: string;
  relevantKnowledge: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    relevanceScore: number;
  }>;
  sessionTopics: string[];
  sessionEntities: {
    courses: string[];
    programs: string[];
    policies: string[];
    locations: string[];
    dates: string[];
  };
  contextWindow: {
    tokenCount: number;
    messageCount: number;
  };
  searchHistory?: Array<{
    query: string;
    resultCount: number;
    topResult?: string;
  }>;
}

export interface ContextualMessage {
  userMessage: string;
  context: ConversationContext;
  enhancedPrompt: string;
}

export class ContextService {
  private readonly MAX_CONTEXT_MESSAGES = 20;
  private readonly RELEVANCE_THRESHOLD = 0.3;
  private readonly MAX_KNOWLEDGE_ITEMS = 5;

  async buildContext(
    sessionId: string,
    currentMessage: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: string
  ): Promise<ConversationContext> {
    // Get recent messages from the session
    const recentMessages = await this.getRecentMessages(sessionId);
    
    // Combine all messages for analysis
    const allSessionMessages = [
      ...recentMessages.map(m => m.content),
      currentMessage
    ];
    
    // Extract topics and entities from conversation
    const sessionTopics = this.extractTopics(allSessionMessages);
    const sessionEntities = this.extractEntities(allSessionMessages);
    const searchHistory = this.extractSearchHistory(recentMessages);

    // Get relevant knowledge based on current message and conversation topics
    const relevantKnowledge = await this.getRelevantKnowledge(
      currentMessage,
      sessionTopics,
      sessionEntities
    );

    // Calculate context window size
    const contextWindow = this.calculateContextWindow(recentMessages, relevantKnowledge);
    
    // Generate session summary if conversation is long
    const sessionSummary = this.generateSessionSummary(
      recentMessages, 
      sessionTopics, 
      sessionEntities
    );

    return {
      recentMessages,
      sessionSummary,
      relevantKnowledge,
      sessionTopics,
      sessionEntities,
      contextWindow,
      searchHistory
    };
  }

  /**
   * Create contextual prompt with search results
   */
  createContextualPrompt(
    userMessage: string,
    context: ConversationContext,
    searchResults?: SearchResponse | null
  ): string {
    return promptService.createPrompt(userMessage, {
      includeDate: true,
      includeContext: true,
      includeSearchResults: true
    }, context, searchResults);
  }

  /**
   * Convert conversation context to query context for knowledge base search
   */
  createQueryContext(context: ConversationContext): QueryContext {
    const queryContext = {
      lastCourseCode: context.sessionEntities.courses[0],
      lastProgramCode: context.sessionEntities.programs
        .find(p => /^(BP|MC|BH)\d{3,4}$/.test(p)), // Find program codes
      recentEntities: {
        courses: context.sessionEntities.courses.slice(0, 3),
        programs: context.sessionEntities.programs
          .filter(p => /^(BP|MC|BH)\d{3,4}$/.test(p))
          .slice(0, 3),
        schools: [] // Extract from locations if needed
      }
    };
    
    console.log(`🧠 Created query context:`, queryContext);
    return queryContext;
  }

  private async getRecentMessages(sessionId: string) {
    return await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: this.MAX_CONTEXT_MESSAGES,
      select: {
        id: true,
        content: true,
        role: true,
        createdAt: true
      }
    }).then(messages => messages.reverse());
  }

  private extractTopics(messages: string[]): string[] {
    const allText = messages.join(' ').toLowerCase();
    const topics = new Set<string>();

    // Enhanced topic patterns for RMIT context
    const topicPatterns = {
      courses: [
        'course', 'program', 'degree', 'bachelor', 'master', 'diploma',
        'certificate', 'undergraduate', 'postgraduate', 'study', 'major',
        'specialization', 'elective'
      ],
      enrollment: [
        'enrol', 'enrollment', 'apply', 'application', 'admission',
        'entry', 'requirements', 'prerequisite', 'atar', 'gpa',
        'selection', 'offer', 'acceptance'
      ],
      fees: [
        'fee', 'fees', 'cost', 'payment', 'scholarship', 'financial',
        'tuition', 'hecs', 'help', 'loan', 'pricing'
      ],
      dates: [
        'date', 'deadline', 'when', 'today', 'current', 'now',
        'semester', 'trimester', 'intake', 'start', 'commence'
      ],
      links: [
        'link', 'url', 'website', 'page', 'site', 'portal',
        'online', 'resource'
      ],
      academic: [
        'assessment', 'exam', 'assignment', 'grade', 'results',
        'credit', 'points', 'gpa', 'wam', 'transcript'
      ],
      support: [
        'help', 'support', 'service', 'assist', 'guidance',
        'advice', 'counseling', 'wellbeing'
      ],
      campus: [
        'campus', 'location', 'building', 'facility', 'library',
        'melbourne', 'brunswick', 'bundoora', 'city'
      ]
    };

    // Check each topic category
    for (const [category, keywords] of Object.entries(topicPatterns)) {
      const matchCount = keywords.filter(keyword => allText.includes(keyword)).length;
      if (matchCount >= 2 || (matchCount === 1 && messages.length <= 3)) {
        topics.add(category);
      }
    }

    // Add specific topic detection
    if (/\b[a-z]{2,4}\d{3,5}\b/i.test(allText)) {
      topics.add('courses');
    }

    return Array.from(topics);
  }

  private extractEntities(messages: string[]): ConversationContext['sessionEntities'] {
    const allText = messages.join(' ');
    
    // Course codes (e.g., COSC2123, BP094)
    const courseCodePattern = /\b([A-Z]{2,4}\d{3,5})\b/g;
    const courseMatches = allText.match(courseCodePattern) || [];
    const courses = Array.from(new Set(courseMatches.map(c => c.toUpperCase())));

    // Program names
    const programPattern = /\b(bachelor of \w+|master of \w+|diploma of \w+|certificate \w+ in \w+)/gi;
    const programMatches = allText.match(programPattern) || [];
    const programs = Array.from(new Set(programMatches.map(p => 
      p.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ')
    )));

    // Policies
    const policyPattern = /\b(academic integrity|assessment policy|enrollment policy|refund policy|student conduct|special consideration|credit transfer|advanced standing)\b/gi;
    const policyMatches = allText.match(policyPattern) || [];
    const policies = Array.from(new Set(policyMatches.map(p => p.toLowerCase())));

    // Locations
    const locationPattern = /\b(melbourne|brunswick|bundoora|city campus|brunswick campus|bundoora campus|building \d+|level \d+|room \d+)\b/gi;
    const locationMatches = allText.match(locationPattern) || [];
    const locations = Array.from(new Set(locationMatches.map(l => 
      l.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ')
    )));

    // Dates
    const datePatterns = [
      /\b(semester \d|trimester \d)/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b(20\d{2})\b/g
    ];
    
    const dates: string[] = [];
    datePatterns.forEach(pattern => {
      const matches = allText.match(pattern) || [];
      dates.push(...matches);
    });

    return {
      courses: courses.slice(0, 10),
      programs: programs.slice(0, 10),
      policies: policies.slice(0, 10),
      locations: locations.slice(0, 10),
      dates: Array.from(new Set(dates)).slice(0, 10)
    };
  }

  private extractSearchHistory(messages: Array<{ content: string; role: Role }>): ConversationContext['searchHistory'] {
    const searchHistory: ConversationContext['searchHistory'] = [];
    
    // Look for patterns that indicate search was performed
    messages.forEach((msg, index) => {
      if (msg.role === Role.USER) {
        const content = msg.content.toLowerCase();
        const searchIndicators = ['find', 'search', 'link', 'url', 'where', 'show me'];
        
        if (searchIndicators.some(indicator => content.includes(indicator))) {
          // Check if next message contains URLs (indicating search was performed)
          if (index + 1 < messages.length && messages[index + 1].role === Role.ASSISTANT) {
            const assistantResponse = messages[index + 1].content;
            const urlCount = (assistantResponse.match(/https?:\/\/[^\s]+/g) || []).length;
            
            if (urlCount > 0) {
              searchHistory.push({
                query: msg.content.slice(0, 100),
                resultCount: urlCount,
                topResult: assistantResponse.match(/https?:\/\/[^\s]+/)?.[0]
              });
            }
          }
        }
      }
    });
    
    return searchHistory.slice(-5); // Keep last 5 searches
  }

  private async getRelevantKnowledge(
    query: string,
    conversationTopics: string[],
    sessionEntities: ConversationContext['sessionEntities']
  ) {
    // Build search terms from query and context
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const topicWords = conversationTopics.flatMap(topic => topic.split(/\s+/));
    const entityWords = [
      ...sessionEntities.courses,
      ...sessionEntities.programs.flatMap(p => p.split(/\s+/))
    ];
    
    const searchTerms = Array.from(new Set([
      ...queryWords,
      ...topicWords,
      ...entityWords
    ])).filter(term => term.length > 2);

    // Create query context for contextual search
    const queryContext: QueryContext = {
      lastCourseCode: sessionEntities.courses[0],
      lastProgramCode: sessionEntities.programs
        .find(p => /^(BP|MC|BH)\d{3,4}$/.test(p)),
      recentEntities: {
        courses: sessionEntities.courses.slice(0, 3),
        programs: sessionEntities.programs
          .filter(p => /^(BP|MC|BH)\d{3,4}$/.test(p))
          .slice(0, 3),
        schools: []
      }
    };

    // Search knowledge base with enhanced terms using new multi-table approach
    const knowledgeService = new KnowledgeBaseService();
    const knowledgeItems = await knowledgeService.searchKnowledge(query, {
      searchMode: 'semantic',
      limit: 20
    }, queryContext);

    // Score and rank knowledge items
    return knowledgeItems
      .map(item => {
        const relevanceScore = this.calculateRelevanceScore(
          query,
          item.content,
          item.title,
          item.tags,
          searchTerms
        );
        return {
          ...item,
          relevanceScore
        };
      })
      .filter(item => item.relevanceScore >= this.RELEVANCE_THRESHOLD)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.MAX_KNOWLEDGE_ITEMS);
  }

  private calculateRelevanceScore(
    query: string,
    content: string,
    title: string,
    tags: string[],
    searchTerms: string[]
  ): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    let score = 0;

    // Exact query match in title (highest weight)
    if (titleLower === queryLower) {
      score += 0.9;
    } else if (titleLower.includes(queryLower)) {
      score += 0.5;
    }

    // Query words in title
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const titleWords = titleLower.split(/\s+/);
    const matchingTitleWords = queryWords.filter(word => titleWords.includes(word));
    score += (matchingTitleWords.length / queryWords.length) * 0.3;

    // Search terms matching
    searchTerms.forEach(term => {
      const termLower = term.toLowerCase();
      if (titleLower.includes(termLower)) {
        score += 0.2 / searchTerms.length;
      }
      if (contentLower.includes(termLower)) {
        score += 0.1 / searchTerms.length;
      }
      if (tags.some(tag => tag.toLowerCase() === termLower)) {
        score += 0.15 / searchTerms.length;
      }
    });

    // Boost for course codes
    const courseCodePattern = /\b[A-Z]{2,4}\d{3,5}\b/;
    if (courseCodePattern.test(query) && courseCodePattern.test(title)) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  private calculateContextWindow(
    messages: Array<{ content: string }>,
    knowledge: Array<{ content: string }>
  ) {
    // Rough token estimation (1 token ≈ 4 characters)
    const messageTokens = messages.reduce((sum, msg) => 
      sum + Math.ceil(msg.content.length / 4), 0
    );
    const knowledgeTokens = knowledge.reduce((sum, item) => 
      sum + Math.ceil(item.content.length / 4), 0
    );
    
    return {
      tokenCount: messageTokens + knowledgeTokens,
      messageCount: messages.length
    };
  }

  private generateSessionSummary(
    messages: Array<{ content: string; role: Role }>,
    topics: string[],
    entities: ConversationContext['sessionEntities']
  ): string | undefined {
    // Only summarize if conversation is substantial
    if (messages.length < 6) {
      return undefined;
    }

    const userMessages = messages.filter(m => m.role === Role.USER);
    const assistantMessages = messages.filter(m => m.role === Role.ASSISTANT);
    
    // Build summary parts
    const summaryParts: string[] = [];
    
    // Main topics
    if (topics.length > 0) {
      summaryParts.push(`Topics: ${topics.slice(0, 5).join(', ')}`);
    }
    
    // Mentioned courses/programs
    if (entities.courses.length > 0 || entities.programs.length > 0) {
      const items = [...entities.courses, ...entities.programs].slice(0, 3);
      summaryParts.push(`Discussing: ${items.join(', ')}`);
    }
    
    // Key questions
    const keyQuestions = userMessages
      .filter(m => m.content.includes('?'))
      .map(m => {
        const firstQuestion = m.content.split('?')[0] + '?';
        return firstQuestion.length < 100 ? firstQuestion : firstQuestion.slice(0, 97) + '...?';
      })
      .slice(-2);
    
    if (keyQuestions.length > 0) {
      summaryParts.push(`Recent questions: ${keyQuestions[0]}`);
    }
    
    // Links provided
    const linksProvided = assistantMessages.some(m => m.content.includes('rmit.edu.au'));
    if (linksProvided) {
      summaryParts.push('RMIT links provided');
    }
    
    return summaryParts.join('. ');
  }

  async cleanupOldContext(userId: string, daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Delete old sessions and their messages
    const oldSessions = await db.chatSession.findMany({
      where: {
        userId,
        updatedAt: {
          lt: cutoffDate
        }
      },
      select: {
        id: true
      }
    });

    if (oldSessions.length > 0) {
      // Delete messages first (foreign key constraint)
      await db.message.deleteMany({
        where: {
          sessionId: {
            in: oldSessions.map(s => s.id)
          }
        }
      });

      // Then delete sessions
      await db.chatSession.deleteMany({
        where: {
          id: {
            in: oldSessions.map(s => s.id)
          }
        }
      });

      console.log(`✅ Cleaned up ${oldSessions.length} old sessions for user ${userId}`);
    }
  }

  /**
   * Analyze if context suggests user needs specific information
   */
  analyzeInformationNeed(context: ConversationContext): {
    needsCurrentInfo: boolean;
    suggestedSearchTerms: string[];
  } {
    const lastUserMessage = context.recentMessages
      .filter(m => m.role === Role.USER)
      .pop();
    
    if (!lastUserMessage) {
      return { needsCurrentInfo: false, suggestedSearchTerms: [] };
    }

    const indicators = [
      'current', 'latest', 'now', 'today', '2024', '2025',
      'deadline', 'date', 'when',
      'cost', 'fee', 'price',
      'requirement', 'need', 'prerequisite'
    ];

    const needsCurrentInfo = indicators.some(indicator => 
      lastUserMessage.content.toLowerCase().includes(indicator)
    );

    // Build suggested search terms from entities and recent topics
    const suggestedSearchTerms = [
      ...context.sessionEntities.courses,
      ...context.sessionEntities.programs.map(p => p.toLowerCase()),
      ...context.sessionTopics
    ].filter((term, index, self) => self.indexOf(term) === index);

    return {
      needsCurrentInfo,
      suggestedSearchTerms: suggestedSearchTerms.slice(0, 5)
    };
  }
}