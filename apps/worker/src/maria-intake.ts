import { z } from 'zod';

const intake = z.object({
  intent: z.enum(['schedule', 'other', 'urgent', 'human']),
  name: z.string().trim().min(2).max(200).nullish(),
  specialty: z.string().trim().min(1).max(120).nullish(),
  insurance: z.enum(['particular', 'convenio']).nullish(),
  date: z.iso.date().nullish(),
  confirmed_option: z.number().int().min(1).max(5).nullish(),
});

export const intakeInstruction = `Extraia a triagem administrativa da conversa e retorne apenas um objeto JSON.
Use estas chaves: intent ("schedule", "other", "urgent" ou "human"), name, specialty, insurance ("particular" ou "convenio"), date (YYYY-MM-DD), confirmed_option (número da opção).
Use null para cada dado que o paciente ainda não informou. Use também as respostas anteriores do paciente nesta conversa e não use mensagens da recepção como dados do paciente.
"schedule" inclui pedido de consulta e respostas curtas às perguntas de agendamento. Se a Maria pediu nome e o paciente respondeu "Nome Exemplo", isso é o nome; continue a triagem. "Marcar consulta com cardiologista" é agendamento, mesmo sem data ou convênio.
Use o nome exato de uma especialidade cadastrada quando corresponder ao pedido. Use "human" apenas se a mensagem atual pedir uma pessoa da equipe. Use "urgent" apenas se a mensagem atual relatar uma urgência médica. Pedir uma especialidade médica não é urgência.
Preencha confirmed_option somente se o paciente confirmar claramente uma opção já apresentada. Não invente dados, horários nem reservas.`;

const normalize = (text: string) => text.toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/\p{M}/gu, '').trim();

const ask = (field: string) => ({ name: 'request_details', args: { field } });

export function intakeAction(
  content: string | null | undefined,
  incoming: string,
  specialties: string[],
  offeredPositions: number[],
) {
  const current = normalize(incoming);
  if (/\b(?:quero|preciso|posso|pode|gostaria)\b.{0,35}\b(?:falar|conversar|ser atendid[oa]|encaminhar)\b.{0,25}\b(?:humano|humana|equipe|atendente|recepcao|alguem|pessoa)\b/.test(current)) {
    return { name: 'handoff_to_human', args: { reason: 'human_requested' } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content?.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '') ?? '');
  } catch {
    return ask('clarify');
  }
  const result = intake.safeParse(parsed);
  if (!result.success) return ask('clarify');
  const turn = result.data;
  if (turn.intent === 'urgent') return { name: 'handoff_to_human', args: { reason: 'urgent' } };
  if (turn.intent === 'human' && /\b(?:humano|humana|equipe|atendente|recepcao|secretaria|pessoa real)\b/.test(current)) {
    return { name: 'handoff_to_human', args: { reason: 'human_requested' } };
  }
  if (turn.intent !== 'schedule') return ask('clarify');
  if (!turn.name) return ask('name');
  if (!turn.specialty) return ask('specialty');
  const requestedSpecialty = normalize(turn.specialty);
  const specialty = specialties.find(value => normalize(value) === requestedSpecialty);
  if (!specialty) return { name: 'unavailable_specialty', args: {} };
  if (!turn.insurance) return ask('insurance');
  if (offeredPositions.length && turn.confirmed_option != null) {
    return offeredPositions.includes(turn.confirmed_option)
      ? { name: 'confirm_test_offer', args: {} }
      : ask('selection');
  }
  if (!turn.date) return ask('date');
  return { name: 'check_availability', args: { date: turn.date, specialty } };
}
