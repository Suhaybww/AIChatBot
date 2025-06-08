import { db } from "@/server/db";
import { Role } from "@prisma/client";
import type { SearchResponse } from "./search";

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
    policies: string[];
    locations: string[];
  };
  contextWindow: {
    tokenCount: number;
    messageCount: number;
  };
}

export interface ContextualMessage {
  userMessage: string;
  context: ConversationContext;
  enhancedPrompt: string;
}

export class ContextManager {
  private readonly MAX_CONTEXT_MESSAGES = 20;
  private readonly MAX_CONTEXT_TOKENS = 8000;
  private readonly RELEVANCE_THRESHOLD = 0.3;

  /**
   * Build context for current conversation session only
   */
  async buildContext(
    sessionId: string,
    currentMessage: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    userId: string
  ): Promise<ConversationContext> {
    // Get recent conversation history from current session only
    const recentMessages = await this.getRecentMessages(sessionId);
    
    // Extract topics and entities from current session conversation
    const allSessionMessages = [
      ...recentMessages.map(m => m.content),
      currentMessage
    ];
    
    const sessionTopics = this.extractTopics(allSessionMessages);
    const sessionEntities = this.extractEntities(allSessionMessages);

    // Get relevant knowledge based on current session context
    const relevantKnowledge = await this.getRelevantKnowledge(
      currentMessage,
      sessionTopics
    );

    // Calculate context window size
    const contextWindow = this.calculateContextWindow(recentMessages, relevantKnowledge);

    // Generate session summary if conversation is long
    const sessionSummary = this.generateCurrentSessionSummary(recentMessages);

    return {
      recentMessages,
      sessionSummary,
      relevantKnowledge,
      sessionTopics,
      sessionEntities,
      contextWindow
    };
  }

  /**
   * Create enhanced prompt with current session context and optional search results
   */
  createContextualPrompt(
    userMessage: string,
    context: ConversationContext,
    searchResults?: SearchResponse | null
  ): string {
    // Get current date dynamically
    const currentDate = new Date();
    const dateString = currentDate.toLocaleDateString('en-AU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let prompt = `You are Vega, RMIT University's AI assistant. You help students with RMIT-related questions.

CURRENT DATE: ${dateString}

🚨 CRITICAL INSTRUCTIONS - FOLLOW EXACTLY:
1. NEVER CREATE OR GUESS URLs - Only use URLs from search results provided below
2. If asked for a specific URL and you find related results, say "I found these related pages" and list the actual URLs from search results
3. If no relevant URLs in search results, say "You can find this information on the RMIT website" - DO NOT make up specific URLs
4. When asked about dates/time, use: ${dateString}
5. Be direct and concise - no unnecessary filler
6. If you don't have specific info, say so clearly rather than guessing

CONVERSATION CONTEXT:`;

    // Add session summary if available
    if (context.sessionSummary) {
      prompt += `\n\nSUMMARY: ${context.sessionSummary}`;
    }

    // Add recent conversation history
    if (context.recentMessages.length > 0) {
      prompt += `\n\nRECENT MESSAGES:`;
      const recentMessagesToInclude = context.recentMessages
        .slice(-Math.min(10, context.recentMessages.length))
        .map(msg => `${msg.role === Role.USER ? 'Student' : 'Vega'}: ${msg.content}`)
        .join('\n');
      prompt += `\n${recentMessagesToInclude}`;
    }

    // Add search results if available
    if (searchResults && searchResults.results.length > 0) {
      prompt += `\n\n🔗 CURRENT SEARCH RESULTS - USE THESE EXACT URLs ONLY:`;
      searchResults.results.slice(0, 5).forEach((result, index) => {
        prompt += `\n\n[${index + 1}] ${result.title}
📍 URL: ${result.url}
📄 Content: ${result.content.slice(0, 300)}${result.content.length > 300 ? '...' : ''}`;
      });
      prompt += `\n\n⚠️ CRITICAL INSTRUCTIONS:
- If the user asks for a URL and you see matching results above, PROVIDE THE EXACT URL from the search results
- Example: If asked for "Computer Science URL" and you see a Computer Science result above, give that URL directly
- DO NOT say "I couldn't find" if there are relevant results above - USE them!
- NEVER create or guess URLs not in the search results
- If no relevant match in search results, then say "You can find this on the RMIT website"`;
    }

    // Add relevant knowledge
    if (context.relevantKnowledge.length > 0) {
      prompt += `\n\nRELEVANT KNOWLEDGE:`;
      context.relevantKnowledge.slice(0, 3).forEach((item, index) => {
        prompt += `\n${index + 1}. ${item.title}: ${item.content.slice(0, 300)}...`;
      });
    }

    // Add current message
    prompt += `\n\nSTUDENT MESSAGE: ${userMessage}

🎯 RESPONSE RULES - MANDATORY:
- WHEN USER ASKS FOR A URL: Look at search results above first - if there's a matching result, PROVIDE THAT URL
- NEVER say "I couldn't find the URL" if there are relevant search results above
- For ANY program (Computer Science, Engineering, Business, etc.), use the URLs from search results
- NEVER invent URLs like "/bachelor-of-computer-science-bp320" - these don't exist
- If no relevant search results, then say "You can find this on the RMIT website"
- If asked about today's date, say: "${dateString}"
- Be direct and helpful, no pleasantries
- If you don't know specifics (ATAR requirements, exact deadlines), say so clearly

Your response:`;

    return prompt;
  }

  /**
   * Get recent messages from a session
   */
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

  /**
   * Extract topics from current session conversation
   */
  private extractTopics(messages: string[]): string[] {
    const allText = messages.join(' ').toLowerCase();
    const topics = new Set<string>();

    // RMIT-specific keywords and topics
    const topicPatterns = {
      courses: [
        'course', 'program', 'degree', 'bachelor', 'master', 'diploma',
        'certificate', 'undergraduate', 'postgraduate', 'study'
      ],
      enrollment: [
        'enrol', 'enrollment', 'apply', 'application', 'admission',
        'entry', 'requirements', 'prerequisite', 'atar'
      ],
      fees: [
        'fee', 'fees', 'cost', 'payment', 'scholarship', 'financial',
        'tuition', 'hecs'
      ],
      dates: [
        'date', 'deadline', 'when', 'today', 'current', 'now'
      ],
      links: [
        'link', 'url', 'website', 'page', 'site'
      ]
    };

    // Extract topics based on patterns
    for (const [category, keywords] of Object.entries(topicPatterns)) {
      if (keywords.some(keyword => allText.includes(keyword))) {
        topics.add(category);
      }
    }

    return Array.from(topics);
  }

  /**
   * Extract specific entities from current session conversation
   */
  private extractEntities(messages: string[]): {
    courses: string[];
    policies: string[];
    locations: string[];
  } {
    const allText = messages.join(' ');
    
    // Extract course codes (e.g., COSC1234, BP094)
    const courseCodePattern = /\b([A-Z]{2,4}\d{3,5})\b/g;
    const courseMatches = allText.match(courseCodePattern) || [];
    const courses = Array.from(new Set(courseMatches));

    // Extract policy-related terms
    const policyPattern = /\b(academic integrity|assessment policy|enrollment policy|refund policy|student conduct)\b/gi;
    const policyMatches = allText.match(policyPattern) || [];
    const policies = Array.from(new Set(policyMatches));

    // Extract RMIT locations
    const locationPattern = /\b(melbourne|brunswick|bundoora|city campus|brunswick campus|bundoora campus)\b/gi;
    const locationMatches = allText.match(locationPattern) || [];
    const locations = Array.from(new Set(locationMatches));

    return {
      courses,
      policies,
      locations
    };
  }

  /**
   * Get relevant knowledge from the knowledge base
   */
  private async getRelevantKnowledge(
    query: string,
    conversationTopics: string[]
  ) {
    // Simple keyword-based relevance
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const topicWords = conversationTopics.join(' ').toLowerCase().split(/\s+/);
    const searchTerms = Array.from(new Set([...queryWords, ...topicWords]));

    const knowledgeItems = await db.knowledgeBase.findMany({
      where: {
        isActive: true,
        OR: searchTerms.map(term => ({
          OR: [
            { content: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { tags: { has: term } }
          ]
        }))
      },
      orderBy: { priority: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        tags: true
      }
    });

    // Calculate relevance scores
    return knowledgeItems
      .map(item => {
        const relevanceScore = this.calculateRelevanceScore(
          query,
          item.content,
          item.title,
          item.tags
        );
        return {
          ...item,
          relevanceScore
        };
      })
      .filter(item => item.relevanceScore >= this.RELEVANCE_THRESHOLD)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Calculate relevance score for knowledge base items
   */
  private calculateRelevanceScore(
    query: string,
    content: string,
    title: string,
    tags: string[]
  ): number {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    let score = 0;

    queryWords.forEach(word => {
      // Title matches are more important
      if (title.toLowerCase().includes(word)) {
        score += 0.3;
      }
      // Content matches
      if (content.toLowerCase().includes(word)) {
        score += 0.2;
      }
      // Tag matches
      if (tags.some(tag => tag.toLowerCase().includes(word))) {
        score += 0.25;
      }
    });

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Calculate context window size
   */
  private calculateContextWindow(
    messages: Array<{ content: string }>,
    knowledge: Array<{ content: string }>
  ) {
    // Rough token estimation (1 token ≈ 4 characters)
    const messageTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
    const knowledgeTokens = knowledge.reduce((sum, item) => sum + Math.ceil(item.content.length / 4), 0);
    
    return {
      tokenCount: messageTokens + knowledgeTokens,
      messageCount: messages.length
    };
  }

  /**
   * Generate current session summary for long conversations
   */
  private generateCurrentSessionSummary(
    messages: Array<{ content: string; role: Role }>
  ): string | undefined {
    if (messages.length < 8) {
      return undefined; // No summary needed for short conversations
    }

    // Extract key topics from current session
    const topics = this.extractTopics(messages.map(m => m.content));
    const entities = this.extractEntities(messages.map(m => m.content));
    
    const userQuestions = messages
      .filter(m => m.role === Role.USER)
      .map(m => m.content.slice(0, 100))
      .slice(0, 3);

    let summary = `Topics: ${topics.join(', ')}.`;
    
    if (entities.courses.length > 0) {
      summary += ` Courses: ${entities.courses.join(', ')}.`;
    }
    
    if (userQuestions.length > 0) {
      summary += ` Key questions: ${userQuestions[0]}`;
    }
    
    return summary;
  }

  /**
   * Clean old context data to maintain performance
   */
  async cleanupOldContext(userId: string, daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Delete old sessions and their messages
    await db.chatSession.deleteMany({
      where: {
        userId,
        updatedAt: {
          lt: cutoffDate
        }
      }
    });
  }
}

// Export singleton instance
export const contextManager = new ContextManager();