import { loadEnvConfig } from '@next/env'

// Load environment variables from .env.local
const projectDir = process.cwd()
loadEnvConfig(projectDir)

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  env: {
    REGION: process.env.REGION,
    MODEL_ID: process.env.MODEL_ID,
    IDENTITY_POOL_ID: process.env.IDENTITY_POOL_ID,
    USER_POOL_ID: process.env.USER_POOL_ID,
    APP_CLIENT_ID: process.env.APP_CLIENT_ID,
    COGNITO_USERNAME: process.env.COGNITO_USERNAME,
    PASSWORD: process.env.PASSWORD,
  },
  // Explicitly declare which env vars should be exposed to the client
  publicRuntimeConfig: {
    REGION: process.env.REGION,
    MODEL_ID: process.env.MODEL_ID,
    IDENTITY_POOL_ID: process.env.IDENTITY_POOL_ID,
    USER_POOL_ID: process.env.USER_POOL_ID,
    APP_CLIENT_ID: process.env.APP_CLIENT_ID,
    COGNITO_USERNAME: process.env.COGNITO_USERNAME,
  },
}

export default nextConfig