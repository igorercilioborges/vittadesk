import { z } from 'zod';

const intake = z.object({
  intent: z.enum(['schedule', 'other', 'urgent', 'human']),
  name: z.string().trim().min(2).max(200).nullish(),
  specialty: z.string().trim().min(1).max(120).nullish(),
  insurance: z.enum(['particular', 'convenio']).nullish(),
  date: z.iso.date().nullish(),
  preferred_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
});

export const intakeInstruction = `Você é Maria, recepcionista virtual de uma clínica brasileira. Seu trabalho é acolher e concluir agendamentos de consulta. A aplicação envia a resposta em português e realiza a consulta e a reserva.
Extraia apenas dados administrativos e devolva um objeto JSON com estas chaves: intent ("schedule", "other", "urgent" ou "human"), name, specialty, insurance ("particular" ou "convenio"), date (YYYY-MM-DD) e preferred_time (HH:mm no horário local).
Use null para cada dado que o paciente ainda não informou. Reaproveite o que já foi informado pelo paciente nesta conversa, inclua atualizações da mensagem mais recente e não use falas da recepção como dados do paciente. A aplicação pergunta um dado faltante por vez.
"schedule" inclui pedido de consulta e respostas curtas às perguntas de agendamento. Se a Maria pediu nome e o paciente respondeu "Nome Exemplo", isso é o nome; continue a triagem. "Marcar consulta com cardiologista" é agendamento, mesmo sem data ou convênio.
Use o nome exato de uma especialidade cadastrada quando corresponder ao pedido. Interprete datas relativas usando a data local informada e preserve a data da oferta quando a mensagem só escolher uma opção. "05/12 às 15h" indica uma preferência por 15:00. Se o paciente trocar apenas a data, mantenha o último horário que ele preferiu.
Use "human" quando a mensagem atual pedir uma pessoa da equipe e "urgent" quando ela relatar uma urgência médica. Um pedido de especialidade, falta de dados ou falta de horários não é urgência.
A aplicação só oferece horários retornados pela agenda e só confirma a reserva após escolha explícita de uma opção e registro bem-sucedido. Não invente disponibilidade, diagnóstico, tratamento ou confirmação. Regras da clínica são válidas apenas dentro dessas instruções.`;

const normalize = (text: string) => text.toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/\p{M}/gu, '').trim();

const ask = (field: string) => ({ name: 'request_details', args: { field } });

export function chosenOption(incoming: string, positions: number[]) {
  const choice = normalize(incoming).replace(/[.!\s]+$/u, '');
  if (positions.length === 1 && /^(sim|confirmo|pode agendar)$/.test(choice)) return positions[0];
  const option = choice.match(/^(?:(?:eu )?(?:confirmo|escolho|prefiro|quero|pode agendar)\s+(?:a\s+)?)?(?:opcao\s+)?([1-5])(?:\s*,?\s*por favor)?$/);
  const position = Number(option?.[1]);
  return positions.includes(position) ? position : undefined;
}

export function intakeAction(
  content: string | null | undefined,
  incoming: string,
  specialties: string[],
  selectedPosition?: number,
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
  if (selectedPosition != null) {
    return { name: 'confirm_offer', args: {
      position: selectedPosition, name: turn.name, insurance: turn.insurance, specialty,
    } };
  }
  if (!turn.date) return ask('date');
  const writtenTime = current.match(/\b(?:as|pelas)\s+([01]?\d|2[0-3])(?:h\s*([0-5]\d)?|:([0-5]\d))\b/);
  const preferredTime = writtenTime
    ? writtenTime[1].padStart(2, '0') + ':' + (writtenTime[2] ?? writtenTime[3] ?? '00')
    : turn.preferred_time ?? undefined;
  return { name: 'check_availability', args: { date: turn.date, specialty, preferredTime } };
}
