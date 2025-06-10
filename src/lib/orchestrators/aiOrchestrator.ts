import { BedrockService } from "../services/bedrock.service";
import { AIService } from "../services/ai.service";
import { ContextService } from "../services/context.service";
import { SearchService } from "../services/search.service";
import { KnowledgeBaseService } from "../services/knowledgeBase.service";
import { promptService } from "../services/prompt.service";
import type { SearchResponse } from "../services/search.service";

export interface AIResponse {
  response: string;
  searchResults?: SearchResponse | null;
  contextUsed?: boolean;
  searchPerformed?: boolean;
  responseMetadata?: {
    searchTime?: number;
    totalSources?: number;
    confidence?: 'high' | 'medium' | 'low';
  };
}

export interface AIRequestOptions {
  forceSearch?: boolean;
  allowAutoSearch?: boolean;
  includeContext?: boolean;
  sessionId?: string;
  userId?: string;
  maxTokens?: number;
  temperature?: number;
  imageUrl?: string;
  searchOptions?: {
    includeWeb?: boolean;
    includeKnowledgeBase?: boolean;
    maxResults?: number;
  };
}

export class AIOrchestrator {
  private bedrockService: BedrockService;
  private aiService: AIService;
  private contextService: ContextService;
  private searchService: SearchService;
  private knowledgeBaseService: KnowledgeBaseService;

  constructor() {
    this.bedrockService = BedrockService.fromEnv();
    this.aiService = new AIService(this.bedrockService);
    this.contextService = new ContextService();
    this.searchService = new SearchService();
    this.knowledgeBaseService = new KnowledgeBaseService();
  }

  /**
   * Main AI response orchestration method with enhanced search logic
   */
  async generateResponse(
    userMessage: string,
    options: AIRequestOptions = {}
  ): Promise<AIResponse> {
    const {
      forceSearch = false,
      allowAutoSearch = true, // Changed to true - enable smart search by default
      includeContext = true,
      sessionId,
      userId,
      maxTokens,
      temperature,
      searchOptions = {}
    } = options;

    const startTime = Date.now();

    // Build conversation context first if available
    let context = null;
    let conversationHistory: string[] = [];
    
    if (includeContext && sessionId && userId) {
      console.log('🧠 Building conversation context...');
      context = await this.contextService.buildContext(sessionId, userMessage, userId);
      conversationHistory = context.recentMessages.map(m => m.content);
    }

    // Enhanced search decision logic
    const searchDecision = await this.makeSearchDecision(
      userMessage, 
      forceSearch, 
      allowAutoSearch, 
      conversationHistory
    );

    let searchResults: SearchResponse | null = null;
    let searchTime = 0;

    // Perform search if needed
    if (searchDecision.shouldSearch) {
      console.log(`🔍 Performing search (reason: ${searchDecision.reason})...`);
      const searchStartTime = Date.now();
      
      try {
        searchResults = await this.searchService.performSearch(
          userMessage,
          searchOptions.includeWeb !== false,
          searchOptions.includeKnowledgeBase !== false
        );
        
        searchTime = Date.now() - searchStartTime;
        console.log(`✅ Search completed in ${searchTime}ms with ${searchResults.results.length} results`);
        
        // Evaluate search quality
        const searchQuality = await this.evaluateSearchQuality(userMessage, searchResults);
        if (searchQuality === 'poor' && !forceSearch) {
          console.log('⚠️ Search quality is poor, might supplement with knowledge base');
        }
      } catch (error) {
        console.error('❌ Search failed:', error);
        // Continue without search results rather than failing entirely
      }
    }

    // Create enhanced prompt
    let enhancedPrompt: string;
    if (context) {
      enhancedPrompt = this.contextService.createContextualPrompt(
        userMessage,
        context,
        searchResults
      );
    } else {
      enhancedPrompt = promptService.createSimplePrompt(userMessage, searchResults);
    }

    // Generate AI response
    console.log('🤖 Generating AI response...');
    const response = await this.aiService.sendMessage(enhancedPrompt, {
      maxTokens: maxTokens || 1000,
      temperature: temperature || 0.7
    });

    // Determine response confidence
    const confidence = this.assessResponseConfidence(
      response, 
      searchResults, 
      searchDecision.shouldSearch
    );

    const totalTime = Date.now() - startTime;
    console.log(`✅ Total response time: ${totalTime}ms`);

    return {
      response,
      searchResults,
      contextUsed: !!context,
      searchPerformed: searchDecision.shouldSearch,
      responseMetadata: {
        searchTime,
        totalSources: searchResults ? searchResults.results.length : 0,
        confidence
      }
    };
  }

  /**
   * Make intelligent decision about whether to search
   */
  private async makeSearchDecision(
    userMessage: string,
    forceSearch: boolean,
    allowAutoSearch: boolean,
    conversationHistory: string[]
  ): Promise<{ shouldSearch: boolean; reason: string }> {
    // Always search if forced
    if (forceSearch) {
      return { shouldSearch: true, reason: 'Forced search requested' };
    }

    // Never search if auto-search is disabled
    if (!allowAutoSearch) {
      return { shouldSearch: false, reason: 'Auto-search disabled' };
    }

    // Use the enhanced search decision logic from SearchService
    const shouldSearch = SearchService.shouldPerformSearch(userMessage, conversationHistory);
    
    if (shouldSearch) {
      // Analyze why we're searching
      const queryLower = userMessage.toLowerCase();
      
      if (queryLower.includes('link') || queryLower.includes('url')) {
        return { shouldSearch: true, reason: 'URL/link request' };
      }
      if (/\b[a-z]{2,4}\d{3,5}\b/i.test(userMessage)) {
        return { shouldSearch: true, reason: 'Course code detected' };
      }
      if (queryLower.includes('deadline') || queryLower.includes('date')) {
        return { shouldSearch: true, reason: 'Time-sensitive information' };
      }
      if (queryLower.includes('bachelor') || queryLower.includes('master')) {
        return { shouldSearch: true, reason: 'Program inquiry' };
      }
      
      return { shouldSearch: true, reason: 'RMIT-specific information needed' };
    }

    return { shouldSearch: false, reason: 'General question - knowledge base sufficient' };
  }

  /**
   * Evaluate the quality of search results
   */
  private async evaluateSearchQuality(
    query: string,
    searchResults: SearchResponse
  ): Promise<'good' | 'medium' | 'poor'> {
    if (!searchResults || searchResults.results.length === 0) {
      return 'poor';
    }

    // Check if we have highly relevant results
    const highlyRelevant = searchResults.results.filter(r => r.relevanceScore > 0.8).length;
    const relevant = searchResults.results.filter(r => r.relevanceScore > 0.5).length;
    
    if (highlyRelevant >= 2) {
      return 'good';
    } else if (relevant >= 3) {
      return 'medium';
    }
    
    // Check if results actually contain URLs for URL requests
    const queryLower = query.toLowerCase();
    if (queryLower.includes('link') || queryLower.includes('url')) {
      const hasValidUrls = searchResults.results.some(r => 
        r.url.includes('/bachelor-') || 
        r.url.includes('/master-') ||
        r.url.includes('/courses/') ||
        r.url.includes('/programs/')
      );
      return hasValidUrls ? 'good' : 'poor';
    }
    
    return 'medium';
  }

  /**
   * Assess confidence in the AI response
   */
  private assessResponseConfidence(
    response: string,
    searchResults: SearchResponse | null,
    searchWasPerformed: boolean
  ): 'high' | 'medium' | 'low' {
    // High confidence if we have good search results and used them
    if (searchResults && searchResults.results.length > 5 && response.includes('http')) {
      return 'high';
    }
    
    // Low confidence if search was needed but failed or returned no results
    if (searchWasPerformed && (!searchResults || searchResults.results.length === 0)) {
      return 'low';
    }
    
    // Medium confidence for general responses
    return 'medium';
  }

  /**
   * Generate AI response with knowledge base context
   */
  async generateKnowledgeResponse(
    query: string, 
    category?: string
  ): Promise<{ answer: string; contextUsed: string }> {
    console.log(`📚 Generating knowledge-based response for: ${query}`);
    
    const contextUsed = await this.knowledgeBaseService.getStructuredKnowledgeForAI(query, category);

    const prompt = promptService.createPrompt(query, {
      includeDate: true,
      includeKnowledgeBase: true,
      isKnowledgeOnlyMode: true
    }, undefined, undefined, contextUsed);

    const answer = await this.aiService.sendMessage(prompt, {
      maxTokens: 800,
      temperature: 0.7
    });

    return {
      answer,
      contextUsed
    };
  }

  /**
   * Process image with AI analysis
   */
  async processImageWithAI(
    content: string,
    imageUrl: string,
    options: AIRequestOptions = {}
  ): Promise<AIResponse> {
    console.log(`🖼️ Processing image analysis for: ${content}`);
    
    try {
      const response = await this.aiService.sendMessageWithImage(
        content,
        imageUrl,
        {
          maxTokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.7
        }
      );

      return {
        response,
        searchResults: null,
        searchPerformed: false,
        contextUsed: false,
        responseMetadata: {
          confidence: 'high'
        }
      };
    } catch (error) {
      console.error('Image processing failed:', error);
      throw error;
    }
  }

  /**
   * Simple chat response without complex context building
   */
  async generateSimpleResponse(userMessage: string): Promise<string> {
    console.log('💬 Generating simple response...');
    
    // Check if even simple responses might benefit from search
    const shouldSearch = SearchService.shouldPerformSearch(userMessage);
    
    let searchResults: SearchResponse | null = null;
    if (shouldSearch) {
      try {
        console.log('🔍 Performing quick search for simple response...');
        searchResults = await this.searchService.performSearch(userMessage, true, true);
      } catch (error) {
        console.error('Search failed for simple response:', error);
      }
    }
    
    const prompt = promptService.createSimplePrompt(userMessage, searchResults);
    return await this.aiService.sendMessage(prompt, {
      maxTokens: 600,
      temperature: 0.7
    });
  }

  /**
   * Handle fallback when primary response fails
   */
  async generateFallbackResponse(userMessage: string): Promise<AIResponse> {
    console.log('⚠️ Generating fallback response...');
    
    try {
      // Try knowledge base only
      const kbResults = await this.knowledgeBaseService.searchKnowledge(userMessage, { limit: 5 });
      
      if (kbResults.length > 0) {
        const kbContent = kbResults
          .map(item => `${item.title}: ${item.content.slice(0, 200)}`)
          .join('\n\n');
        
        const prompt = promptService.createPrompt(userMessage, {
          includeKnowledgeBase: true,
          isKnowledgeOnlyMode: true
        }, undefined, undefined, kbContent);
        
        const response = await this.aiService.sendMessage(prompt);
        
        return {
          response,
          contextUsed: true,
          responseMetadata: {
            confidence: 'low'
          }
        };
      }
    } catch (error) {
      console.error('Fallback response failed:', error);
    }
    
    // Ultimate fallback
    return {
      response: "I apologize, but I'm having trouble accessing the information you need right now. Please try visiting rmit.edu.au directly or contact RMIT Connect for assistance:\n\n- Phone: 9925 5000 (within Australia)\n- Email: connect@rmit.edu.au\n- Visit: rmit.edu.au/students/contact",
      contextUsed: false,
      responseMetadata: {
        confidence: 'low'
      }
    };
  }

  /**
   * Clean up old context data
   */
  async cleanupContext(userId: string, daysOld: number = 30): Promise<void> {
    await this.contextService.cleanupOldContext(userId, daysOld);
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();