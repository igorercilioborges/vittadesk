import nodemailer from 'nodemailer';
import { db, decrypt, encrypt, required, result, safeLog } from './config.js';

const smtp = (user: string, pass: string) =>
  nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

export async function configureMail(
  clinic: string,
  email: string,
  password: string | undefined,
  dailySummary: boolean,
) {
  if (password) await smtp(email, password).verify();
  result(
    await db.rpc('configure_gmail', {
      p_clinic: clinic,
      p_email: email,
      p_tokens: password ? encrypt(password) : null,
      p_summary: dailySummary && Boolean(password),
    }),
  );
}

export async function pollConfirmations() {
  const jobs = required(
    await db
      .from('confirmation_jobs')
      .select('*')
      .is('sent_at', null)
      .lt('attempts', 8)
      .lte('next_attempt', new Date().toISOString())
      .order('next_attempt')
      .limit(5),
  );
  await Promise.all(
    jobs.map(async (job) => {
      const clinic = job.clinic_id;
      const key = () =>
        db
          .from('confirmation_jobs')
          .update({
            attempts: job.attempts + 1,
            next_attempt: new Date(Date.now() + Math.min(3600, 60 * 2 ** job.attempts) * 1000).toISOString(),
          })
          .eq('clinic_id', clinic)
          .eq('appointment_id', job.appointment_id);
      try {
        result(await key());
        const [integration, credentials, appointment, clinicRow] = await Promise.all([
          db
            .from('gmail_integrations')
            .select('email_address,active')
            .eq('clinic_id', clinic)
            .maybeSingle()
            .then(result),
          db
            .from('gmail_credentials')
            .select('token_data')
            .eq('clinic_id', clinic)
            .maybeSingle()
            .then(result),
          db
            .from('appointments')
            .select('patient_id,start_time,status')
            .eq('clinic_id', clinic)
            .eq('id', job.appointment_id)
            .single()
            .then(required),
          db.from('clinics').select('name,settings').eq('id', clinic).single().then(required),
        ]);
        if (
          !integration?.active ||
          !credentials ||
          appointment.status !== 'confirmed' ||
          Date.parse(appointment.start_time) <= Date.now()
        )
          return;
        const patient = required(
          await db
            .from('patients')
            .select('email,full_name')
            .eq('clinic_id', clinic)
            .eq('id', appointment.patient_id)
            .single(),
        );
        if (!patient.email) return;
        const time = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: clinicRow.settings?.timezone ?? 'America/Sao_Paulo',
        }).format(new Date(appointment.start_time));
        await smtp(integration.email_address, decrypt(credentials.token_data)).sendMail({
          to: { name: patient.full_name, address: patient.email },
          from: { name: clinicRow.name, address: integration.email_address },
          messageId: `<appointment-${job.appointment_id}@vittadesk.local>`,
          subject: 'Confirmação de agendamento',
          text: `Olá, ${patient.full_name}. Seu atendimento na clínica ${clinicRow.name} está confirmado para ${time}.`,
        });
        result(
          await db
            .from('confirmation_jobs')
            .update({ sent_at: new Date().toISOString() })
            .eq('clinic_id', clinic)
            .eq('appointment_id', job.appointment_id),
        );
      } catch (issue) {
        safeLog('Confirmar por Gmail', issue);
      }
    }),
  );
}

export async function pollSummaries() {
  const integrations = required(
    await db
      .from('gmail_integrations')
      .select('clinic_id,email_address,last_summary_day')
      .eq('active', true)
      .eq('daily_summary', true),
  );
  for (const integration of integrations) {
    try {
      const clinic = integration.clinic_id;
      const clinicRow = required(await db.from('clinics').select('name,settings').eq('id', clinic).single());
      const tz = clinicRow.settings?.timezone ?? 'America/Sao_Paulo';
      const clock = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      });
      const parts = Object.fromEntries(
        clock.formatToParts(new Date()).map((part) => [part.type, part.value]),
      );
      const today = `${parts.year}-${parts.month}-${parts.day}`;
      if (Number(parts.hour) < 8) continue;
      const day = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
      if (integration.last_summary_day && integration.last_summary_day >= day) continue;
      const credential = required(
        await db.from('gmail_credentials').select('token_data').eq('clinic_id', clinic).single(),
      );
      const [totals] = required(await db.rpc('clinic_daily_totals', { p_clinic: clinic, p_day: day }));
      if (!totals) continue;
      const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        totals.realized,
      );
      const localDay = day.split('-').reverse().join('/');
      await smtp(integration.email_address, decrypt(credential.token_data)).sendMail({
        from: integration.email_address,
        to: integration.email_address,
        messageId: `<summary-${clinic}-${day}@vittadesk.local>`,
        subject: `Resumo da clínica · ${localDay}`,
        text: `${clinicRow.name} · ${localDay}\nConcluídos: ${totals.completed}\nAgendados/confirmados: ${totals.scheduled}\nFaltas: ${totals.missed}\nReceita realizada: ${money}`,
      });
      result(await db.from('gmail_integrations').update({ last_summary_day: day }).eq('clinic_id', clinic));
    } catch (issue) {
      safeLog('Resumo diário Gmail', issue);
    }
  }
}
