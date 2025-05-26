import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";

export default async function ChatPage() {
  const { isAuthenticated, getUser } = getKindeServerSession();
  
  if (!(await isAuthenticated())) {
    redirect("/auth/login");
  }

  const user = await getUser();

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">AI Student Support</h1>
          <p className="text-sm text-gray-600">Welcome, {user?.given_name || "Student"}!</p>
        </div>
        <LogoutLink>
          <Button variant="outline" size="sm">
            Sign Out
          </Button>
        </LogoutLink>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Chat Interface Coming Soon!</h2>
          <p className="text-gray-600 mb-4">
            We&apos;re building an amazing AI-powered chat experience for RMIT students.
          </p>
          <div className="bg-white p-6 rounded-lg shadow-sm max-w-md">
            <h3 className="font-semibold mb-2">What you&apos;ll be able to do:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Ask questions about course enrollment</li>
              <li>• Get help with academic policies</li>
              <li>• Find student support services</li>
              <li>• Get answers to common questions</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}