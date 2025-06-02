// src/app/chat/[sessionId]/page.tsx
import { requireAuth } from "@/lib/auth";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { redirect } from "next/navigation";
import { db } from "@/server/db";

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function ChatSessionPage({ params }: PageProps) {
  try {
    // Await params before using them (Next.js 15 requirement)
    const { sessionId } = await params;
    
    // This will automatically redirect if not authenticated
    const kindeUser = await requireAuth();

    // Check if user exists in our database
    const dbUser = await db.user.findUnique({
      where: { id: kindeUser.id }
    });

    // If user doesn't exist in our DB, redirect to auth callback for syncing
    if (!dbUser) {
      redirect("/auth-callback");
    }

    // Validate sessionId format (basic UUID validation)
    const sessionIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!sessionIdRegex.test(sessionId)) {
      redirect("/chat");
    }

    // Pre-check if session exists and belongs to user to prevent infinite loops
    const sessionExists = await db.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: kindeUser.id,
      },
      select: { id: true }
    });

    // If session doesn't exist or doesn't belong to user, redirect to new chat
    if (!sessionExists) {
      redirect("/chat");
    }

    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-950">
        <ErrorBoundary>
          <ChatInterface 
            user={{
              id: kindeUser.id,
              email: kindeUser.email,
              given_name: kindeUser.given_name,
              family_name: kindeUser.family_name,
              picture: kindeUser.picture,
            }}
            sessionId={sessionId}
          />
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error("Error in ChatSessionPage:", error);
    // If any error occurs, redirect to main chat page
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    redirect("/chat");
  }
}