# RMIT AI ChatBot - Vega

An intelligent AI-powered chatbot designed specifically for RMIT University students with advanced search capabilities, comprehensive knowledge base, and sophisticated chat management system.

## 🚀 Project Overview

This full-stack application provides RMIT students with an AI assistant that can answer questions about courses, academic policies, student services, and general university information. The chatbot leverages a comprehensive knowledge base scraped from RMIT's official website and uses advanced AI to provide contextual, helpful responses.

## ✨ Key Features

### 🔐 **Authentication & User Management**
- Secure OAuth authentication via Kinde
- User profile management and account settings
- Session-based security with automatic synchronization

### 💬 **Advanced Chat System**
- Real-time AI conversations with Claude Sonnet 4
- Persistent chat sessions with unique URLs
- Message history and context management
- Multi-modal support (text and image analysis)
- Typing indicators and response streaming

### 🔍 **Intelligent Search & Knowledge Base**
- Comprehensive RMIT course and program database
- Smart search decisions (knowledge base vs. web search)
- Course code recognition (e.g., COSC1111, BP094)
- Real-time search with caching for performance
- Context-aware result ranking

### 🖼️ **Image Processing**
- Upload and analyze images (PNG, JPEG, GIF up to 1MB)
- AI-powered image description and analysis
- Automatic compression and optimization

### 📱 **Responsive Design**
- Mobile-first interface optimized for all devices
- Collapsible sidebar with session management
- Touch-friendly interactions
- Accessibility features and keyboard navigation

## 🛠️ Tech Stack

### **Frontend**
- **Next.js 15** with App Router
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **ShadCN UI** component library
- **tRPC** for type-safe API calls

### **Backend**
- **tRPC** API with TypeScript
- **Prisma ORM** with PostgreSQL
- **Kinde Auth** for authentication
- **AWS Bedrock** (Claude Sonnet 4)

### **Database & Infrastructure**
- **Neon PostgreSQL** database
- **Vercel** deployment platform
- **GitHub Actions** for CI/CD

### **AI & Search**
- **Claude Sonnet 4** via AWS Bedrock
- **Custom search algorithms**
- **Knowledge base seeding system**
- **Context management service**

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (Neon recommended)
- AWS account with Bedrock access
- Kinde Auth account

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd AIChatBot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Configure your environment variables (see Environment Setup below)

# Set up the database
npx prisma db push
npx prisma generate

# Set up the knowledge base (optional - requires Python)
npm run setup-knowledge-base

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## ⚙️ Environment Setup

Create a `.env.local` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Kinde Auth
KINDE_CLIENT_ID="your_kinde_client_id"
KINDE_CLIENT_SECRET="your_kinde_client_secret"
KINDE_ISSUER_URL="https://yourdomain.kinde.com"
KINDE_SITE_URL="http://localhost:3000"
KINDE_POST_LOGOUT_REDIRECT_URL="http://localhost:3000"
KINDE_POST_LOGIN_REDIRECT_URL="http://localhost:3000/auth-callback"

# AWS Bedrock
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_REGION="us-east-1"

# Optional: Search APIs
SERP_API_KEY="your_serp_api_key"
```

## 📂 Project Structure

```
AIChatBot/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── auth-callback/      # Auth callback handler
│   │   ├── chat/              # Chat interface and sessions
│   │   ├── settings/          # User settings page
│   │   └── api/               # API routes
│   ├── components/            # React components
│   │   ├── chat/              # Chat-related components
│   │   ├── settings/          # Settings components
│   │   ├── ui/                # ShadCN UI components
│   │   └── layout/            # Layout components
│   ├── lib/                   # Utility libraries
│   │   ├── services/          # Service layer
│   │   ├── orchestrators/     # Business logic
│   │   └── auth.ts            # Authentication config
│   ├── server/                # Backend API
│   │   └── api/routers/       # tRPC routers
│   ├── hooks/                 # Custom React hooks
│   └── types/                 # TypeScript definitions
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── seed/                  # Database seeding scripts
├── scripts/                   # Python scraping scripts
├── rmit_knowledge_base/       # Knowledge base data
└── doc/                       # Documentation
```

## 🗄️ Available Scripts

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checking
```

### Database
```bash
npm run db:push      # Push schema changes to database
npm run db:reset     # Reset database with migrations
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed database with sample data
```

### Knowledge Base
```bash
npm run scrape              # Run Python scrapers to collect RMIT data
npm run validate            # Validate scraped data files
npm run seed               # Seed knowledge base into database
npm run seed-direct        # Direct seeding without validation
npm run setup-knowledge-base # Complete knowledge base setup
```

## 🧠 Knowledge Base System

The project includes a sophisticated knowledge base system that scrapes and processes RMIT University data:

### **Data Sources**
- RMIT course information and details
- Academic policies and procedures
- Student services and support information
- Campus facilities and resources

### **Data Processing**
- **Python scrapers** collect data from RMIT website
- **Validation system** ensures data quality and consistency
- **Enhanced seeder** processes and stores data in PostgreSQL
- **Batch processing** handles large datasets efficiently

### **Search Integration**
- **Intelligent search** determines when to use knowledge base vs web search
- **Context awareness** uses conversation history for better results
- **Course code detection** automatically recognizes RMIT course codes
- **Priority scoring** ranks results by relevance and importance

## 🔧 Key Services

### **AI Orchestrator** (`lib/orchestrators/aiOrchestrator.ts`)
- Manages AI conversation flow
- Handles context and memory management
- Integrates search results with AI responses

### **Search Service** (`lib/services/search.service.ts`)
- Intelligent search decision making
- Knowledge base querying
- Web search integration
- Result caching and optimization

### **Knowledge Base Service** (`lib/services/knowledgeBase.service.ts`)
- Database querying for RMIT-specific information
- Content filtering and ranking
- Category-based search optimization

### **Bedrock Service** (`lib/services/bedrock.service.ts`)
- AWS Bedrock integration for Claude Sonnet 4
- Streaming response handling
- Error management and fallbacks

## 🚀 Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Database Setup
1. Create a Neon PostgreSQL database
2. Configure connection strings in environment variables
3. Run migrations: `npx prisma db push`
4. Seed knowledge base: `npm run setup-knowledge-base`

## 🧪 Development Workflow

1. **Setup**: Clone repository and install dependencies
2. **Environment**: Configure all required environment variables
3. **Database**: Set up PostgreSQL and run migrations
4. **Knowledge Base**: Run scrapers and seed database (optional)
5. **Development**: Start development server and begin coding
6. **Testing**: Use type checking and linting before commits
7. **Deployment**: Push to main branch for automatic deployment

## 📚 Documentation

- **[Features Overview](doc/FEATURES.md)** - Comprehensive feature documentation
- **[Search System](doc/SEARCH_SYSTEM_COMPREHENSIVE_DOCUMENTATION.md)** - Detailed search system documentation
- **[API Documentation](src/server/api/)** - tRPC API reference

## 🛡️ Security Features

- **OAuth 2.0** authentication with Kinde
- **CSRF protection** and input validation
- **User data isolation** and privacy controls
- **Secure session management**
- **Error boundaries** and graceful error handling

## 🎯 RMIT-Specific Features

- **Course Information**: Comprehensive database of RMIT courses and programs
- **Academic Calendar**: Important dates and deadlines
- **Student Services**: Complete guide to RMIT support services
- **Campus Information**: Facilities, locations, and resources
- **Policy Knowledge**: Academic policies and procedures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 🆘 Support

For support and questions:
- Check the documentation in the `doc/` folder
- Review the feature overview and search system documentation
- Examine the codebase structure and comments
- Create an issue for bugs or feature requests

---

*Built with ❤️ for RMIT University students to enhance their academic experience through intelligent AI assistance.*