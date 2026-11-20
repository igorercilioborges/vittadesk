import { addDays, format, startOfMonth } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { type Appointment, type Clinic, type Data, type Patient, type Status, emptyData } from './model';

export const demoClinic: Clinic = {
  id: 'demo',
  name: 'Clínica Vita Saúde',
  settings: {
    timezone: 'America/Sao_Paulo',
    duration: 30,
    hours: {
      '1': ['08:00', '18:00'],
      '2': ['08:00', '18:00'],
      '3': ['08:00', '18:00'],
      '4': ['08:00', '18:00'],
      '5': ['08:00', '18:00'],
    },
    rules: 'Confirme a especialidade e o tipo de atendimento antes de oferecer horários.',
  },
};
const clinic_id = demoClinic.id;
const names = [
  'Mariana Costa',
  'Rafael Almeida',
  'Beatriz Martins',
  'Lucas Ferreira',
  'Camila Ribeiro',
  'Juliana Santos',
  'Pedro Lima',
  'Fernanda Lopes',
];
const patients: Patient[] = names.map((full_name, index) => ({
  id: String(index + 1),
  clinic_id,
  full_name,
  phone: '551198822' + (1140 + index),
  email: null,
  notes: null,
  cpf: null,
  insurance_type: index % 3 === 1 ? 'convenio' : 'particular',
}));
const professionals = [
  { id: 'p1', clinic_id, name: 'Dra. Ana Oliveira', specialty: 'Clínica geral', active: true },
  { id: 'p2', clinic_id, name: 'Dr. Bruno Silva', specialty: 'Cardiologia', active: true },
  { id: 'p3', clinic_id, name: 'Dra. Laura Mendes', specialty: 'Dermatologia', active: true },
];
const appointment_tags = [
  { id: 't1', clinic_id, name: 'Primeira consulta', color: '#0284C7', default_price: 320 },
  { id: 't2', clinic_id, name: 'Retorno', color: '#10B981', default_price: 200 },
  { id: 't3', clinic_id, name: 'Exame', color: '#6366F1', default_price: 450 },
  { id: 't4', clinic_id, name: 'Encaixe', color: '#F59E0B', default_price: 350 },
];
export function demoData(): Data {
  const now = new TZDate(Date.now(), 'America/Sao_Paulo');
  const month = startOfMonth(now);
  const appointments: Appointment[] = Array.from({ length: 205 }, (_, i) => {
    const future = i >= 157;
    const day = future
      ? addDays(now, Math.floor((i - 157) / 6) + 1)
      : addDays(month, i % Math.max(1, now.getDate() - 1));
    const start = new TZDate(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      8 + (Math.floor(i / Math.max(1, now.getDate() - 1)) % 10),
      (i % 2) * 30,
      now.timeZone,
    );
    const tag = appointment_tags[i % 10 < 5 ? 0 : i % 10 < 8 ? 1 : i % 10 === 8 ? 2 : 3];
    const status: Status = future ? 'scheduled' : i % 13 === 0 ? 'no_show' : 'completed';
    return {
      id: 'a' + i,
      clinic_id,
      patient_id: patients[i % patients.length].id,
      professional_id: professionals[i % 3].id,
      tag_id: tag.id,
      start_time: start.toISOString(),
      end_time: new Date(+start + 30 * 60_000).toISOString(),
      price: tag.default_price,
      status,
      payment_status: status === 'completed' ? 'paid' : 'pending',
      created_by: 'human',
    };
  });
  const preview = [
    { patient: '1', hour: 9, minute: 0, professional: 'p1', tag: 't1' },
    { patient: '2', hour: 10, minute: 30, professional: 'p2', tag: 't2' },
    { patient: '3', hour: 14, minute: 0, professional: 'p3', tag: 't3' },
  ];
  preview.forEach((item, i) => {
    const start = new TZDate(
      `${format(now, 'yyyy-MM-dd')}T${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}:00-03:00`,
      now.timeZone,
    );
    appointments.push({
      id: 'today' + i,
      clinic_id,
      patient_id: item.patient,
      professional_id: item.professional,
      tag_id: item.tag,
      start_time: start.toISOString(),
      end_time: new Date(+start + 30 * 60_000).toISOString(),
      price: appointment_tags[i].default_price,
      status: i % 2 ? 'scheduled' : 'confirmed',
      payment_status: 'pending',
      created_by: 'human',
    });
  });
  return {
    ...emptyData,
    appointments,
    patients,
    professionals,
    appointment_tags,
    whatsapp_sessions: [
      { clinic_id, status: 'connected', phone_number: '5511988221140', enabled: true, maria_enabled: true },
    ],
    conversations: patients
      .slice(0, 3)
      .map((patient) => ({
        id: 'c' + patient.id,
        clinic_id,
        patient_id: patient.id,
        phone: patient.phone,
        remote_jid: patient.phone + '@s.whatsapp.net',
        is_bot_paused: false,
        updated_at: now.toISOString(),
      })),
    messages: [
      {
        id: 'm1',
        conversation_id: 'c1',
        sender: 'patient',
        body: 'Olá! Gostaria de marcar uma primeira consulta.',
        delivery: 'received',
        created_at: now.toISOString(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        sender: 'maria',
        body: 'Olá, Mariana! Qual especialidade você procura?',
        delivery: 'sent',
        created_at: now.toISOString(),
      },
    ],
    agent_events: ['Consulta agendada pela Maria', 'Triagem concluída', 'Atendimento iniciado'].map(
      (description, index) => ({
        id: 'e' + index,
        description,
        action_type: ['appointment_booked', 'triage', 'processing'][index],
        created_at: new Date(+now - (index + 1) * 600_000).toISOString(),
      }),
    ),
  };
}
