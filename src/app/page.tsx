import { LoginLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { isAuthenticated } = getKindeServerSession();
  
  if (await isAuthenticated()) {
    redirect("/chat");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">AI Student Support</CardTitle>
          <CardDescription>
            Get instant help with your RMIT studies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginLink>
            <Button className="w-full" size="lg">
              Get Started
            </Button>
          </LoginLink>
          <p className="text-sm text-gray-600 text-center">
            Connect with your RMIT account to access personalized support
          </p>
        </CardContent>
      </Card>
    </div>
  );
}