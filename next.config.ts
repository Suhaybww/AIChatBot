/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'vega-teal.vercel.app'],
  },
  
  // Remove loadEnvConfig - it interferes with Vercel's environment variables
  // Vercel automatically provides environment variables to the runtime
  
  env: {
    // AWS/Cognito variables (for client-side)
    REGION: process.env.REGION,
    MODEL_ID: process.env.MODEL_ID,
    IDENTITY_POOL_ID: process.env.IDENTITY_POOL_ID,
    USER_POOL_ID: process.env.USER_POOL_ID,
    APP_CLIENT_ID: process.env.APP_CLIENT_ID,
    COGNITO_USERNAME: process.env.COGNITO_USERNAME,
    PASSWORD: process.env.PASSWORD,
    
    // Kinde variables (for client-side where needed)
    NEXT_PUBLIC_KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
    NEXT_PUBLIC_SITE_URL: process.env.KINDE_SITE_URL,
  },
  
  // Note: Kinde server-side variables (like KINDE_CLIENT_SECRET) 
  // should NOT be exposed to client-side and are automatically 
  // available to server-side code via process.env
  
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  
  // Headers for better CORS handling
  async headers() {
    return [
      {
        source: '/api/auth/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.KINDE_SITE_URL || 'http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
}

export default nextConfig