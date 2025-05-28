// src/components/settings/UserProfile.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Save, 
  User,
  Sparkles,
  Mail,
  Calendar,
  CheckCircle,
  Shield,
  Loader2,
  AlertCircle
} from "lucide-react";
import { api } from "@/lib/trpc";
import { toast } from "sonner";
import { useUserSync } from "@/hooks/useUserSync";

interface UserProfileProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function UserProfile({ user: initialUser }: UserProfileProps) {
  const [formData, setFormData] = useState({
    given_name: initialUser.given_name || "",
    family_name: initialUser.family_name || "",
    email: initialUser.email || "",
  });

  // Sync user to database first
  const { isSyncing, syncCompleted, isReady } = useUserSync();

  // tRPC queries and mutations - only run after sync is complete
  const { data: profile, isLoading: profileLoading } = api.auth.getProfile.useQuery(
    undefined,
    { enabled: syncCompleted } // Only run query after sync is complete
  );
  
  const { data: accountStats } = api.auth.getAccountStats.useQuery(
    undefined,
    { enabled: syncCompleted } // Only run query after sync is complete
  );
  
  const updateProfileMutation = api.auth.updateProfile.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      // Update form data with the returned user data
      if (data.user) {
        setFormData({
          given_name: data.user.given_name || "",
          family_name: data.user.family_name || "",
          email: data.user.email || "",
        });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Email availability check (debounced)
  const [emailCheckTimeout, setEmailCheckTimeout] = useState<NodeJS.Timeout>();
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const checkEmailMutation = api.auth.checkEmailAvailability.useMutation({
    onSuccess: (data) => {
      setEmailAvailable(data.available);
      setCheckingEmail(false);
    },
    onError: () => {
      setEmailAvailable(null);
      setCheckingEmail(false);
    },
  });

  const handleEmailChange = (email: string) => {
    setFormData(prev => ({ ...prev, email }));
    
    // Clear previous timeout
    if (emailCheckTimeout) {
      clearTimeout(emailCheckTimeout);
    }
    
    // Only check if email is different from current user's email and is valid
    if (email !== initialUser.email && email.includes('@')) {
      setCheckingEmail(true);
      setEmailAvailable(null);
      
      const timeout = setTimeout(() => {
        checkEmailMutation.mutate({ email });
      }, 500); // 500ms debounce
      
      setEmailCheckTimeout(timeout);
    } else {
      setEmailAvailable(null);
      setCheckingEmail(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.given_name.trim()) {
      toast.error("First name is required");
      return;
    }
    
    if (!formData.email.trim()) {
      toast.error("Email is required");
      return;
    }

    // Check if anything changed
    const hasChanges = 
      formData.given_name !== initialUser.given_name ||
      formData.family_name !== initialUser.family_name ||
      formData.email !== initialUser.email;

    if (!hasChanges) {
      toast.info("No changes to save");
      return;
    }

    // Update profile
    updateProfileMutation.mutate({
      given_name: formData.given_name.trim(),
      family_name: formData.family_name.trim(),
      email: formData.email.trim(),
    });
  };

  // Show loading state while syncing user
  if (isSyncing) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <div>
            <p className="text-gray-300 font-medium">Setting up your profile...</p>
            <p className="text-gray-500 text-sm">Just a moment while we sync your account</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while fetching profile
  if (profileLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const currentUser = profile || initialUser;

  return (
    <div className="space-y-8">
      {/* Profile Header Card */}
      <div className="bg-gradient-to-r from-gray-800/80 to-gray-700/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-6">
          <div className="relative">
            <Avatar className="w-24 h-24 ring-4 ring-gray-600/50">
              <AvatarImage src={currentUser.picture || ""} alt="Profile picture" />
              <AvatarFallback className="bg-gradient-to-br from-red-500 to-orange-500 text-white text-2xl font-bold">
                {currentUser.given_name?.[0] || currentUser.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-2 border-gray-800 rounded-full flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h2 className="text-2xl font-bold text-gray-100">
                {currentUser.given_name ? `${currentUser.given_name} ${currentUser.family_name || ''}`.trim() : 'Welcome'}
              </h2>
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
            <p className="text-gray-400 flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>{currentUser.email}</span>
            </p>
            <p className="text-sm text-gray-500 mt-2 flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>
                Student • Member since {
                  accountStats?.memberSince 
                    ? new Date(accountStats.memberSince).toLocaleDateString()
                    : 'today'
                }
              </span>                      
            </p>
          </div>
        </div>
      </div>

      {/* Profile Information Card */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Profile Information</h3>
            <p className="text-sm text-gray-500">Update your personal details</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="firstName" className="text-gray-300 font-medium">
                First Name *
              </Label>
              <Input
                id="firstName"
                value={formData.given_name}
                onChange={(e) => setFormData(prev => ({ ...prev, given_name: e.target.value }))}
                placeholder="Enter your first name"
                className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200"
                required
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="lastName" className="text-gray-300 font-medium">Last Name</Label>
              <Input
                id="lastName"
                value={formData.family_name}
                onChange={(e) => setFormData(prev => ({ ...prev, family_name: e.target.value }))}
                placeholder="Enter your last name"
                className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="email" className="text-gray-300 font-medium">Email Address *</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="Enter your email"
                className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200 pr-10"
                required
              />
              {checkingEmail && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-3 top-4" />
              )}
              {emailAvailable === false && (
                <AlertCircle className="w-4 h-4 text-red-400 absolute right-3 top-4" />
              )}
              {emailAvailable === true && (
                <CheckCircle className="w-4 h-4 text-green-400 absolute right-3 top-4" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>This email is used for your account access</span>
              </p>
              {emailAvailable === false && (
                <p className="text-xs text-red-400">Email is already in use</p>
              )}
              {emailAvailable === true && (
                <p className="text-xs text-green-400">Email is available</p>
              )}
            </div>
          </div>

          <Button 
            type="submit"
            disabled={updateProfileMutation.isPending || emailAvailable === false || !isReady}
            className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-xl h-12 px-8 disabled:opacity-50"
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}