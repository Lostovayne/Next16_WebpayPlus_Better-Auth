import { z } from "zod";

const envSchema = z.object({
  WEBPAY_COMMERCE_CODE: z.string().min(1, "WEBPAY_COMMERCE_CODE is missing"),
  WEBPAY_API_SECRET: z.string().min(1, "WEBPAY_API_SECRET is missing"),
  WEBPAY_ENVIRONMENT: z.enum(["integration", "production"]).default("integration"),
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
  NEXT_PUBLIC_APP_URL: z
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .default("http://localhost:3000"),
  // Secret compartido entre Vercel Cron y el endpoint de polling.
  CRON_SECRET: z.string().min(32, "CRON_SECRET debe tener al menos 32 caracteres"),
});

const parsedEnv = envSchema.safeParse({
  WEBPAY_COMMERCE_CODE: process.env.WEBPAY_COMMERCE_CODE,
  WEBPAY_API_SECRET: process.env.WEBPAY_API_SECRET,
  WEBPAY_ENVIRONMENT: process.env.WEBPAY_ENVIRONMENT,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsedEnv.success) {
  console.error(" Invalid environment variables:", z.treeifyError(parsedEnv.error));
  throw new Error("Terminating due to invalid environment variables");
}

export const env = parsedEnv.data;
