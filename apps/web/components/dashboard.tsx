'use client';

import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Users,
} from 'lucide-react';
import { addDays, format, isSameDay, startOfMonth, subMonths } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { ptBR } from 'date-fns/locale';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import { type Appointment, type Data, money, nameInitials, statusLabels } from '@/lib/model';

export const isFuture = (appointment: Appointment, now = Date.now()) =>
  ['scheduled', 'confirmed'].includes(appointment.status) && Date.parse(appointment.start_time) >= now;
export const sum = (rows: Appointment[]) => rows.reduce((total, row) => total + Number(row.price), 0);

export function Dashboard({
  data,
  timezone,
  openAgenda,
  edit,
}: {
  data: Data;
  timezone: string;
  openAgenda: () => void;
  edit: (row: Appointment) => void;
}) {
  const [period, setPeriod] = useState('month');
  const [granularity, setGranularity] = useState<'daily' | 'monthly'>('daily');
  const now = new TZDate(Date.now(), timezone);
  const from = period === 'previous' ? startOfMonth(subMonths(now, 1)) : startOfMonth(now);
  const until = startOfMonth(addDays(from, 32));
  const monthly = data.appointments.filter(
    (row) => Date.parse(row.start_time) >= +from && Date.parse(row.start_time) < +until,
  );
  const completed = monthly.filter((row) => row.status === 'completed');
  const noShow = monthly.filter((row) => row.status === 'no_show').length;
  const future = data.appointments.filter((row) => isFuture(row, +now));
  const rate = completed.length + noShow ? (completed.length / (completed.length + noShow)) * 100 : 0;
  const today = data.appointments
    .filter((row) => isSameDay(new TZDate(row.start_time, timezone), now))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const days = new TZDate(from.getFullYear(), from.getMonth() + 1, 0, timezone).getDate();
  const buckets = Array.from({ length: granularity === 'daily' ? days : 6 }, (_, index) => {
    const start = granularity === 'daily' ? addDays(from, index) : startOfMonth(subMonths(until, 6 - index));
    const end = granularity === 'daily' ? addDays(start, 1) : startOfMonth(subMonths(until, 5 - index));
    const slice = (granularity === 'daily' ? monthly : data.appointments).filter(
      (row) => Date.parse(row.start_time) >= +start && Date.parse(row.start_time) < +end,
    );
    return {
      day: format(start, granularity === 'daily' ? 'dd MMM' : 'MMM yyyy', { locale: ptBR }).replace('.', ''),
      realizado: sum(slice.filter((row) => row.status === 'completed')),
      projetado: sum(slice.filter((row) => row.status === 'completed' || isFuture(row, +now))),
    };
  });
  const distribution = data.appointment_tags
    .map((tag) => ({
      name: tag.name,
      value: monthly.filter((row) => row.tag_id === tag.id && row.status !== 'cancelled').length,
      color: tag.color,
    }))
    .filter((row) => row.value > 0);
  const kpis = [
    {
      label: 'Atendimentos realizados',
      value: completed.length.toString(),
      note: 'Consultas concluídas no mês',
      icon: CalendarCheck,
      tone: 'sky',
    },
    {
      label: 'Atendimentos futuros',
      value: future.length.toString(),
      note: 'Na agenda da clínica',
      icon: CalendarDays,
      tone: 'indigo',
    },
    {
      label: 'Taxa de comparecimento',
      value: rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%',
      note: 'Entre consultas concluídas e faltas',
      icon: Users,
      tone: 'mint',
    },
    {
      label: 'Faturamento realizado',
      value: money.format(sum(completed)),
      note: `Proj. ${money.format(sum(completed) + sum(monthly.filter((row) => isFuture(row, +now))))}`,
      icon: CircleDollarSign,
      tone: 'blue',
    },
  ];
  return (
    <>
      <div className="hero">
        <div className="hero-content">
          <div className="hero-date">
            <CalendarDays size={15} /> {format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </div>
          <h1>Visão geral</h1>
          <p>Acompanhe os atendimentos e os resultados da sua clínica.</p>
        </div>
        <svg className="hero-art" viewBox="0 0 430 156" fill="none" aria-hidden="true">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" stroke="#93C5FD" strokeOpacity=".28" />
            </pattern>
          </defs>
          <path fill="url(#grid)" d="M50 0h380v156H50z" />
          <circle cx="309" cy="84" r="123" stroke="#93C5FD" strokeOpacity=".52" />
          <circle cx="309" cy="84" r="94" stroke="#93C5FD" strokeOpacity=".55" />
          <circle cx="309" cy="84" r="65" stroke="#93C5FD" strokeOpacity=".55" />
          <path d="M17 86h153l14-17 18 37 24-58 18 38h186" stroke="#60A5FA" strokeWidth="1.5" />
          <rect
            x="285"
            y="38"
            width="84"
            height="84"
            rx="23"
            fill="#F4FAFF"
            fillOpacity=".87"
            stroke="#B5DAFF"
            transform="rotate(-12 327 80)"
          />
          <path
            d="M325 57a3 3 0 0 0-3 3v13h-13a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h13v13a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V86h13a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3h-13V60a3 3 0 0 0-3-3z"
            fill="#3B82F6"
            fillOpacity=".79"
            transform="rotate(-12 327 80)"
          />
          <circle cx="251" cy="36" r="4" fill="#60A5FA" />
          <circle cx="383" cy="126" r="5" fill="#60A5FA" />
          <circle cx="154" cy="86" r="3" fill="#93C5FD" />
        </svg>
      </div>
      <div className="section-line">
        <h2>Indicadores</h2>
        <label className="period">
          <CalendarDays size={15} />
          <select
            aria-label="Período dos indicadores"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="month">Este mês</option>
            <option value="previous">Mês anterior</option>
          </select>
          <ChevronDown size={14} />
        </label>
      </div>
      <div className="kpi-grid">
        {kpis.map(({ label, value, note, icon: Icon, tone }) => (
          <article className="card kpi" key={label}>
            <div className="kpi-top">
              <span className={`tile-icon ${tone}`}>
                <Icon size={19} />
              </span>
              <span>{label}</span>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="charts">
        <section className="card chart-panel">
          <div className="section-line">
            <div className="panel-title">
              <h2>Evolução do faturamento</h2>
              <p>Receita realizada e projetada no período</p>
            </div>
            <select
              className="chart-period"
              aria-label="Escala do faturamento"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as typeof granularity)}
            >
              <option value="daily">Diária</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
          <div className="legend">
            <span>
              <i />
              Realizado
            </span>
            <span>
              <i className="light" />
              Projetado
            </span>
          </div>
          <div className="line-chart" role="img" aria-label="Gráfico de receita realizada e projetada">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={buckets} margin={{ top: 8, left: -9, right: 13, bottom: 0 }}>
                <defs>
                  <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity=".23" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity=".025" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E8EFF7" strokeDasharray="4 4" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  interval={granularity === 'daily' ? Math.floor(days / 6) : 'preserveStartEnd'}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(value) => (value >= 1000 ? `R$ ${value / 1000}k` : `R$ ${value}`)}
                />
                <Tooltip formatter={(value) => money.format(Number(value))} />
                <Area
                  type="monotone"
                  name="Projetado"
                  dataKey="projetado"
                  fill="none"
                  stroke="#7AB5FF"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  name="Realizado"
                  dataKey="realizado"
                  fill="url(#area)"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card chart-panel">
          <div className="panel-title">
            <h2>Tipos de atendimento</h2>
            <p>Distribuição por etiqueta no período</p>
          </div>
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={distribution}
                  nameKey="name"
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={53}
                  outerRadius={72}
                  paddingAngle={distribution.length > 1 ? 3 : 0}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {distribution.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <span className="donut-label">
              <strong>{distribution.reduce((a, b) => a + b.value, 0)}</strong>
              <small>consultas</small>
            </span>
          </div>
          <div className="distribution">
            {distribution.length ? (
              distribution.map((row) => (
                <div key={row.name}>
                  <i style={{ background: row.color }} />
                  <span>{row.name}</span>
                  <strong>{row.value}</strong>
                </div>
              ))
            ) : (
              <p className="muted">Nenhum atendimento no período.</p>
            )}
          </div>
        </section>
      </div>
      <section className="card today">
        <div className="section-line">
          <div className="panel-title">
            <h2>Agenda de hoje</h2>
            <p>Atendimentos previstos para o dia</p>
          </div>
          <button className="text-button" onClick={openAgenda}>
            Ver agenda <ArrowRight size={16} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Paciente</th>
                <th>Profissional</th>
                <th>Etiqueta</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {today.length ? (
                today.map((row) => {
                  const patient = data.patients.find((p) => p.id === row.patient_id)?.full_name ?? '—';
                  const tag = data.appointment_tags.find((item) => item.id === row.tag_id);
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{format(new TZDate(row.start_time, timezone), 'HH:mm')}</strong>
                      </td>
                      <td>
                        <button className="patient-link" onClick={() => edit(row)}>
                          <span className="avatar mini">{nameInitials(patient)}</span>
                          {patient}
                        </button>
                      </td>
                      <td>{data.professionals.find((p) => p.id === row.professional_id)?.name}</td>
                      <td>
                        <span
                          className="tag"
                          style={{ background: tag ? tag.color + '16' : undefined, color: tag?.color }}
                        >
                          {tag?.name}
                        </span>
                      </td>
                      <td>
                        <span className={`tag status-${row.status}`}>{statusLabels[row.status]}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5}>
                    <span className="empty">
                      <Activity size={18} /> Nenhum atendimento para hoje.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
