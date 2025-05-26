export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  sessionId: string
}

export interface ChatSession {
  id: string
  userId: string
  title?: string
  createdAt: Date
  updatedAt: Date
  messages: ChatMessage[]
}

export interface KnowledgeBaseItem {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  lastUpdated: Date
}