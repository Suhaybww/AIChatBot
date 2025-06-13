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
- **Context-aware conversations** - Seamless switching between subjects without confusion
- **Smart URL handling** - Automatic raw URL display for RMIT course links

### 🔍 **Intelligent Search & Knowledge Base**
- Comprehensive RMIT course and program database (4 specialized tables)
- **Enhanced query classification** - Distinguishes between course, program, and general queries
- **Smart search decisions** - Knowledge base vs. web search with context awareness
- **Course code recognition** - Advanced pattern matching (e.g., COSC1111, BP094, MATH2469)
- **Real-time search integration** - Serper API for current information
- **Context-aware result ranking** - Prioritizes recent entities over session history
- **Fallback search strategies** - Multiple search patterns for comprehensive coverage

### 🖼️ **Image Processing**
- Upload and analyze images (PNG, JPEG, GIF up to 1MB)
- AI-powered image description and analysis
- Automatic compression and optimization
- **Never search when images present** - Pure image analysis priority

### 📱 **Responsive Design**
- Mobile-first interface optimized for all devices
- Collapsible sidebar with session management
- Touch-friendly interactions
- Accessibility features and keyboard navigation
- **Enhanced URL display** - Proper text wrapping for long RMIT URLs

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
│   │   │   └── [sessionId]/   # Individual chat sessions
│   │   ├── settings/          # User settings page
│   │   └── api/               # API routes
│   │       ├── auth/          # Kinde authentication
│   │       ├── streamingAI/   # AI streaming responses
│   │       └── trpc/          # tRPC API endpoints
│   ├── components/            # React components
│   │   ├── chat/              # Chat-related components
│   │   ├── settings/          # Settings components
│   │   ├── ui/                # ShadCN UI components
│   │   ├── layout/            # Layout components
│   │   ├── error/             # Error handling components
│   │   └── providers/         # Context providers
│   ├── lib/                   # Utility libraries
│   │   ├── services/          # Service layer
│   │   │   ├── ai.service.ts           # Claude AI integration
│   │   │   ├── bedrock.service.ts      # AWS Bedrock client
│   │   │   ├── search.service.ts       # Search orchestration
│   │   │   ├── knowledgeBase.service.ts # Database queries
│   │   │   ├── context.service.ts      # Context management
│   │   │   ├── prompt.service.ts       # Prompt engineering
│   │   │   └── queryClassifier.ts      # Query classification
│   │   ├── orchestrators/     # Business logic orchestration
│   │   │   ├── aiOrchestrator.ts       # Main AI flow
│   │   │   └── chatOrchestrator.ts     # Chat management
│   │   ├── auth.ts            # Authentication config
│   │   ├── prisma.ts          # Database client
│   │   └── utils.ts           # Utility functions
│   ├── server/                # Backend API
│   │   ├── api/routers/       # tRPC routers
│   │   │   ├── auth.ts        # Authentication routes
│   │   │   ├── chat.ts        # Chat management
│   │   │   └── knowledgeBase.ts # Knowledge base routes
│   │   └── db/                # Database utilities
│   ├── hooks/                 # Custom React hooks
│   │   └── useUserSync.ts     # User synchronization
│   └── types/                 # TypeScript definitions
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma          # Enhanced database schema
│   │                          # - Users, ChatSessions, Messages
│   │                          # - Courses, Programs, AcademicSchools
│   │                          # - AcademicInformation
│   ├── migrations/            # Database migrations
│   └── seed/                  # Enhanced database seeding
│       └── seed.ts            # Comprehensive seeding logic
├── scripts/                   # Enhanced Python scraping system
│   ├── run-scrapers.sh        # Automated scraping pipeline
│   ├── scrape-academic-info.py # Academic information scraper
│   ├── scrape-courses.py      # Course data scraper
│   ├── scrape-programs.py     # Program data scraper
│   └── clean_up.py           # Data cleaning utilities
├── rmit_knowledge_base/       # Scraped RMIT data
│   ├── courses_data.json      # Course information
│   ├── programs_data.json     # Program information
│   ├── schools_data.json      # School/faculty data
│   ├── academic_information.json # Academic policies & info
│   └── *_summary.json         # Data summaries and statistics
└── doc/                       # Documentation
    ├── FEATURES.md            # Feature documentation
    └── SEARCH_SYSTEM_COMPREHENSIVE_DOCUMENTATION.md
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

## 🧠 Enhanced Knowledge Base System

The project features a sophisticated, multi-layered knowledge base system designed specifically for RMIT University:

### **Database Architecture**
- **4 Specialized Tables**: Courses, Programs, Academic Schools, Academic Information
- **Relational Design**: Schools → Programs/Courses with proper foreign keys
- **Comprehensive Course Data**: 500+ courses with prerequisites, coordinators, assessments
- **Full Program Catalog**: Bachelor, Master, Diploma programs with entry requirements
- **Academic Policies**: Enrollment, assessment, student support information
- **School Hierarchy**: Faculty → School → Program/Course organization

### **Enhanced Data Sources**
- **RMIT Course Database**: Complete course catalog with detailed information
- **Program Information**: Degree requirements, career outcomes, fees
- **Academic Policies**: Student handbook, assessment policies, procedures
- **School Directory**: Faculty structure, contact information, program offerings
- **Real-time Web Data**: Current events, deadlines, policy updates via Serper API

### **Advanced Data Processing**
- **Multi-stage Python scrapers** with error handling and retry logic
- **Data validation pipeline** ensures consistency and completeness
- **Relationship mapping** between courses, programs, and schools
- **Enhanced seeding system** with batch processing and progress tracking
- **Automated cleanup scripts** for data quality maintenance

### **Intelligent Search Integration**
- **Query Classification System**: Automatically distinguishes course vs program queries
- **Context-Aware Search**: Prioritizes recent conversation entities
- **Fallback Strategies**: Multiple search patterns for comprehensive coverage
- **Hybrid Search**: Knowledge base + web search with smart decision making
- **Course Code Recognition**: Advanced pattern matching for RMIT codes
- **Priority Scoring**: Relevance ranking with context weighting

## 🔧 Enhanced Service Architecture

### **AI Orchestrator** (`lib/orchestrators/aiOrchestrator.ts`)
- **Enhanced AI conversation flow** with context-aware decision making
- **Advanced search decisions** - knowledge base vs web search logic
- **Multi-modal support** - text and image processing coordination
- **Response confidence assessment** and fallback strategies
- **Context and memory management** with conversation history
- **Search result integration** with AI responses

### **Search Service** (`lib/services/search.service.ts`)
- **Intelligent search orchestration** combining multiple sources
- **Hybrid search strategy** - knowledge base + Serper API integration
- **Search decision logic** based on query type and context
- **Result aggregation and ranking** with relevance scoring
- **Performance optimization** with caching and parallel searches
- **Fallback mechanisms** for comprehensive coverage

### **Knowledge Base Service** (`lib/services/knowledgeBase.service.ts`)
- **Multi-table database querying** across 4 specialized tables
- **Advanced filtering and ranking** with context awareness
- **Relationship-aware searches** (school → program → course)
- **Category-based optimization** for different query types
- **Structured data formatting** for AI consumption
- **Content preprocessing** and snippet generation

### **Context Service** (`lib/services/context.service.ts`)
- **Advanced context management** with entity prioritization
- **Conversation history analysis** for better search results
- **Entity extraction and tracking** (courses, programs, schools)
- **Context switching support** - seamless subject transitions
- **Memory optimization** with relevance-based retention

### **Query Classifier** (`lib/services/queryClassifier.ts`)
- **Intelligent query classification** - course vs program vs general
- **Pattern recognition** for RMIT-specific entities
- **Context-aware classification** using conversation history
- **Priority-based decision making** for search routing

### **Prompt Service** (`lib/services/prompt.service.ts`)
- **Advanced prompt engineering** for Claude Sonnet 4
- **Context-aware prompt construction** with search results
- **URL formatting optimization** for RMIT course links
- **Response quality guidelines** and formatting rules

### **Bedrock Service** (`lib/services/bedrock.service.ts`)
- **AWS Bedrock integration** for Claude Sonnet 4
- **Streaming response handling** with proper error management
- **Authentication and credential management**
- **Regional optimization** and fallback configurations

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

## 🎯 Enhanced RMIT-Specific Features

### **Comprehensive Course Database**
- **500+ RMIT Courses**: Complete catalog with detailed information
- **Prerequisites & Dependencies**: Course pathway mapping and requirements
- **Coordinator Information**: Direct contact details for course coordinators
- **Assessment Methods**: Detailed breakdown of assessment tasks and learning outcomes
- **Delivery Modes**: Campus, online, and blended delivery options

### **Complete Program Catalog**
- **Full Degree Portfolio**: Bachelor, Master, Diploma, and Certificate programs
- **Entry Requirements**: Detailed admission criteria and pathways
- **Career Outcomes**: Industry connections and employment prospects
- **Program Structure**: Course sequences and specialization options
- **Fees and Scholarships**: Financial information and funding opportunities

### **Academic Support System**
- **Policy Knowledge**: Academic integrity, assessment, enrollment policies
- **Student Services**: Mental health, career services, learning support
- **Administrative Procedures**: Special consideration, credit transfer, appeals
- **Campus Resources**: Facilities, libraries, student centers

### **Real-time Information Integration**
- **Current Events**: Latest RMIT news and announcements
- **Academic Calendar**: Important dates, deadlines, semester schedules
- **Policy Updates**: Recent changes to academic policies and procedures
- **Emergency Information**: Campus safety and emergency procedures

### **Intelligent Query Handling**
- **Context-Aware Responses**: Understands when you switch between courses/programs
- **Smart URL Generation**: Direct links to official RMIT pages
- **Multi-level Search**: Course → Program → School relationship awareness
- **Personalized Recommendations**: Based on conversation context and student needs

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