import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config, db, mariaTest, result, safeLog } from './config.js';
import { configureMail, pollConfirmations, pollSummaries } from './mail.js';
import { pollMaria } from './maria.js';
import { recoverOutbox, sendOutbox } from './outbox.js';
import { reconcileSessions, stopSessions } from './whatsapp.js';

const owner = randomUUID();
let leader = false;
let shuttingDown = false;
let polling = false;
let leaseUntil = 0;
let nextMaintenance = 0;
const activeJobs = new Set<string>();

function run(name: string, task: () => Promise<unknown>) {
  if (activeJobs.has(name)) return;
  activeJobs.add(name);
  void task()
    .catch((issue) => safeLog(name, issue))
    .finally(() => activeJobs.delete(name));
}

async function tick() {
  if (polling || shuttingDown) return;
  polling = true;
  try {
    if (Date.now() + 60000 >= leaseUntil) {
      const acquired = result(await db.rpc('claim_worker', { p_owner: owner }));
      if (!acquired) {
        leader = false;
        stopSessions();
        return;
      }
      leaseUntil = Date.now() + 90000;
      if (!leader) await recoverOutbox();
      leader = true;
    }
    run('Gerenciar sessões', reconcileSessions);
    run('Fila WhatsApp', sendOutbox);
    run('Fila Gmail', pollConfirmations);
    run('Fila Maria', pollMaria);
    if (Date.now() >= nextMaintenance) {
      nextMaintenance = Date.now() + 60000;
      run('Recuperar envios interrompidos', recoverOutbox);
      run('Resumos Gmail', pollSummaries);
    }
  } catch (issue) {
    safeLog('Coordenação do worker', issue);
    if (Date.now() + 10000 > leaseUntil) {
      leader = false;
      stopSessions();
    }
  } finally {
    polling = false;
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    active: leader,
    mariaConfigured: Boolean(mariaTest || config.OPENAI_API_KEY),
    mariaProvider: config.MARIA_PROVIDER,
    mariaTestOnly: Boolean(mariaTest),
  });
});
app.use('/gmail', (req, res, next) => {
  if (req.get('Origin') === new URL(config.WEB_ORIGIN).origin) {
    res.set('Access-Control-Allow-Origin', new URL(config.WEB_ORIGIN).origin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const gmailSchema = z.object({
  clinicId: z.uuid(),
  email: z.email(),
  dailySummary: z.boolean().default(false),
  password: z
    .string()
    .regex(/^[a-zA-Z]{16}$/)
    .optional(),
});
app.post('/gmail', async (req, res) => {
  const parsed = gmailSchema.safeParse(req.body);
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) {
    res.sendStatus(401);
    return;
  }
  if (!parsed.success) {
    res.sendStatus(400);
    return;
  }
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      res.sendStatus(401);
      return;
    }
    const member = result(
      await db
        .from('clinic_members')
        .select('role')
        .eq('clinic_id', parsed.data.clinicId)
        .eq('user_id', data.user.id)
        .maybeSingle(),
    );
    if (!member || !['admin', 'manager'].includes(member.role)) {
      res.sendStatus(403);
      return;
    }
    await configureMail(
      parsed.data.clinicId,
      parsed.data.email,
      parsed.data.password,
      parsed.data.dailySummary,
    );
    res.sendStatus(204);
  } catch (issue) {
    safeLog('Configurar Gmail', issue);
    res.sendStatus(422);
  }
});

const server = app.listen(config.PORT, '0.0.0.0', () => console.log('Worker VittaDesk pronto'));
const timer = setInterval(() => void tick(), 1000);
void tick();
function shutdown() {
  shuttingDown = true;
  clearInterval(timer);
  stopSessions();
  server.close();
  // Let the lease expire so a rolling deployment cannot overlap ongoing work.
  setTimeout(() => process.exit(0), 20000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
