export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: process.env.DATABASE_URL,
  KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID,
  KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET,
  KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
  KINDE_SITE_URL: process.env.KINDE_SITE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};