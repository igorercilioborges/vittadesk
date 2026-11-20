import { db, required } from './config.js';
import type { Slot } from './database.js';

const DAY_MS = 86_400_000;
const DAY_SEARCH = 7;
const PAGE_SIZE = 500;
const SHOW_SLOTS = 5;
const localDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' });

export function addCalendarDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

async function readSlots(clinic: string, date: string, specialty: string, includeAll: boolean) {
  const query = () => db.rpc('clinic_slots', { p_clinic: clinic, p_day: date, p_specialty: specialty });
  if (!includeAll) return required(await query().limit(SHOW_SLOTS));

  const rows: Slot[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = required(await query().range(offset, offset + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export async function consultationOptions(
  clinic: string,
  requestedDate: string,
  lastDate: string,
  specialty: string,
  timezone: string,
  hours?: Record<string, [string, string]>,
  preferredTime?: string,
) {
  const localTime = preferredTime
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : null;
  const requestedDay = new Date(requestedDate);
  const weekday = String(requestedDay.getUTCDay() || 7);
  const noSlots = hours && !hours[weekday]
    ? `A clínica não tem expediente em ${localDate.format(requestedDay)}.`
    : `Não há horários livres para essa especialidade em ${localDate.format(requestedDay)}.`;

  for (let offset = 0; offset <= DAY_SEARCH; offset++) {
    const date = addCalendarDays(requestedDate, offset);
    if (date > lastDate) break;
    const slots = await readSlots(clinic, date, specialty, Boolean(preferredTime));
    if (!slots.length) continue;
    const ranked = preferredTime && localTime
      ? slots.map(slot => {
        const distance = Math.abs(minutes(localTime.format(new Date(slot.start_time))) - minutes(preferredTime));
        return { slot, distance };
      }).sort((a, b) => a.distance - b.distance)
      : null;
    const explanation = offset
      ? `${noSlots} A próxima data com vaga é ${localDate.format(new Date(date))}.`
      : ranked && ranked[0].distance > 0 ? `Às ${preferredTime} não há vaga nesse dia. Veja os horários mais próximos.` : '';
    return { explanation, slots: ranked ? ranked.slice(0, SHOW_SLOTS).map(entry => entry.slot) : slots };
  }
  return { explanation: noSlots, slots: [] };
}
