# AI-Assisted Student Support Chatbot

**RMIT DCNC Assignment 3 - Option 2**

A full-stack chatbot to help new RMIT students navigate academic challenges like course enrollment, academic policies, and student services.

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, ShadCN UI, Tailwind CSS
- **Backend**: tRPC, Kinde Auth, Prisma ORM
- **Database**: Neon PostgreSQL
- **AI Integration**: OpenAI/Anthropic API
- **Deployment**: Vercel
- **CI/CD**: GitHub Actions

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Set up database
npx prisma db push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## Team Assignments

### Suhayb (Person 1): Frontend & Infrastructure
**Total Time**: ~18 hours

**What you're handling:**
1. **Project Setup & Database** (3-4 hours)
   - Environment configuration
   - Prisma schema setup with Neon
   - Kinde Auth configuration
   - Database models (User, ChatSession, Message, KnowledgeBase)

2. **Frontend Development** (10-12 hours)
   - Authentication pages with Kinde integration
   - Chat interface with real-time messaging
   - React components using ShadCN UI
   - Responsive design and mobile optimization

3. **Deployment & DevOps** (3-4 hours)
   - Vercel deployment setup
   - GitHub Actions CI/CD
   - Environment variable configuration
   - Production database setup

4. **Integration & Polish** (2-3 hours)
   - Connect frontend with backend
   - Bug fixes and performance optimization
   - Final testing

**Your files:**
```
src/app/                     # All page components
src/components/             # React components
prisma/schema.prisma        # Database schema
.github/workflows/          # CI/CD setup
src/lib/                   # Utility functions
```

---

### Person 2: Backend API Developer
**Total Time**: ~12 hours

**What you're building:**
1. **User Management** (3 hours)
   - Handle user data from Kinde Auth
   - User profile management
   - Database user operations
   - File: `src/server/api/routers/auth.ts`

2. **Chat System** (7 hours)
   - Chat session management
   - Message handling and storage
   - AI service integration (OpenAI/Anthropic)
   - Response generation and processing
   - File: `src/server/api/routers/chat.ts`

3. **Documentation** (2 hours)
   - API endpoint documentation
   - Example requests/responses
   - Testing and validation

**Your files:**
```
src/server/api/routers/     # All API logic
src/types/                 # TypeScript definitions
docs/API.md                # API documentation
```

**Dependencies:** Wait for Suhayb to complete basic project setup and database schema.

---

### Person 3: Knowledge Base & Content
**Total Time**: ~12 hours

**What you're creating:**
1. **Research & Data Collection** (5 hours)
   - RMIT student policies and procedures
   - Course enrollment processes
   - Student support services information
   - Common FAQ compilation

2. **Data Processing** (4 hours)
   - Structure data for chatbot consumption
   - Create JSON files for knowledge base
   - Data cleaning and optimization
   - File: `src/server/api/routers/knowledgeBase.ts`

3. **Documentation & Presentation** (3 hours)
   - Project documentation completion
   - Presentation slides preparation
   - Knowledge base documentation

**Your files:**
```
public/knowledge-base/      # All knowledge data
prisma/seed/               # Database seed files
docs/                      # Project documentation
```

**You can start immediately** - your work is independent of the others.

---

## Project Structure

```
student-support-chatbot/
├── src/
│   ├── app/                    # Next.js pages
│   │   ├── auth/              # Login/register
│   │   ├── chat/              # Main chat interface
│   │   └── api/               # API routes
│   ├── components/            # React components
│   │   ├── auth/              # Auth forms
│   │   ├── chat/              # Chat UI
│   │   └── ui/                # ShadCN components
│   ├── server/                # Backend logic
│   │   └── api/routers/       # tRPC routes
│   └── lib/                   # Utilities
├── prisma/                    # Database & seeds
├── public/knowledge-base/     # Static data files
├── docs/                      # Documentation
└── .github/workflows/         # CI/CD
```

## Development Process

**Setup Phase** (Days 1-2):
- Suhayb: Project setup, database, basic UI
- Person 3: Research and data collection
- Person 2: Environment setup, planning

**Development Phase** (Days 3-10):
- All: Core feature development
- Regular check-ins and integration

**Integration Phase** (Days 11-13):
- Connect all components
- Testing and bug fixes
- Performance optimization

**Presentation Phase** (Day 14):
- Final documentation
- Presentation preparation
- Demo rehearsal

## Getting Started

### Suhayb - Start Here:
1. Complete the remaining file setup from the setup guide
2. Configure your Neon database
3. Set up Kinde Auth account
4. Get the basic app running

### Person 2 - Wait for Setup:
1. Study the tRPC documentation
2. Plan your API structure
3. Research AI integration options
4. Set up your development environment

### Person 3 - Start Now:
1. Visit RMIT website for student information
2. Research academic policies and procedures
3. Create initial data structure
4. Begin collecting FAQ content

## Important Notes

- **Suhayb handles all technical setup** - ask him for help with environment issues
- **Each person's work is designed to be independent** once setup is complete
- **Ask questions early** rather than struggling alone
- **Keep track of your individual contributions** for the presentation

## Success Criteria

- Working authentication with Kinde
- Functional chat interface
- AI responses using knowledge base
- Clean, responsive design
- Deployed application
- Complete documentation
- Successful demo presentation

## Resources

- **tRPC Documentation**: https://trpc.io/docs
- **ShadCN Components**: https://ui.shadcn.com
- **Kinde Auth Guide**: https://kinde.com/docs
- **Neon Database**: https://neon.tech/docs
- **RMIT Student Services**: https://www.rmit.edu.au/students
