// src/app/chat/page.tsx
import { requireAuth } from "@/lib/auth";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default async function ChatPage() {
  // This will automatically redirect if not authenticated
  const user = await requireAuth();

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950">
      <ChatInterface user={user} />
    </div>
  );
}