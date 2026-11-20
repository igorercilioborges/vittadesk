'use client';

import { useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { ptBR } from 'date-fns/locale';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Appointment, type Clinic, type Data, statusLabels } from '@/lib/model';
import type { Write } from './workspace';
import { field, Heading, Modal } from './forms';

function clinicDate(value: string, timezone: string) {
  const [year, month, day, hour = 0, minute = 0] = value.split(/[-T:]/).map(Number);
  const date = new TZDate(year, month - 1, day, hour, minute, timezone);
  if (format(date, "yyyy-MM-dd'T'HH:mm") !== value)
    throw new Error('Horário inválido para o fuso da clínica.');
  return date;
}

export function Agenda({
  data,
  timezone,
  canWrite,
  open,
}: {
  data: Data;
  timezone: string;
  canWrite: boolean;
  open: (row: Appointment | 'new', date?: string) => void;
}) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [date, setDate] = useState(() => new TZDate(Date.now(), timezone));
  const [professional, setProfessional] = useState('');
  const [tag, setTag] = useState('');
  const today = new TZDate(Date.now(), timezone);
  const viewStart =
    view === 'day' ? date : startOfWeek(view === 'month' ? startOfMonth(date) : date, { weekStartsOn: 1 });
  const days = Array.from(
    {
      length:
        view === 'day'
          ? 1
          : view === 'week'
            ? 7
            : Math.ceil((endOfMonth(date).getDate() + ((startOfMonth(date).getDay() + 6) % 7)) / 7) * 7,
    },
    (_, i) => addDays(viewStart, i),
  );
  const shown = data.appointments
    .filter(
      (item) => (!professional || item.professional_id === professional) && (!tag || item.tag_id === tag),
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  function shift(direction: number) {
    setDate((current) =>
      view === 'month'
        ? addMonths(current, direction)
        : addDays(current, direction * (view === 'week' ? 7 : 1)),
    );
  }
  return (
    <>
      <Heading title="Agenda" description="Organize horários e acompanhe os atendimentos.">
        {canWrite && (
          <Button variant="default" onClick={() => open('new', format(date, 'yyyy-MM-dd'))}>
            <CalendarPlus size={17} /> Novo agendamento
          </Button>
        )}
      </Heading>
      <section className="card">
        <div className="toolbar">
          <div className="toolbar-group">
            <Button size="icon" aria-label="Período anterior" onClick={() => shift(-1)}>
              <ChevronLeft size={18} />
            </Button>
            <Button size="icon" aria-label="Próximo período" onClick={() => shift(1)}>
              <ChevronRight size={18} />
            </Button>
            <Button onClick={() => setDate(today)}>Hoje</Button>
            <strong className="capitalize">
              {format(date, view === 'day' ? "dd 'de' MMMM 'de' yyyy" : "MMMM 'de' yyyy", { locale: ptBR })}
            </strong>
          </div>
          <div className="toolbar-group">
            <select
              aria-label="Profissional"
              value={professional}
              onChange={(event) => setProfessional(event.target.value)}
            >
              <option value="">Profissionais</option>
              {data.professionals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select aria-label="Etiqueta" value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">Etiquetas</option>
              {data.appointment_tags.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Visualização"
              value={view}
              onChange={(event) => setView(event.target.value as typeof view)}
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <div className={`calendar ${view}`}>
            {days.map((day) => (
              <div
                className={`calendar-day ${isSameDay(day, today) ? 'current' : ''} ${view === 'month' && !isSameMonth(day, date) ? 'muted' : ''}`}
                key={format(day, 'yyyy-MM-dd')}
              >
                <div className="day-title">
                  <span>{format(day, 'EEE dd', { locale: ptBR })}</span>
                  {canWrite && (
                    <button
                      aria-label={`Agendar em ${format(day, 'dd/MM')}`}
                      onClick={() => open('new', format(day, 'yyyy-MM-dd'))}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                {shown
                  .filter((row) => isSameDay(day, new TZDate(row.start_time, timezone)))
                  .map((row) => {
                    const type = data.appointment_tags.find((item) => item.id === row.tag_id);
                    return (
                      <button
                        key={row.id}
                        className="calendar-event"
                        style={{
                          borderColor: type?.color,
                          backgroundColor: type?.color ? type.color + '15' : undefined,
                        }}
                        onClick={() => open(row)}
                      >
                        <strong>
                          {format(new TZDate(row.start_time, timezone), 'HH:mm')} ·{' '}
                          {data.patients.find((item) => item.id === row.patient_id)?.full_name}
                        </strong>
                        <small>
                          {type?.name} · {statusLabels[row.status]}
                        </small>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function AppointmentForm({
  row,
  preferredDate,
  clinic,
  data,
  write,
  canWrite,
  close,
}: {
  row: Appointment | 'new';
  preferredDate?: string;
  clinic: Clinic;
  data: Data;
  write: Write;
  canWrite: boolean;
  close: () => void;
}) {
  const existing = row === 'new' ? null : row;
  const tz = clinic.settings.timezone || 'America/Sao_Paulo';
  const duration = clinic.settings.duration || 30;
  const defaultStart = existing
    ? format(new TZDate(existing.start_time, tz), "yyyy-MM-dd'T'HH:mm")
    : `${preferredDate || format(new TZDate(Date.now(), tz), 'yyyy-MM-dd')}T09:00`;
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() =>
    format(
      existing
        ? new TZDate(existing.end_time, tz)
        : new TZDate(+clinicDate(defaultStart, tz) + duration * 60000, tz),
      "yyyy-MM-dd'T'HH:mm",
    ),
  );
  const [price, setPrice] = useState(existing?.price ?? data.appointment_tags[0]?.default_price ?? 0);
  return (
    <Modal
      title={existing ? 'Detalhes do agendamento' : 'Novo agendamento'}
      close={close}
      onSave={
        canWrite
          ? async (fields) => {
              const starts = clinicDate(field(fields, 'start_time'), tz);
              const ends = clinicDate(field(fields, 'end_time'), tz);
              if (+ends <= +starts) throw new Error('Informe um término posterior ao início.');
              const values = {
                patient_id: field(fields, 'patient_id'),
                professional_id: field(fields, 'professional_id'),
                tag_id: field(fields, 'tag_id'),
                start_time: starts.toISOString(),
                end_time: ends.toISOString(),
                price: Number(field(fields, 'price')),
                status: field(fields, 'status'),
                payment_status: field(fields, 'payment_status'),
              };
              if (
                ['scheduled', 'confirmed', 'completed'].includes(values.status) &&
                data.appointments.some(
                  (item) =>
                    item.id !== existing?.id &&
                    item.professional_id === values.professional_id &&
                    ['scheduled', 'confirmed', 'completed'].includes(item.status) &&
                    Date.parse(item.start_time) < +ends &&
                    Date.parse(item.end_time) > +starts,
                )
              )
                throw new Error('O profissional já tem um atendimento nesse horário.');
              await write(
                'appointments',
                existing ? 'update' : 'insert',
                existing ? values : { ...values, created_by: 'human' },
                existing?.id,
              );
            }
          : undefined
      }
    >
      <fieldset disabled={!canWrite} className="form-grid">
        <label>
          Paciente
          <select aria-label="Paciente" name="patient_id" required defaultValue={existing?.patient_id ?? ''}>
            <option value="">Selecione</option>
            {data.patients.map((item) => (
              <option value={item.id} key={item.id}>
                {item.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select
            aria-label="Profissional"
            name="professional_id"
            required
            defaultValue={existing?.professional_id ?? ''}
          >
            <option value="">Selecione</option>
            {data.professionals
              .filter((item) => item.active || item.id === existing?.professional_id)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Etiqueta
          <select
            aria-label="Etiqueta"
            name="tag_id"
            required
            defaultValue={existing?.tag_id ?? data.appointment_tags[0]?.id ?? ''}
            onChange={(event) =>
              setPrice(
                data.appointment_tags.find((item) => item.id === event.target.value)?.default_price ?? 0,
              )
            }
          >
            {!data.appointment_tags.length && <option value="">Cadastre uma etiqueta</option>}
            {data.appointment_tags.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor (R$)
          <input
            name="price"
            type="number"
            min="0"
            step=".01"
            required
            value={price}
            onChange={(event) => setPrice(Number(event.target.value))}
          />
        </label>
        <label>
          Início
          <input
            type="datetime-local"
            name="start_time"
            required
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              if (!existing && event.target.value) {
                try {
                  setEnd(
                    format(
                      new TZDate(+clinicDate(event.target.value, tz) + duration * 60000, tz),
                      "yyyy-MM-dd'T'HH:mm",
                    ),
                  );
                } catch {
                  setEnd('');
                }
              }
            }}
          />
        </label>
        <label>
          Término
          <input
            type="datetime-local"
            name="end_time"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <label>
          Status
          <select aria-label="Status" name="status" defaultValue={existing?.status ?? 'scheduled'}>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pagamento
          <select
            aria-label="Pagamento"
            name="payment_status"
            defaultValue={existing?.payment_status ?? 'pending'}
          >
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
          </select>
        </label>
      </fieldset>
    </Modal>
  );
}
