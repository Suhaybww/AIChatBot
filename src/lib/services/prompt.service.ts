import type { SearchResponse } from "./search.service";
import type { ConversationContext } from "./context.service";

export interface PromptOptions {
  includeDate?: boolean;
  includeContext?: boolean;
  includeSearchResults?: boolean;
  includeKnowledgeBase?: boolean;
  isKnowledgeOnlyMode?: boolean;
}

export class PromptService {
  private readonly CURRENT_DATE = new Date().toLocaleDateString('en-AU', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  private readonly CORE_SYSTEM_PROMPT = `You are Vega, RMIT University's AI assistant. You help students, staff, and prospective students with all RMIT-related questions.

CORE IDENTITY:
- You are a knowledgeable, helpful RMIT assistant
- You have access to RMIT's knowledge base and can search for current information
- You provide accurate, specific information about courses, programs, policies, and services
- You maintain a professional yet friendly tone

RESPONSE PRINCIPLES:
1. Be direct and helpful - get straight to the answer
2. Use search results when available to provide accurate, current information
3. If you don't have specific information, acknowledge this and suggest where to find it
4. For time-sensitive information (dates, deadlines, requirements), rely on search results
5. Include relevant links from search results when they directly answer the user's question`;

  private readonly SEARCH_RESULT_INSTRUCTIONS = `
USING SEARCH RESULTS:
When search results are provided, use them to give accurate, current information:

1. **For Direct URL Requests**: If the user asks for a link/URL to a specific program or service:
   - Check if any search results match what they're looking for
   - Provide the exact URL from the matching search result
   - Format: "Here's the link to [program/service]: [URL]"

2. **For Information Queries**: Use search results to provide specific details:
   - Course codes, prerequisites, duration, campuses
   - Entry requirements, fees, important dates
   - Application processes and deadlines

3. **When No Relevant Results**: If search results don't contain what the user needs:
   - Acknowledge what you searched for
   - Suggest visiting rmit.edu.au or contacting RMIT directly
   - Provide general RMIT contact information if appropriate

4. **URL Formatting Rules**:
   - For RMIT course URLs (those starting with "https://www1.rmit.edu.au/browse/"), display the raw URL on its own line without markdown formatting
   - For other URLs (like program pages), use proper markdown links: [Program Name](URL)
   - ALWAYS use the complete, full URL exactly as provided in the search results
   - NEVER truncate, modify, or shorten URLs - copy them exactly
   - Example for course URLs: After describing COSC1111, include the full URL on a new line like this:
     https://www1.rmit.edu.au/browse/;CURPOS=1?STYPE=ENTIRE&CLOCATION=Study+at+RMIT/&QRY=+type%3Dflexible++subtype%3Dheparta++keywords%3D(COSC1111)&course=COSC1111&title=&Search=Search
   - NEVER reference "Result 1", "Result 2" etc. Just use the content directly
   - When mentioning information from search results, integrate it naturally without result numbers`;

  private readonly KNOWLEDGE_RESPONSE_GUIDELINES = `RESPONSE FORMAT FOR KNOWLEDGE BASE QUERIES:
- Start directly with the answer - no introductions
- Provide all relevant details from the knowledge base
- Structure information clearly with bullet points or paragraphs
- Include specific details: codes, requirements, dates, locations
- End with next steps or additional resources if relevant
- Keep responses concise but comprehensive`;

  /**
   * Generate a complete prompt for AI responses
   */
  createPrompt(
    userMessage: string,
    options: PromptOptions = {},
    context?: ConversationContext,
    searchResults?: SearchResponse | null,
    knowledgeContent?: string
  ): string {
    let prompt = this.CORE_SYSTEM_PROMPT;

    // Add current date if requested
    if (options.includeDate !== false) {
      prompt += `\n\nCurrent Date: ${this.CURRENT_DATE}`;
      prompt += `\nAcademic Year: ${this.getCurrentAcademicYear()}`;
    }

    // Add conversation context
    if (options.includeContext && context) {
      prompt += this.buildContextSection(context);
    }

    // Add search results with clear instructions
    if (options.includeSearchResults && searchResults?.results.length) {
      prompt += this.buildSearchResultsSection(searchResults);
      
      // Add explicit URL reference section for courses
      const courseResults = searchResults.results.filter(r => r.title.includes('COSC') || r.title.includes('GRAP') || r.title.includes('ACCT'));
      if (courseResults.length > 0) {
        prompt += `\n\n--- CRITICAL: INCLUDE THESE EXACT URLS ---`;
        courseResults.forEach(result => {
          const courseCode = result.title.match(/([A-Z]{3,4}\d{4})/)?.[1];
          if (courseCode) {
            prompt += `\n\nWhen mentioning ${courseCode}, include this COMPLETE URL on its own line:`;
            prompt += `\n${result.url}`;
            prompt += `\n\nDO NOT MODIFY THE URL - COPY IT EXACTLY AS SHOWN ABOVE`;
          }
        });
        prompt += `\n\n--- END CRITICAL URL SECTION ---`;
      }
      
      prompt += this.SEARCH_RESULT_INSTRUCTIONS;
    }

    // Add knowledge base content for knowledge-only responses
    // if (options.includeKnowledgeBase && knowledgeContent) {
    //   prompt += `\n\nRMIT KNOWLEDGE BASE CONTENT:\n${knowledgeContent}`;
    //   prompt += `\n\n${this.KNOWLEDGE_RESPONSE_GUIDELINES}`;
    // }

    if (options.includeKnowledgeBase && knowledgeContent) {
      prompt += `\n\nRMIT KNOWLEDGE BASE CONTENT:\n`;

      try {
        const items = JSON.parse(knowledgeContent);
        if (Array.isArray(items)) {
          items.forEach(item => {
            prompt += `\n\n${this.formatSingleItemForAI(item)}\n`;
          });
        } else {
          prompt += `${this.formatSingleItemForAI(items)}\n`;
        }
      } catch {
        prompt += `${knowledgeContent}\n`;
      } 

      prompt += `\n\n${this.KNOWLEDGE_RESPONSE_GUIDELINES}`;
    }


    // Add user message
    prompt += `\n\n--- USER QUESTION ---\n${userMessage}\n\n--- YOUR RESPONSE ---`;

    // Add response format based on mode
    if (options.isKnowledgeOnlyMode) {
      prompt += `\nProvide a direct, comprehensive answer based on the knowledge base content above.`;
    } else if (searchResults?.results.length) {
      prompt += `\nUse the search results above to provide an accurate, helpful response. Include specific URLs when relevant. CRITICAL: When creating markdown links, copy the complete URL exactly from the "URL:" field in the search results - do not truncate or modify it. If there is an "EXACT URLS TO USE" section above, use those URLs word-for-word.`;
    } else {
      prompt += `\nProvide a helpful response based on your knowledge of RMIT. Be specific where possible, and suggest resources for more information.`;
    }

    return prompt;
  }

  /**
   * Create a simple prompt for basic interactions
   */
  createSimplePrompt(userMessage: string, searchResults?: SearchResponse | null): string {
    let prompt = this.CORE_SYSTEM_PROMPT;
    prompt += `\n\nCurrent Date: ${this.CURRENT_DATE}`;
    
    if (searchResults?.results.length) {
      prompt += this.buildSearchResultsSection(searchResults);
      prompt += this.SEARCH_RESULT_INSTRUCTIONS;
    }

    prompt += `\n\n--- USER QUESTION ---\n${userMessage}`;
    prompt += `\n\n--- YOUR RESPONSE ---\n`;
    
    if (searchResults?.results.length) {
      prompt += `Use the search results to provide accurate information. Include URLs when relevant.`;
    } else {
      prompt += `Provide a helpful, informative response about RMIT.`;
    }

    return prompt;
  }

  private getCurrentAcademicYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    // Academic year typically starts in March at RMIT
    return now.getMonth() >= 2 ? `${year}` : `${year - 1}/${year}`;
  }

  private buildContextSection(context: ConversationContext): string {
    let section = `\n\n--- CONVERSATION CONTEXT ---`;

    if (context.sessionSummary) {
      section += `\nConversation Summary: ${context.sessionSummary}`;
    }

    if (context.recentMessages.length > 0) {
      section += `\n\nRecent Exchange:`;
      const recentMessages = context.recentMessages
        .slice(-6) // Last 3 exchanges
        .map(msg => `${msg.role === 'USER' ? 'User' : 'Vega'}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`)
        .join('\n');
      section += `\n${recentMessages}`;
    }

    if (context.sessionTopics.length > 0) {
      section += `\n\nTopics Discussed: ${context.sessionTopics.join(', ')}`;
    }

    if (context.sessionEntities.courses.length > 0) {
      section += `\nCourses Mentioned: ${context.sessionEntities.courses.join(', ')}`;
    }

    return section;
  }

  private buildSearchResultsSection(searchResults: SearchResponse): string {
    let section = `\n\n--- SEARCH RESULTS ---`;
    section += `\nFound ${searchResults.totalResults} results (showing top ${searchResults.results.length}):`;
    
    searchResults.results.forEach((result) => {
      section += `\n\n${result.title}`;
      section += `\nURL: ${result.url}`;
      
      // Debug logging for URL issues
      if (result.title.includes('COSC1111')) {
        console.log('DEBUG - COSC1111 URL in prompt:', result.url);
        console.log('DEBUG - URL length:', result.url.length);
      }
      
      section += `\nSource: ${this.getSourceLabel(result.source)}`;
      
      // Clean and truncate content
      const cleanContent = result.content
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      
      section += `\nContent: ${cleanContent}${result.content.length > 300 ? '...' : ''}`;
      
      // Add relevance indicator for transparency
      if (result.relevanceScore > 0.8) {
        section += ` [Highly Relevant]`;
      } else if (result.relevanceScore > 0.5) {
        section += ` [Relevant]`;
      }
    });

    section += `\n\n--- END SEARCH RESULTS ---`;
    return section;
  }

  private getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      'rmit_official': 'RMIT Official Website',
      'knowledge_base': 'RMIT Knowledge Base',
      'web': 'Web Search'
    };
    return labels[source] || source;
  }

  private formatSingleItemForAI(item: { title: string; structuredData?: Record<string, any> }): string {
    return `
    **Course Code:** ${item.structuredData?.code ?? 'N/A'}
    **Title:** ${item.title}
    **Level:** ${item.structuredData?.level ?? 'N/A'}
    **Credit Points:** ${item.structuredData?.creditPoints ?? 'N/A'}
    **Delivery Mode:** ${item.structuredData?.deliveryMode?.join(', ') ?? 'N/A'}
    **Campus:** ${item.structuredData?.campus?.join(', ') ?? 'N/A'}
    **Prerequisites:** ${item.structuredData?.prerequisites?.trim() || 'Not specified'}
    **School:** ${item.structuredData?.school ?? 'N/A'}
    **Faculty:** ${item.structuredData?.faculty ?? 'N/A'}
    **Coordinator:** ${item.structuredData?.coordinator ?? 'N/A'}
    **Email:** ${item.structuredData?.coordinatorEmail ?? 'N/A'}
    **Phone:** ${item.structuredData?.coordinatorPhone ?? 'N/A'}

    **Learning Outcomes:**
    ${(item.structuredData?.learningOutcomes ?? []).map((o: string, i: number) => `${i + 1}. ${o}`).join('\n') || 'Not specified'}

    **Assessment Tasks:**
    ${(item.structuredData?.assessmentTasks ?? []).map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || 'Not specified'}
    `.trim();
  }


  /**
   * Create a prompt for search quality evaluation
   */
  public createSearchEvaluationPrompt(query: string, searchResults: SearchResponse): string {
    return `Evaluate if these search results adequately answer the query: "${query}"
    
Results found: ${searchResults.results.length}
Results: ${searchResults.results.map(r => `${r.title} (${r.url})`).join(', ')}

Does this search provide sufficient information to answer the user's question? 
Respond with: YES (if results are adequate) or NO (if more/better results needed)`;
  }
}

// Export singleton instance
export const promptService = new PromptService();