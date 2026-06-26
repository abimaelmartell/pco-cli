import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PCO_ACCESS_TOKEN: z.string().min(1).optional(),
  PCO_APP_ID: z.string().min(1).optional(),
  PCO_SECRET: z.string().min(1).optional(),
  PCO_BASE_URL: z.string().url().default('https://api.planningcenteronline.com'),
  PCO_USER_AGENT: z.string().min(1).default('pco-cli/0.1.0'),
});

export type PcoConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PcoConfig {
  return envSchema.parse(env);
}
