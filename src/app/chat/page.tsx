import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import ChatInterface from "@/components/chat/ChatInterface";

export default async function ChatPage() {
  const { isAuthenticated, getUser } = getKindeServerSession();
  
  if (!(await isAuthenticated())) {
    redirect("/auth/login");
  }

  const user = await getUser();

  return <ChatInterface user={user} />;
}