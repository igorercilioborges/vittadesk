import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  jidDecode,
  jidNormalizedUser,
  proto,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { db, decrypt, encrypt, mariaScopeForClinic, required, result, safeLog } from './config.js';

const instances = new Map<string, { socket: WASocket; ready: boolean }>();
const retries = new Map<string, number>();
const offlineMessageWindowSeconds = 24 * 60 * 60;
const quiet = () => {};
const socketLogger: NonNullable<Parameters<typeof makeWASocket>[0]['logger']> = {
  level: 'silent',
  child: () => socketLogger,
  trace: quiet,
  debug: quiet,
  info: quiet,
  warn: quiet,
  error: quiet,
};
export const connectedSocket = (clinic: string) => {
  const current = instances.get(clinic);
  return current?.ready ? current.socket : undefined;
};

async function saveStatus(clinic: string, status: string, qr: string | null = null, phone?: string) {
  const updated_at = new Date().toISOString();
  const scope = await mariaScopeForClinic(clinic);
  result(await db.from('whatsapp_qr').upsert({ clinic_id: clinic, qr_code: qr }));
  result(
    await db
      .from('whatsapp_sessions')
      .update({
        status,
        maria_enabled: Boolean(scope),
        updated_at,
        ...(phone ? { phone_number: phone } : {}),
      })
      .eq('clinic_id', clinic),
  );
}

async function authState(clinic: string) {
  const row = result(
    await db.from('whatsapp_credentials').select('session_data').eq('clinic_id', clinic).maybeSingle(),
  );
  const state = row
    ? (JSON.parse(decrypt(row.session_data), BufferJSON.reviver) as {
        creds: AuthenticationCreds;
        keys: Record<string, Record<string, unknown>>;
      })
    : { creds: initAuthCreds(), keys: {} as Record<string, Record<string, unknown>> };
  let tail = Promise.resolve();
  const persist = () => {
    const session_data = encrypt(JSON.stringify(state, BufferJSON.replacer));
    const task = tail
      .catch(() => {})
      .then(async () => {
        result(await db.from('whatsapp_credentials').upsert({ clinic_id: clinic, session_data }));
      });
    tail = task;
    return task;
  };
  return {
    persist,
    auth: {
      creds: state.creds,
      keys: {
        async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
          const items: Record<string, SignalDataTypeMap[T]> = {};
          for (const id of ids) {
            let value = state.keys[type]?.[id];
            if (!value) continue;
            if (type === 'app-state-sync-key')
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
            items[id] = value as SignalDataTypeMap[T];
          }
          return items;
        },
        async set(
          changes: Partial<{ [T in keyof SignalDataTypeMap]: Record<string, SignalDataTypeMap[T] | null> }>,
        ) {
          for (const [type, values] of Object.entries(changes)) {
            const bucket = (state.keys[type] ??= {});
            for (const [id, value] of Object.entries(values ?? {})) {
              if (value === null) delete bucket[id];
              else bucket[id] = value;
            }
          }
          await persist();
        },
      },
    },
  };
}

async function receive(clinic: string, socket: WASocket, message: WAMessage) {
  const jid = message.key.remoteJid;
  const id = message.key.id;
  if (!jid || !id || message.key.fromMe || !/@(s\.whatsapp\.net|lid)$/.test(jid)) return;
  const contents = message.message?.ephemeralMessage?.message ?? message.message;
  const text = contents?.conversation ?? contents?.extendedTextMessage?.text;
  if (!text?.trim()) return;
  const rawPhone = message.key.remoteJidAlt?.endsWith('@s.whatsapp.net')
    ? message.key.remoteJidAlt
    : jid.endsWith('@s.whatsapp.net')
      ? jid
      : await socket.signalRepository.lidMapping.getPNForLID(jid);
  const phone = rawPhone ? jidDecode(rawPhone)?.user : undefined;
  const patient = phone
    ? result(await db.from('patients').select('id').eq('clinic_id', clinic).eq('phone', phone).maybeSingle())
    : null;
  const chat = required(
    await db
      .from('conversations')
      .upsert(
        {
          clinic_id: clinic,
          remote_jid: jidNormalizedUser(jid),
          updated_at: new Date().toISOString(),
          ...(phone ? { phone } : {}),
          ...(patient ? { patient_id: patient.id } : {}),
        },
        { onConflict: 'clinic_id,remote_jid' },
      )
      .select('id')
      .single(),
  );
  result(
    await db.from('messages').upsert(
      {
        clinic_id: clinic,
        conversation_id: chat.id,
        external_id: id,
        body: text.trim().slice(0, 12000),
        sender: 'patient',
        delivery: 'received',
      },
      { onConflict: 'clinic_id,conversation_id,external_id', ignoreDuplicates: true },
    ),
  );
}

async function connect(clinic: string) {
  await saveStatus(clinic, 'disconnected');
  const { auth, persist } = await authState(clinic);
  const socket = makeWASocket({
    auth,
    logger: socketLogger,
    qrTimeout: 20_000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  const instance = { socket, ready: false };
  instances.set(clinic, instance);
  let updates = Promise.resolve();
  socket.ev.on('creds.update', () => {
    if (instances.get(clinic) === instance)
      void persist().catch((issue) => safeLog('Credenciais WhatsApp', issue));
  });
  socket.ev.on('messages.upsert', ({ type, messages }) => {
    if (instances.get(clinic) !== instance) return;
    void (async () => {
      const oldestOfflineMessage = Date.now() / 1000 - offlineMessageWindowSeconds;
      for (const message of messages) {
        // Baileys reports messages queued while the device was offline as append.
        if (type === 'append' && !(Number(message.messageTimestamp) >= oldestOfflineMessage)) continue;
        await receive(clinic, socket, message).catch((issue) => safeLog('Receber WhatsApp', issue));
      }
    })();
  });
  socket.ev.on('connection.update', (update) => {
    updates = updates
      .catch(() => {})
      .then(async () => {
        if (instances.get(clinic) !== instance) return;
        if (update.qr) await saveStatus(clinic, 'qr_ready', update.qr);
        if (update.connection === 'open') {
          instance.ready = true;
          await saveStatus(clinic, 'connected', null, jidDecode(socket.user?.id)?.user);
        }
        if (update.connection === 'close') {
          instance.ready = false;
          const error = update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
          const loggedOut = error?.output?.statusCode === DisconnectReason.loggedOut;
          retries.set(clinic, Date.now() + (loggedOut ? 5000 : 10000));
          try {
            if (loggedOut) {
              await persist().catch(() => {});
              result(await db.from('whatsapp_credentials').delete().eq('clinic_id', clinic));
            }
            await saveStatus(clinic, 'disconnected');
          } finally {
            instances.delete(clinic);
          }
        }
      });
    void updates.catch((issue) => safeLog('Estado WhatsApp', issue));
  });
}

export async function reconcileSessions() {
  const rows = required(await db.from('whatsapp_sessions').select('clinic_id,enabled,status'));
  const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.clinic_id));
  for (const [clinic, instance] of instances) {
    if (enabled.has(clinic)) continue;
    instances.delete(clinic);
    instance.socket.end(undefined);
  }
  for (const row of rows) {
    if (!row.enabled && row.status !== 'disconnected') await saveStatus(row.clinic_id, 'disconnected');
  }
  await Promise.allSettled(
    [...enabled]
      .filter((clinic) => !instances.has(clinic) && (retries.get(clinic) ?? 0) <= Date.now())
      .map((clinic) =>
        connect(clinic).catch((issue) => {
          retries.set(clinic, Date.now() + 10000);
          safeLog('Abrir WhatsApp', issue);
        }),
      ),
  );
}

export function stopSessions() {
  for (const [clinic, instance] of instances) {
    instances.delete(clinic);
    instance.socket.end(undefined);
  }
}
