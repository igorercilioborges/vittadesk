import { db, required, result, safeLog } from './config.js';
import { connectedSocket } from './whatsapp.js';

export async function recoverOutbox() {
  result(
    await db
      .from('messages')
      .update({ delivery: 'queued' })
      .eq('delivery', 'processing')
      .lte('next_attempt', new Date().toISOString()),
  );
}
export async function sendOutbox() {
  const sessions = required(
    await db.from('whatsapp_sessions').select('clinic_id').eq('enabled', true).eq('status', 'connected'),
  );
  await Promise.all(
    sessions.map(async (session) => {
      const clinic = session.clinic_id;
      const socket = connectedSocket(clinic);
      if (!socket) return;
      const rows = required(
        await db
          .from('messages')
          .select('id,conversation_id,body,sender,external_id,send_attempts')
          .eq('clinic_id', clinic)
          .eq('delivery', 'queued')
          .lte('next_attempt', new Date().toISOString())
          .order('created_at')
          .limit(10),
      );
      for (const row of rows) {
        const pick = () =>
          db
            .from('messages')
            .update({
              delivery: 'processing',
              send_attempts: row.send_attempts + 1,
              next_attempt: new Date(Date.now() + 90000).toISOString(),
            })
            .eq('clinic_id', clinic)
            .eq('id', row.id)
            .eq('delivery', 'queued')
            .select('id')
            .maybeSingle();
        const mark = (delivery: string) =>
          db.from('messages').update({ delivery }).eq('clinic_id', clinic).eq('id', row.id);
        try {
          if (!result(await pick())) continue;
          const chat = required(
            await db
              .from('conversations')
              .select('remote_jid,is_bot_paused')
              .eq('clinic_id', clinic)
              .eq('id', row.conversation_id)
              .single(),
          );
          if (chat.is_bot_paused && row.sender === 'maria' && !row.external_id?.startsWith('handoff:')) {
            result(await mark('failed'));
            continue;
          }
          const sent = await socket.sendMessage(
            chat.remote_jid,
            { text: row.body },
            { messageId: row.id.replaceAll('-', '').toUpperCase() },
          );
          if (!sent?.key.id) throw new Error('WhatsApp sem confirmação de envio.');
          result(await mark('sent'));
        } catch (issue) {
          safeLog('Enviar WhatsApp', issue);
          const retry = row.send_attempts < 3;
          const next_attempt = new Date(Date.now() + 10000 * 3 ** row.send_attempts).toISOString();
          result(
            await db
              .from('messages')
              .update({ delivery: retry ? 'queued' : 'failed', next_attempt })
              .eq('clinic_id', clinic)
              .eq('id', row.id),
          );
        }
      }
    }),
  );
}
