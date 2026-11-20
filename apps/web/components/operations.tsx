'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TZDate } from '@date-fns/tz';
import { format, isSameDay } from 'date-fns';
import {
  Bot,
  CalendarCheck,
  Headphones,
  Mail,
  MessageCircle,
  Monitor,
  Pause,
  Play,
  ScanLine,
  Send,
  Sparkles,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { type Clinic, type Data, nameInitials, statusLabels } from '@/lib/model';
import { supabase } from '@/lib/supabase';
import type { Write } from './workspace';
import { field, Heading, Modal } from './forms';

export function ChatDesk({
  data,
  write,
  canWrite,
  timezone,
}: {
  data: Data;
  write: Write;
  canWrite: boolean;
  timezone: string;
}) {
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const whatsappEnabled = data.whatsapp_sessions.some((session) => session.enabled);
  useEffect(() => {
    if (!supabase || !workerUrl || !whatsappEnabled) return;
    const controller = new AbortController();
    const wake = () => {
      if (document.visibilityState === 'visible')
        void wakeWhatsAppWorker(controller.signal).catch(() => {});
    };
    wake();
    const timer = setInterval(wake, 5 * 60_000);
    document.addEventListener('visibilitychange', wake);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [whatsappEnabled]);
  const chats = data.conversations.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const chat = chats.find((row) => row.id === selected) ?? chats[0];
  const patient = data.patients.find((row) => row.id === chat?.patient_id);
  const title = patient?.full_name || chat?.phone || 'Contato do WhatsApp';
  const messages = data.messages
    .filter((row) => row.conversation_id === chat?.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [lastMessageId]);
  const history = data.appointments
    .filter((row) => row.patient_id === patient?.id)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!chat || !message.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await write('messages', 'insert', { conversation_id: chat.id, sender: 'human', body: message.trim() });
      setMessage('');
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Atendimento"
        description="Acompanhe conversas e assuma o atendimento quando precisar."
      />
      <section className="card chat-grid">
        <aside className="chat-list">
          <h2>Conversas</h2>
          {chats.length ? (
            chats.map((row) => {
              const name =
                data.patients.find((item) => item.id === row.patient_id)?.full_name ||
                row.phone ||
                'Contato do WhatsApp';
              return (
                <button
                  className={chat.id === row.id ? 'selected' : ''}
                  key={row.id}
                  onClick={() => {
                    setSelected(row.id);
                    setMessage('');
                    setError('');
                  }}
                >
                  <span className="avatar">{nameInitials(name)}</span>
                  <span>
                    <strong>{name}</strong>
                    <small>{row.is_bot_paused ? 'Atendimento humano' : 'Maria disponível'}</small>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="empty">Nenhuma conversa.</p>
          )}
        </aside>
        <div className="chat-main">
          {chat ? (
            <>
              <header>
                <strong>{title}</strong>
                {canWrite && (
                  <Button
                    onClick={async () => {
                      try {
                        setError('');
                        await write(
                          'conversations',
                          'update',
                          { is_bot_paused: !chat.is_bot_paused },
                          chat.id,
                        );
                      } catch (issue) {
                        setError((issue as Error).message);
                      }
                    }}
                  >
                    {chat.is_bot_paused ? <Play size={15} /> : <Pause size={15} />}{' '}
                    {chat.is_bot_paused ? 'Retomar Maria' : 'Pausar Maria'}
                  </Button>
                )}
              </header>
              <div className="messages">
                {messages.map((row) => (
                  <div key={row.id} className={`bubble ${row.sender}`}>
                    <small>
                      {row.sender === 'patient' ? title : row.sender === 'maria' ? 'Maria' : 'Equipe'}
                    </small>
                    <p>{row.body}</p>
                    <small>
                      {format(new TZDate(row.created_at, timezone), 'HH:mm')}
                      {row.delivery === 'failed'
                        ? ' · Falha no envio'
                        : row.delivery === 'queued'
                          ? ' · Na fila'
                          : ''}
                    </small>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              {canWrite && (
                <form className="composer" onSubmit={send}>
                  <input
                    aria-label="Mensagem"
                    placeholder="Escreva uma mensagem..."
                    value={message}
                    maxLength={12000}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <Button
                    variant="default"
                    aria-label="Enviar mensagem"
                    type="submit"
                    disabled={!message.trim() || busy}
                  >
                    <Send size={17} />
                  </Button>
                </form>
              )}
            </>
          ) : (
            <p className="empty">
              <MessageCircle size={20} /> Selecione uma conversa.
            </p>
          )}
        </div>
        <aside className="chat-record">
          <h2>Ficha do paciente</h2>
          {patient ? (
            <>
              <strong>{patient.full_name}</strong>
              <p>+{patient.phone}</p>
              <p>{patient.insurance_type === 'convenio' ? 'Convênio' : 'Particular'}</p>
            </>
          ) : (
            <p className="muted">Nenhum paciente vinculado.</p>
          )}
          <h3>Agendamentos</h3>
          {history.slice(0, 5).map((row) => (
            <p key={row.id}>
              {format(new TZDate(row.start_time, timezone), 'dd/MM HH:mm')} · {statusLabels[row.status]}
            </p>
          ))}
        </aside>
      </section>
    </>
  );
}

export function Agents({
  data,
  clinic,
  write,
  canManage,
}: {
  data: Data;
  clinic: Clinic;
  write: Write;
  canManage: boolean;
}) {
  const [rules, setRules] = useState(false);
  const tz = clinic.settings.timezone || 'America/Sao_Paulo';
  const now = new TZDate(Date.now(), tz);
  const events = data.agent_events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const today = events.filter((row) => isSameDay(now, new TZDate(row.created_at, tz)));
  const latest = events.find((row) => ['processing', 'scheduling', 'idle'].includes(row.action_type));
  const state = !data.whatsapp_sessions.some((row) => row.status === 'connected' && row.maria_enabled)
    ? 'Offline'
    : !latest || Date.now() - Date.parse(latest.created_at) > 120000
      ? 'Online'
      : latest.action_type === 'processing'
        ? 'Atendendo'
        : latest.action_type === 'scheduling'
          ? 'Agendando'
          : 'Online';
  return (
    <>
      <Heading title="Escritório virtual" description="Acompanhe a atividade dos agentes da clínica.">
        {canManage && <Button onClick={() => setRules(true)}>Configurar Maria</Button>}
      </Heading>
      <section className="office" aria-label="Estações do escritório virtual">
        <article className="station card">
          <span className="tile-icon sky">
            <Bot size={24} />
          </span>
          <h2>Maria</h2>
          <p>Triagem e agendamento</p>
          <span className={`tag ${state === 'Offline' ? 'status-cancelled' : 'status-confirmed'}`}>
            {state}
          </span>
        </article>
        {[
          ['Confirmação ativa', CalendarCheck],
          ['Pós-consulta', Headphones],
        ].map(([label, icon]) => {
          const Icon = icon as typeof Monitor;
          return (
            <article className="station card future-station" key={String(label)}>
              <span className="tile-icon blue">
                <Icon size={24} />
              </span>
              <h2>{String(label)}</h2>
              <span className="tag">Em breve</span>
            </article>
          );
        })}
      </section>
      <div className="charts">
        <section className="card record-panel">
          <div className="panel-title">
            <h2>Métricas de hoje</h2>
          </div>
          <p>
            Triagens concluídas <strong>{today.filter((row) => row.action_type === 'triage').length}</strong>
          </p>
          <p>
            Consultas marcadas{' '}
            <strong>{today.filter((row) => row.action_type === 'appointment_booked').length}</strong>
          </p>
        </section>
        <section className="card record-panel">
          <div className="panel-title">
            <h2>Atividade recente</h2>
          </div>
          {events.length ? (
            events.slice(0, 15).map((row) => (
              <div className="activity-row" key={row.id}>
                <Sparkles size={15} />
                <span>{row.description}</span>
                <time>{format(new TZDate(row.created_at, tz), 'dd/MM HH:mm')}</time>
              </div>
            ))
          ) : (
            <p className="empty">Nenhuma atividade registrada.</p>
          )}
        </section>
      </div>
      {rules && (
        <Modal
          title="Configurar Maria"
          close={() => setRules(false)}
          onSave={async (fields) => {
            const hours = Object.fromEntries(
              Array.from({ length: 7 }, (_, index) => index + 1).flatMap((day) => {
                const opens = field(fields, 'opens' + day);
                const closes = field(fields, 'closes' + day);
                if (!opens && !closes) return [];
                if (!opens || !closes || opens >= closes)
                  throw new Error('Informe abertura e fechamento em ordem para cada dia ativo.');
                return [[day, [opens, closes]]];
              }),
            );
            await write('clinics', 'update', {
              settings: {
                ...clinic.settings,
                duration: Number(field(fields, 'duration')),
                hours,
                rules: field(fields, 'rules'),
                maria_auto_close: fields.has('maria_auto_close'),
              },
            });
          }}
        >
          <div className="form-grid">
            <label>
              Duração padrão (min)
              <input
                type="number"
                name="duration"
                min="5"
                max="480"
                required
                defaultValue={clinic.settings.duration ?? 30}
              />
            </label>
            <label className="wide">
              Instruções da clínica
              <textarea name="rules" rows={4} maxLength={4000} defaultValue={clinic.settings.rules} />
            </label>
            <label className="wide check">
              <input name="maria_auto_close" type="checkbox" defaultChecked={clinic.settings.maria_auto_close !== false} />
              Encerrar automaticamente após agendar ou quando o paciente se despedir
            </label>
            {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((day, index) => (
              <div className="wide hours" key={day}>
                <strong>{day}</strong>
                <label>
                  Abertura
                  <input
                    aria-label={`Abertura de ${day}`}
                    type="time"
                    name={'opens' + (index + 1)}
                    defaultValue={clinic.settings.hours?.[String(index + 1)]?.[0]}
                  />
                </label>
                <label>
                  Fechamento
                  <input
                    aria-label={`Fechamento de ${day}`}
                    type="time"
                    name={'closes' + (index + 1)}
                    defaultValue={clinic.settings.hours?.[String(index + 1)]?.[1]}
                  />
                </label>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;
// Hide the image before the worker rotates its 20-second code.
const qrDisplayMs = 19_000;

async function wakeWhatsAppWorker(signal: AbortSignal) {
  if (workerUrl)
    await fetch(new URL('/health', workerUrl), { mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal });
}

export function Connections({
  data,
  write,
  canManage,
  demo,
  clinicId,
}: {
  data: Data;
  write: Write;
  canManage: boolean;
  demo: boolean;
  clinicId: string;
}) {
  const session = data.whatsapp_sessions[0];
  const rawQr = data.whatsapp_qr[0]?.qr_code;
  const waitingForPairing = !demo && canManage && session?.enabled === true && session.status !== 'connected';
  const expiresAt = waitingForPairing && session.status === 'qr_ready' ? Date.parse(session.updated_at) + qrDisplayMs : 0;
  const [qrImage, setQrImage] = useState<{ raw: string; expiresAt: number; src: string } | null>(null);
  const qr = qrImage && qrImage.raw === rawQr && qrImage.expiresAt === expiresAt ? qrImage.src : '';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wakingWorker, setWakingWorker] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [gmailOverride, setGmailOverride] = useState<{
    email_address: string;
    active: boolean;
    daily_summary: boolean;
  } | null>(null);
  const gmail = gmailOverride ?? data.gmail_integrations[0];
  useEffect(() => {
    if (!waitingForPairing || !workerUrl) return;
    const controller = new AbortController();
    const wake = () => {
      if (document.visibilityState === 'visible')
        void wakeWhatsAppWorker(controller.signal).catch(() => {});
    };
    wake();
    document.addEventListener('visibilitychange', wake);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', wake);
    };
  }, [waitingForPairing]);
  useEffect(() => {
    const remaining = expiresAt - Date.now();
    if (!rawQr || !expiresAt || remaining <= 0) return;
    let current = true;
    const timer = setTimeout(() => {
      current = false;
      setQrImage(null);
    }, remaining);
    void QRCode.toDataURL(rawQr, { width: 250, margin: 2 })
      .then((src) => {
        if (current) setQrImage({ raw: rawQr, expiresAt, src });
      })
      .catch(() => {
        if (current) setError('Não foi possível gerar a imagem do QR Code.');
      });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [rawQr, expiresAt]);
  async function refreshQr() {
    setWakingWorker(true);
    setError('');
    try {
      await wakeWhatsAppWorker(AbortSignal.timeout(90_000));
    } catch {
      setError('Não foi possível iniciar o WhatsApp. Tente carregar o QR Code novamente.');
    } finally {
      setWakingWorker(false);
    }
  }
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      await write(
        'whatsapp_sessions',
        session ? 'update' : 'insert',
        session ? { enabled: !session.enabled } : {},
        session?.clinic_id,
      );
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function configure(email: string, password?: string, dailySummary = false) {
    if (!demo) {
      const access = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!workerUrl || !access) throw new Error('A URL do worker e uma sessão válida são necessárias.');
      const response = await fetch(new URL('/gmail', workerUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
        body: JSON.stringify({ clinicId, email, password, dailySummary }),
      });
      if (!response.ok)
        throw new Error('Não foi possível atualizar o Gmail. Confira o acesso e a senha de aplicativo.');
    }
    setGmailOverride({ email_address: email, active: Boolean(password), daily_summary: dailySummary });
  }
  return (
    <>
      <Heading title="Ferramentas & Conexões" description="Conecte os canais usados pela sua clínica." />
      <div className="charts connections">
        <section className="card record-panel">
          <span className="tile-icon mint">
            <MessageCircle size={21} />
          </span>
          <h2>WhatsApp</h2>
          <p>
            {session?.status === 'connected'
              ? 'Conectado'
              : qr
                ? 'Aguardando leitura do QR Code'
                : waitingForPairing
                  ? 'Aguardando um novo QR Code. Mantenha esta tela aberta.'
                  : session?.enabled
                    ? 'Aguardando conexão'
                    : 'Desconectado'}
          </p>
          {session?.phone_number && <p>+{session.phone_number}</p>}
          {qr && (
            <div className="qr">
              <ScanLine size={18} />
              <p>Abra Aparelhos conectados no WhatsApp e escaneie o código.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="QR Code para conectar o WhatsApp" src={qr} width={250} height={250} />
            </div>
          )}
          {waitingForPairing && workerUrl && !qr && (
            <Button onClick={refreshQr} disabled={wakingWorker}>
              {wakingWorker ? 'Solicitando QR Code…' : 'Carregar QR Code'}
            </Button>
          )}
          {canManage && (
            <Button variant="default" onClick={toggle} disabled={busy || demo}>
              {session?.enabled ? 'Desativar sessão' : 'Conectar WhatsApp'}
            </Button>
          )}
          {demo && <p className="muted">Sessão de demonstração</p>}
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="card record-panel">
          <span className="tile-icon sky">
            <Mail size={21} />
          </span>
          <h2>Gmail</h2>
          <p>Envio de confirmações de agendamento por SMTP.</p>
          <p>{gmail?.active ? gmail.email_address : 'Nenhuma conta conectada'}</p>
          {canManage && (
            <div className="toolbar-group">
              <Button onClick={() => setMailOpen(true)}>
                {gmail?.active ? 'Editar conexão' : 'Configurar Gmail'}
              </Button>
              {gmail?.active && (
                <Button
                  onClick={() =>
                    void configure(gmail.email_address).catch((issue) => setError(issue.message))
                  }
                >
                  Desconectar
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
      {mailOpen && (
        <Modal
          title="Configurar Gmail"
          close={() => setMailOpen(false)}
          onSave={async (fields) => {
            await configure(
              field(fields, 'email'),
              field(fields, 'password').replace(/\s/g, ''),
              fields.has('daily_summary'),
            );
          }}
        >
          <div className="form-grid">
            <label className="wide">
              Conta Gmail
              <input type="email" name="email" required defaultValue={gmail?.email_address} />
            </label>
            <label className="wide">
              Senha de aplicativo
              <input name="password" type="password" autoComplete="new-password" required minLength={16} />
            </label>
            <label className="wide check">
              <input type="checkbox" name="daily_summary" defaultChecked={gmail?.daily_summary} /> Receber
              resumo diário da clínica
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
