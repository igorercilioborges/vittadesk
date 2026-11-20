export type Insurance = 'particular' | 'convenio';
export type Status = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type Settings = {
  timezone?: string;
  duration?: number;
  rules?: string;
  maria_auto_close?: boolean;
  hours?: Record<string, [string, string]>;
};
export type Clinic = { id: string; name: string; settings: Settings };
export type Membership = {
  clinic_id: string;
  name: string;
  role: 'admin' | 'manager' | 'receptionist' | 'doctor';
};
export type Patient = {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  notes: string | null;
  insurance_type: Insurance;
};
export type Professional = {
  id: string;
  clinic_id: string;
  name: string;
  specialty: string;
  active: boolean;
};
export type Tag = { id: string; clinic_id: string; name: string; color: string; default_price: number };
export type Appointment = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  tag_id: string;
  start_time: string;
  end_time: string;
  price: number;
  status: Status;
  payment_status: 'pending' | 'paid';
  created_by: 'human' | 'maria';
};
export type Chat = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  phone: string | null;
  remote_jid: string;
  is_bot_paused: boolean;
  updated_at: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender: 'patient' | 'maria' | 'human';
  body: string;
  delivery: string;
  created_at: string;
};
export type AgentEvent = { id: string; action_type: string; description: string; created_at: string };
export type Connection = {
  clinic_id: string;
  status: 'connected' | 'disconnected' | 'qr_ready';
  phone_number: string | null;
  enabled: boolean;
  maria_enabled: boolean;
  updated_at: string;
};
export type Gmail = { email_address: string; active: boolean; daily_summary: boolean };
export type Data = {
  patients: Patient[];
  professionals: Professional[];
  appointment_tags: Tag[];
  appointments: Appointment[];
  conversations: Chat[];
  messages: Message[];
  whatsapp_sessions: Connection[];
  whatsapp_qr: { clinic_id: string; qr_code: string | null }[];
  gmail_integrations: Gmail[];
  agent_events: AgentEvent[];
};

export const emptyData: Data = {
  patients: [],
  professionals: [],
  appointment_tags: [],
  appointments: [],
  conversations: [],
  messages: [],
  whatsapp_sessions: [],
  whatsapp_qr: [],
  gmail_integrations: [],
  agent_events: [],
};
export const statusLabels: Record<Status, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
};
export const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});
export const nameInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
