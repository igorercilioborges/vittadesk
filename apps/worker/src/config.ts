import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.js';

const hexKey = /^[0-9a-f]{64}$/i;
const base64Key = /^[A-Za-z0-9+/]{43}=$/;
const sessionKey = z
  .string()
  .refine((key) => hexKey.test(key) || base64Key.test(key), 'Use uma chave de 32 bytes em hex ou Base64.')
  .transform((key) => Buffer.from(key, hexKey.test(key) ? 'hex' : 'base64'));

export const config = z
  .object({
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SESSION_ENCRYPTION_KEY: sessionKey,
    MARIA_PROVIDER: z.enum(['openai', 'cloudflare']).default('openai'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
    WEB_ORIGIN: z.url(),
    PORT: z.coerce.number().int().min(1).default(3001),
  })
  .parse({ ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined });

export const mariaTest = config.MARIA_PROVIDER === 'cloudflare'
  ? z.object({
      CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/i),
      CLOUDFLARE_API_TOKEN: z.string().trim().min(1),
      MARIA_TEST_CLINIC_ID: z.uuid(),
      MARIA_TEST_PHONE: z.string().regex(/^[1-9][0-9]{7,14}$/),
      MARIA_TEST_AFTER: z.iso.datetime({ offset: true }),
    }).parse(process.env)
  : null;

export function mariaEnabledFor(clinic: string) {
  return mariaTest ? clinic === mariaTest.MARIA_TEST_CLINIC_ID : Boolean(config.OPENAI_API_KEY);
}

export function mariaAllowedContact(clinic: string, phone: string | null, jid: string) {
  if (!mariaTest) return true;
  return clinic === mariaTest.MARIA_TEST_CLINIC_ID &&
    phone === mariaTest.MARIA_TEST_PHONE &&
    (jid === `${phone}@s.whatsapp.net` || /^\d+@lid$/.test(jid));
}

export const db = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

export function result<R extends QueryResult>(response: R): R['data'] {
  if (response.error) throw Object.assign(new Error(response.error.message), { code: response.error.code });
  return response.data;
}
export function required<R extends QueryResult>(response: R): NonNullable<R['data']> {
  const data = result(response);
  if (data == null) throw new Error('Resposta inesperada do banco.');
  return data;
}

export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.SESSION_ENCRYPTION_KEY, iv);
  return {
    iv: iv.toString('base64'),
    data: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}
export function decrypt(value: ReturnType<typeof encrypt>) {
  const cipher = createDecipheriv(
    'aes-256-gcm',
    config.SESSION_ENCRYPTION_KEY,
    Buffer.from(value.iv, 'base64'),
  );
  cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8');
}

export function safeLog(operation: string, issue: unknown) {
  const code = issue && typeof issue === 'object' && 'code' in issue ? issue.code : undefined;
  console.error(
    operation,
    typeof code === 'number' || (typeof code === 'string' && /^[\w-]{1,24}$/.test(code)) ? code : '',
  );
}
