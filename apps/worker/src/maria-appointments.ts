import { db, required, result } from './config.js';
import { addCalendarDays } from './maria-availability.js';

const statusText: Record<string, string> = {
  scheduled: 'agendada',
  confirmed: 'confirmada',
  completed: 'concluída',
  cancelled: 'cancelada',
  no_show: 'registrada como não comparecimento',
};

export async function answerAboutAppointment(
  clinic: string,
  patient: string | null,
  timezone: string,
  professionals: Map<string, string>,
  reference: { date?: string | null; time?: string | null; detail: 'summary' | 'payment' },
) {
  if (!patient) return 'Não encontrei uma consulta vinculada a este contato. Você pode me informar a data para que a equipe confira?';
  const base = () => db.from('appointments').select('start_time,status,professional_id')
    .eq('clinic_id', clinic).eq('patient_id', patient);
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' });
  const localTime = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, timeStyle: 'short' });
  const clock = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
  const now = new Date().toISOString();
  const list = reference.date
    ? required(await base().gte('start_time', addCalendarDays(reference.date, -1))
      .lt('start_time', addCalendarDays(reference.date, 2)).order('start_time').limit(30))
    : required(await base().gte('start_time', now).in('status', ['scheduled', 'confirmed']).order('start_time').limit(6));
  const rows = !reference.date && !list.length
    ? required(await base().lt('start_time', now).order('start_time', { ascending: false }).limit(1))
    : list;
  const matches = rows.filter((row) => {
    const start = new Date(row.start_time);
    return (!reference.date || localDate.format(start) === reference.date) &&
      (!reference.time || localTime.format(start) === reference.time);
  });
  if (!matches.length) return 'Não localizei uma consulta com esses dados. Qual foi a data ou o horário que você recebeu na confirmação?';
  const details = matches.map((row) => {
    const professional = professionals.get(row.professional_id);
    return `${clock.format(new Date(row.start_time))}${professional ? ` com ${professional}` : ''} (${statusText[row.status] ?? row.status})`;
  });
  const answer = details.length === 1
    ? `Claro! Encontrei sua consulta de ${details[0]}.`
    : `Encontrei ${details.length} consultas no seu cadastro\n${details.map(detail => `• ${detail}`).join('\n')}\nQual delas você quer conferir?`;
  if (reference.detail !== 'payment') return answer;
  const patientRecord = result(await db.from('patients').select('insurance_type')
    .eq('clinic_id', clinic).eq('id', patient).maybeSingle());
  const payment = patientRecord ? (patientRecord.insurance_type === 'convenio' ? 'convênio' : 'particular') : null;
  const registered = payment ? ` Seu cadastro está como ${payment}.` : '';
  return `${answer}${registered}\nPosso chamar a equipe para confirmar a forma de atendimento dessa consulta.`;
}
