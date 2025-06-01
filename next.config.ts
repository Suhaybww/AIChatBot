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
    USERNAME: process.env.USERNAME,
    PASSWORD: process.env.PASSWORD,
  },
}

module.exports = nextConfig