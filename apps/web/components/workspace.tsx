'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftToLine,
  ArrowRightToLine,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  CirclePlus,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plug,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dashboard } from './dashboard';
import { Agenda, AppointmentForm } from './agenda';
import { Finance, Patients } from './records';
import { Agents, ChatDesk, Connections } from './operations';
import { demoClinic, demoData } from '@/lib/demo';
import {
  type Appointment,
  type Clinic,
  type Data,
  type Membership,
  emptyData,
  nameInitials,
} from '@/lib/model';
import { supabase } from '@/lib/supabase';

const navigation = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'finance', label: 'CRM & Financeiro', icon: WalletCards },
  { id: 'patients', label: 'Pacientes', icon: ContactRound },
  { id: 'chat', label: 'Atendimento', icon: MessageCircle },
  { id: 'agents', label: 'Agentes', icon: Sparkles },
  { id: 'connections', label: 'Ferramentas & Conexões', icon: Plug },
] as const;
type Screen = (typeof navigation)[number]['id'];
const tables = Object.keys(emptyData) as (keyof Data)[];
const live = [
  'appointments',
  'whatsapp_sessions',
  'whatsapp_qr',
  'conversations',
  'messages',
  'agent_events',
];
export type Write = (
  table: keyof Data | 'clinics',
  action: 'insert' | 'update',
  values: Record<string, unknown>,
  id?: string,
) => Promise<void>;

async function fetchTable(table: keyof Data, clinicId: string) {
  if (!supabase) return [];
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const query = supabase
      .from(table)
      .select('*')
      .eq('clinic_id', clinicId)
      .order(table === 'whatsapp_qr' ? 'clinic_id' : 'id')
      .range(offset, offset + 499);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Activity size={23} strokeWidth={2.6} />
      </span>
      <span>
        Vitta<span>Desk</span>
        <small>GESTÃO CLÍNICA</small>
      </span>
    </div>
  );
}

export function Workspace() {
  const demo = !supabase;
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [data, setData] = useState<Data>(emptyData);
  const [clinics, setClinics] = useState<Clinic[]>(demo ? [demoClinic] : []);
  const [members, setMembers] = useState<Membership[]>([]);
  const [clinicId, setClinicId] = useState(demo ? demoClinic.id : '');
  const [loadedClinicId, setLoadedClinicId] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [popover, setPopover] = useState<'profile' | 'notifications' | null>(null);
  const [appointment, setAppointment] = useState<Appointment | 'new' | null>(null);
  const [appointmentDate, setAppointmentDate] = useState<string>();
  const [notice, setNotice] = useState('');
  const activeClinic = useRef(clinicId);
  activeClinic.current = clinicId;

  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      const item = navigation.find((entry) => entry.id === hash);
      setScreen(item?.id ?? 'dashboard');
    };
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setData(demoData());
      return;
    }
    const client = supabase;
    let generation = 0;
    const { data: auth } = client.auth.onAuthStateChange((_event, session) => {
      const request = ++generation;
      if (!session) {
        setUser(null);
        setClinics([]);
        setClinicId('');
        setData(emptyData);
        setLoadedClinicId('');
        setLoading(false);
        return;
      }
      setUser(session.user.email ?? session.user.id);
      setTimeout(async () => {
        const [clinicRows, membership] = await Promise.all([
          client.from('clinics').select('id,name,settings').order('name'),
          client.from('clinic_members').select('clinic_id,name,role').eq('user_id', session.user.id),
        ]);
        if (request !== generation) return;
        if (clinicRows.error || membership.error) {
          setNotice(clinicRows.error?.message ?? membership.error?.message ?? '');
        }
        const available = (clinicRows.data ?? []) as Clinic[];
        setClinics(available);
        setMembers((membership.data ?? []) as Membership[]);
        setClinicId((current) =>
          available.some((row) => row.id === current) ? current : (available[0]?.id ?? ''),
        );
        setLoading(false);
      }, 0);
    });
    return () => {
      generation++;
      auth.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !clinicId) return;
    const client = supabase;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let version = 0;
    const refresh = async () => {
      const request = ++version;
      try {
        const result = await Promise.all(
          tables.map(async (table) => [table, await fetchTable(table, clinicId)]),
        );
        if (!disposed && request === version) {
          setData(Object.fromEntries(result) as Data);
          setLoadedClinicId(clinicId);
        }
      } catch (error) {
        if (!disposed) {
          setNotice((error as Error).message);
          setLoadedClinicId(clinicId);
        }
      }
    };
    const channel = client.channel('clinic:' + clinicId);
    for (const table of live) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'clinic_id=eq.' + clinicId },
        () => {
          clearTimeout(timer);
          timer = setTimeout(refresh, 100);
        },
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void refresh();
    });
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [clinicId]);

  function go(target: Screen) {
    setScreen(target);
    window.location.hash = target;
    setMobileMenu(false);
    setPopover(null);
  }

  const write: Write = async (table, action, values, id) => {
    if (table === 'clinics') {
      if (supabase) {
        const result = await supabase.from('clinics').update(values).eq('id', clinicId).select('id').single();
        if (result.error) throw new Error(result.error.message);
      }
      setClinics((items) =>
        items.map((clinic) => (clinic.id === clinicId ? { ...clinic, ...values } : clinic)),
      );
      return;
    }
    const idKey = table === 'whatsapp_sessions' ? 'clinic_id' : 'id';
    if (supabase) {
      const query = supabase.from(table);
      const result =
        action === 'insert'
          ? await query
              .insert({ clinic_id: clinicId, ...values })
              .select('*')
              .single()
          : await query
              .update(values)
              .eq(idKey, id ?? clinicId)
              .eq('clinic_id', clinicId)
              .select('*')
              .single();
      if (result.error)
        throw new Error(
          result.error.code === '23P01'
            ? 'O profissional já tem um atendimento nesse horário.'
            : result.error.message,
        );
      if (activeClinic.current !== clinicId) return;
      setData((current) => ({
        ...current,
        [table]:
          action === 'insert'
            ? [...current[table], result.data]
            : current[table].map((row) =>
                (row as Record<string, unknown>)[idKey] === (id ?? clinicId) ? result.data : row,
              ),
      }));
      return;
    }
    const initial = {
      id: crypto.randomUUID(),
      clinic_id: clinicId,
      created_at: new Date().toISOString(),
      delivery: 'queued',
      ...values,
    };
    setData((current) => ({
      ...current,
      [table]:
        action === 'insert'
          ? [...current[table], initial]
          : current[table].map((row) =>
              (row as Record<string, unknown>)[idKey] === (id ?? clinicId) ? { ...row, ...values } : row,
            ),
    }));
  };

  const clinic = clinics.find((row) => row.id === clinicId);
  if (!demo && (loading || !user || !clinic)) return <Login loading={loading} user={user} notice={notice} />;
  if (!clinic) return null;
  const ready = demo || loadedClinicId === clinicId;
  const scoped = ready ? data : emptyData;
  const me = demo
    ? 'Isabela Martins'
    : (members.find((row) => row.clinic_id === clinicId)?.name ?? user ?? '');
  const role = demo ? 'admin' : members.find((row) => row.clinic_id === clinicId)?.role;
  const canManage = role === 'admin' || role === 'manager';
  const canWrite = canManage || role === 'receptionist';
  const connection = scoped.whatsapp_sessions[0];
  const mariaOnline = connection?.status === 'connected' && connection.maria_enabled;
  const timezone = clinic.settings.timezone || 'America/Sao_Paulo';
  const openAppointment = (row: Appointment | 'new', date?: string) => {
    setAppointmentDate(date);
    setAppointment(row);
  };

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {mobileMenu && (
        <button className="mobile-scrim" aria-label="Fechar navegação" onClick={() => setMobileMenu(false)} />
      )}
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <Brand />
        <nav aria-label="Menu principal">
          <div className="nav-caption">PRINCIPAL</div>
          {navigation.slice(0, 5).map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={screen === id ? 'active' : ''}
              title={label}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </a>
          ))}
          <div className="nav-caption">AUTOMAÇÃO</div>
          {navigation.slice(5).map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={screen === id ? 'active' : ''}
              title={label}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="agent-shortcut" onClick={() => go('agents')} title="Abrir estação da Maria">
            <span className="agent-icon">
              <Sparkles size={17} />
            </span>
            <span>
              <strong>Maria</strong>
              <small>
                <i className={mariaOnline ? 'online-dot' : 'offline-dot'} />
                {mariaOnline ? 'Agente online' : 'Agente offline'}
              </small>
            </span>
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ArrowRightToLine size={17} /> : <ArrowLeftToLine size={17} />}
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              className="icon-button mobile-toggle"
              aria-label="Abrir navegação"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
            </Button>
            <label className="clinic-select">
              <span className="clinic-icon">
                <Building2 size={18} />
              </span>
              <span>
                <small>Clínica ativa</small>
                <select
                  aria-label="Clínica ativa"
                  value={clinicId}
                  onChange={(event) => {
                    setData(emptyData);
                    setClinicId(event.target.value);
                    setAppointment(null);
                    setNotice('');
                  }}
                >
                  {clinics.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </span>
              <ChevronDown size={14} />
            </label>
          </div>
          <div className="topbar-right">
            <button
              className={`connection-pill ${connection?.status === 'connected' ? '' : 'disconnected'}`}
              aria-label="Abrir conexão do WhatsApp"
              onClick={() => go('connections')}
            >
              <i className={connection?.status === 'connected' ? 'online-dot' : 'offline-dot'} />
              <span>WhatsApp {connection?.status === 'connected' ? 'conectado' : 'desconectado'}</span>
            </button>
            <div className="popover-anchor">
              <Button
                className="icon-button bell"
                aria-label="Atividade recente"
                onClick={() => setPopover(popover === 'notifications' ? null : 'notifications')}
              >
                <Bell size={19} />
                {scoped.agent_events.length > 0 && <i />}
              </Button>
              {popover === 'notifications' && (
                <div className="popover card">
                  <strong>Atividade recente</strong>
                  {scoped.agent_events
                    .slice()
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .slice(0, 4)
                    .map((row) => (
                      <p key={row.id}>{row.description}</p>
                    ))}
                  <button className="text-button" onClick={() => go('agents')}>
                    Ver agentes
                  </button>
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="popover-anchor">
              <button
                className="profile"
                onClick={() => setPopover(popover === 'profile' ? null : 'profile')}
              >
                <span className="avatar">{nameInitials(me)}</span>
                <span className="profile-text">
                  <strong>{me}</strong>
                  <small>
                    {
                      {
                        admin: 'Administradora',
                        manager: 'Gerência',
                        receptionist: 'Recepção',
                        doctor: 'Profissional',
                      }[role ?? 'doctor']
                    }
                  </small>
                </span>
                <ChevronDown size={14} />
              </button>
              {popover === 'profile' && (
                <div className="popover card">
                  <strong>{me}</strong>
                  <p>{user ?? 'Ambiente de demonstração'}</p>
                  {user && (
                    <button className="text-button" onClick={() => void supabase?.auth.signOut()}>
                      <LogOut size={16} /> Sair
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main">
          {screen === 'dashboard' && (
            <div className="dashboard-head">
              <span>
                Gestão clínica <span>/</span> Visão geral
              </span>
              {canWrite && (
                <Button variant="default" onClick={() => openAppointment('new')}>
                  <CirclePlus size={17} /> Novo agendamento
                </Button>
              )}
            </div>
          )}
          {notice && (
            <div role="alert" className="notice">
              {notice}
              <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <p className="empty">Carregando dados da clínica…</p>
          ) : (
            <div key={clinicId}>
              {screen === 'dashboard' && (
                <Dashboard
                  data={scoped}
                  timezone={timezone}
                  openAgenda={() => go('agenda')}
                  edit={(row) => openAppointment(row)}
                />
              )}
              {screen === 'agenda' && (
                <Agenda data={scoped} timezone={timezone} canWrite={canWrite} open={openAppointment} />
              )}
              {screen === 'finance' && <Finance data={scoped} write={write} canManage={canManage} />}
              {screen === 'patients' && (
                <Patients data={scoped} write={write} canWrite={canWrite} timezone={timezone} />
              )}
              {screen === 'chat' && (
                <ChatDesk data={scoped} write={write} canWrite={canWrite} timezone={timezone} />
              )}
              {screen === 'agents' && (
                <Agents data={scoped} clinic={clinic} write={write} canManage={canManage} />
              )}
              {screen === 'connections' && (
                <Connections
                  data={scoped}
                  write={write}
                  canManage={canManage}
                  demo={demo}
                  clinicId={clinicId}
                />
              )}
              {appointment && (
                <AppointmentForm
                  row={appointment}
                  preferredDate={appointmentDate}
                  clinic={clinic}
                  data={scoped}
                  write={write}
                  canWrite={canWrite}
                  close={() => setAppointment(null)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Login({ loading, user, notice }: { loading: boolean; user: string | null; notice: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="card">
        <Brand />
        {loading ? (
          <p>Carregando sua conta…</p>
        ) : user ? (
          <>
            <h1>Liberação de acesso</h1>
            <p>Seu usuário precisa ser vinculado a uma clínica.</p>
            <Button onClick={() => void supabase?.auth.signOut()}>Sair</Button>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setBusy(true);
              const result = await supabase?.auth.signInWithPassword({
                email: String(fields.get('email')),
                password: String(fields.get('password')),
              });
              setBusy(false);
              setMessage(result?.error ? 'Confira seu e-mail e senha.' : '');
            }}
          >
            <h1>Acesse sua conta</h1>
            <label>
              E-mail
              <input type="email" name="email" required autoComplete="username" />
            </label>
            <label>
              Senha
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <Button variant="default" type="submit" disabled={busy}>
              Entrar
            </Button>
          </form>
        )}
        {(message || notice) && <p role="alert">{message || notice}</p>}
      </section>
    </main>
  );
}
