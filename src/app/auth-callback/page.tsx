"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { api } from "@/lib/trpc";
import { Star, CheckCircle, Loader2, AlertTriangle } from "lucide-react";

type SetupStage = 'initializing' | 'checking' | 'syncing' | 'complete' | 'error';

export default function AuthCallbackPage() {
  const { user, isAuthenticated, isLoading: kindeLoading } = useKindeBrowserClient();
  const router = useRouter();
  const [setupStage, setSetupStage] = useState<SetupStage>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isNewUser, setIsNewUser] = useState<boolean>(false);

  const syncUserMutation = api.auth.syncUserFromKinde.useMutation({
    onSuccess: (data) => {
      console.log('User synced successfully:', data);
      setIsNewUser(data.isNewUser);
      setSetupStage('complete');
      
      // Redirect after showing success message
      setTimeout(() => {
        router.push('/chat');
      }, isNewUser ? 2000 : 1000); // Longer delay for new users to read welcome message
    },
    onError: (error) => {
      console.error('Error syncing user:', error);
      setErrorMessage(error.message || 'Failed to set up your account');
      setSetupStage('error');
    },
  });

  useEffect(() => {
    // Don't proceed if Kinde is still loading
    if (kindeLoading) {
      setSetupStage('initializing');
      return;
    }

    // Redirect to home if not authenticated
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    // If we have a user and we're in initializing stage, start the sync process
    if (user && setupStage === 'initializing') {
      setSetupStage('checking');
      
      // Small delay to show the checking stage
      setTimeout(() => {
        setSetupStage('syncing');
        syncUserMutation.mutate({
          id: user.id,
          email: user.email || '',
          given_name: user.given_name || null,
          family_name: user.family_name || null,
          picture: user.picture || null,
        });
      }, 800);
    }
  }, [user, isAuthenticated, kindeLoading, setupStage, syncUserMutation, router]);

  // Show initial loading while Kinde is loading
  if (kindeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto">
            <Star className="w-8 h-8 text-white fill-white animate-pulse" />
          </div>
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Authenticating...</h2>
            <p className="text-gray-400">Please wait while we verify your credentials</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if not authenticated and Kinde finished loading
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-6 max-w-md mx-auto px-6">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Authentication Issue</h2>
            <p className="text-gray-400 mb-6">We couldn&apos;t verify your authentication. Please try signing in again.</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderStageContent = () => {
    switch (setupStage) {
      case 'initializing':
        return (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Initializing...</h2>
            <p className="text-gray-400">Setting up your session</p>
          </>
        );
      
      case 'checking':
        return (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Checking your account...</h2>
            <p className="text-gray-400">Verifying your profile information</p>
          </>
        );
      
      case 'syncing':
        return (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Setting up your account</h2>
            <p className="text-gray-400">Syncing your profile and workspace</p>
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>Configuring your AI assistant</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <span>Preparing your chat interface</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                <span>Loading RMIT knowledge base</span>
              </div>
            </div>
          </>
        );
      
      case 'complete':
        return (
          <>
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-100 mb-2">
              {isNewUser ? 'Welcome to Vega!' : 'Welcome back!'}
            </h2>
            <p className="text-gray-400">
              {isNewUser 
                ? 'Your account has been created successfully. Redirecting to chat...'
                : 'Your account is ready. Redirecting to chat...'
              }
            </p>
          </>
        );
      
      case 'error':
        return (
          <>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold">!</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Setup Error</h2>
            <p className="text-gray-400 mb-6">{errorMessage}</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setSetupStage('initializing');
                  setErrorMessage('');
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium w-full"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium w-full"
              >
                Back to Home
              </button>
            </div>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center space-y-6 max-w-md mx-auto px-6">
        {/* Vega Branding */}
        <div className="mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Star className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
            Vega
          </h1>
          <p className="text-sm text-gray-500 italic">Your brightest guide to RMIT</p>
        </div>

        {/* Dynamic Content Based on Stage */}
        <div className="space-y-4">
          {renderStageContent()}
        </div>

        {/* Welcome Message for New Users */}
        {setupStage === 'syncing' && (
          <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-sm text-red-300">
              {user.given_name 
                ? `Welcome to Vega, ${user.given_name}! We're setting up everything you need to get started.`
                : 'Welcome to your RMIT AI companion! We\'re setting up everything you need to get started.'
              }
            </p>
          </div>
        )}

        {/* Success Message for Returning Users */}
        {setupStage === 'complete' && !isNewUser && (
          <div className="mt-8 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-sm text-green-300">
              {user.given_name 
                ? `Good to see you again, ${user.given_name}!`
                : 'Welcome back! Your account has been updated.'
              }
            </p>
          </div>
        )}

        {/* New User Success Message */}
        {setupStage === 'complete' && isNewUser && (
          <div className="mt-8 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-sm text-green-300">
              🎉 Your account has been created! You can now access all of Vega&apos;s features including personalized AI assistance, course guidance, and RMIT support.
            </p>
          </div>
        )}

        {/* Loading Progress Indicator */}
        {(setupStage === 'checking' || setupStage === 'syncing') && (
          <div className="mt-8">
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-red-500 to-orange-500 h-2 rounded-full transition-all duration-1000 ease-out"
                style={{ 
                  width: setupStage === 'checking' ? '30%' : '80%' 
                }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}