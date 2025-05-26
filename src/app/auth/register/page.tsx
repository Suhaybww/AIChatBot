import { RegisterLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const { isAuthenticated } = getKindeServerSession();
  
  if (await isAuthenticated()) {
    redirect("/chat");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Get Started</CardTitle>
          <CardDescription>
            Create your account to access AI student support
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterLink>
            <Button className="w-full" size="lg">
              Sign Up
            </Button>
          </RegisterLink>
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <a href="/auth/login" className="text-blue-600 hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}