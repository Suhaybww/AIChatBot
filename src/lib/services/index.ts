// Central service exports for easy importing
export { BedrockService, bedrockService } from './bedrock.service';
export { AIService } from './ai.service';
export { ContextService } from './context.service';
export { SearchService } from './search.service';
export { KnowledgeBaseService } from './knowledgeBase.service';
export { PromptService, promptService } from './prompt.service';

// Type exports
export type { SearchResult, SearchResponse } from './search.service';
export type { ConversationContext, ContextualMessage } from './context.service';
export type { KnowledgeBaseItem, KnowledgeSearchOptions } from './knowledgeBase.service';
export type { ClaudeMessage, ClaudeOptions } from './ai.service';
export type { BedrockConfig } from './bedrock.service';
export type { PromptOptions } from './prompt.service';