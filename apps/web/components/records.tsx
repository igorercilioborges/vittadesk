'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { CirclePlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type Data,
  type Patient,
  type Professional,
  type Tag,
  money,
  nameInitials,
  statusLabels,
} from '@/lib/model';
import type { Write } from './workspace';
import { field, Heading, Modal } from './forms';
import { isFuture, sum } from './dashboard';

export function Finance({ data, write, canManage }: { data: Data; write: Write; canManage: boolean }) {
  const [tag, setTag] = useState<Tag | 'new' | null>(null);
  const [professional, setProfessional] = useState<Professional | 'new' | null>(null);
  const [axis, setAxis] = useState<'patients' | 'appointment_tags' | 'professionals'>('appointment_tags');
  const now = Date.now();
  const totals = data[axis].map((item) => {
    const key = (
      { patients: 'patient_id', appointment_tags: 'tag_id', professionals: 'professional_id' } as const
    )[axis];
    const rows = data.appointments.filter((row) => row[key] === item.id);
    const realized = sum(rows.filter((row) => row.status === 'completed'));
    return {
      id: item.id,
      name: 'full_name' in item ? item.full_name : item.name,
      realized,
      projected: realized + sum(rows.filter((row) => isFuture(row, now))),
    };
  });
  const currentTag = tag === 'new' ? null : tag;
  const currentProfessional = professional === 'new' ? null : professional;
  return (
    <>
      <Heading title="CRM & Financeiro" description="Gerencie valores e compare receitas por atendimento." />
      <div className="stack">
        <section className="card record-panel">
          <div className="section-line">
            <div className="panel-title">
              <h2>Etiquetas e valores</h2>
              <p>Valores padrão aplicados aos novos agendamentos</p>
            </div>
            {canManage && (
              <Button variant="default" onClick={() => setTag('new')}>
                <CirclePlus size={17} /> Nova etiqueta
              </Button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Etiqueta</th>
                  <th>Valor padrão</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.appointment_tags.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="tag" style={{ backgroundColor: item.color + '15', color: item.color }}>
                        {item.name}
                      </span>
                    </td>
                    <td>{money.format(item.default_price)}</td>
                    <td>
                      {canManage && (
                        <button className="text-button" onClick={() => setTag(item)}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.appointment_tags.length && (
                  <tr>
                    <td colSpan={3}>Nenhuma etiqueta cadastrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card record-panel">
          <div className="section-line">
            <div className="panel-title">
              <h2>Receita por grupo</h2>
              <p>Consultas concluídas e atendimentos futuros</p>
            </div>
            <select
              aria-label="Agrupar receita"
              value={axis}
              onChange={(event) => setAxis(event.target.value as typeof axis)}
            >
              <option value="appointment_tags">Por etiqueta</option>
              <option value="patients">Por paciente</option>
              <option value="professionals">Por profissional</option>
            </select>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Realizada</th>
                  <th>Projetada</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{money.format(item.realized)}</td>
                    <td>{money.format(item.projected)}</td>
                  </tr>
                ))}
                {!totals.length && (
                  <tr>
                    <td colSpan={3}>Nenhum registro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card record-panel">
          <div className="section-line">
            <div className="panel-title">
              <h2>Profissionais</h2>
              <p>Equipe disponível para agendamentos</p>
            </div>
            {canManage && (
              <Button onClick={() => setProfessional('new')}>
                <CirclePlus size={17} /> Novo profissional
              </Button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Especialidade</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.professionals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.specialty}</td>
                    <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      {canManage && (
                        <button className="text-button" onClick={() => setProfessional(item)}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.professionals.length && (
                  <tr>
                    <td colSpan={4}>Nenhum profissional cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {tag && (
        <Modal
          title={currentTag ? 'Editar etiqueta' : 'Nova etiqueta'}
          close={() => setTag(null)}
          onSave={async (fields) => {
            await write(
              'appointment_tags',
              currentTag ? 'update' : 'insert',
              {
                name: field(fields, 'name'),
                color: field(fields, 'color'),
                default_price: Number(field(fields, 'price')),
              },
              currentTag?.id,
            );
          }}
        >
          <div className="form-grid">
            <label>
              Nome
              <input name="name" required defaultValue={currentTag?.name} />
            </label>
            <label>
              Valor (R$)
              <input
                name="price"
                type="number"
                min="0"
                step=".01"
                required
                defaultValue={currentTag?.default_price ?? 0}
              />
            </label>
            <label>
              Cor
              <input type="color" name="color" defaultValue={currentTag?.color ?? '#0284C7'} />
            </label>
          </div>
        </Modal>
      )}
      {professional && (
        <Modal
          title={currentProfessional ? 'Editar profissional' : 'Novo profissional'}
          close={() => setProfessional(null)}
          onSave={async (fields) => {
            await write(
              'professionals',
              currentProfessional ? 'update' : 'insert',
              {
                name: field(fields, 'name'),
                specialty: field(fields, 'specialty'),
                active: fields.has('active'),
              },
              currentProfessional?.id,
            );
          }}
        >
          <div className="form-grid">
            <label>
              Nome
              <input name="name" required defaultValue={currentProfessional?.name} />
            </label>
            <label>
              Especialidade
              <input name="specialty" required defaultValue={currentProfessional?.specialty} />
            </label>
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={currentProfessional?.active ?? true} />{' '}
              Ativo
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Patients({
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
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState<Patient | 'new' | null>(null);
  const visible = data.patients.filter((item) => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    const numbers = term.replace(/\D/g, '');
    return (
      item.full_name.toLocaleLowerCase('pt-BR').includes(term) ||
      Boolean(numbers && item.phone.includes(numbers))
    );
  });
  const current = patient === 'new' ? null : patient;
  const history = data.appointments
    .filter((row) => row.patient_id === current?.id)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
  return (
    <>
      <Heading title="Pacientes" description="Cadastros, contatos e histórico de atendimentos.">
        {canWrite && (
          <Button variant="default" onClick={() => setPatient('new')}>
            <CirclePlus size={17} /> Novo paciente
          </Button>
        )}
      </Heading>
      <section className="card record-panel">
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone"
              aria-label="Buscar pacientes"
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Atendimento</th>
                <th>Receita realizada</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="patient-link" onClick={() => setPatient(item)}>
                      <span className="avatar mini">{nameInitials(item.full_name)}</span>
                      {item.full_name}
                    </button>
                  </td>
                  <td>+{item.phone}</td>
                  <td>{item.insurance_type === 'convenio' ? 'Convênio' : 'Particular'}</td>
                  <td>
                    {money.format(
                      sum(
                        data.appointments.filter(
                          (row) => row.patient_id === item.id && row.status === 'completed',
                        ),
                      ),
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={4}>Nenhum paciente encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {patient && (
        <Modal
          title={current ? 'Ficha do paciente' : 'Novo paciente'}
          close={() => setPatient(null)}
          onSave={
            canWrite
              ? async (fields) => {
                  const phone = field(fields, 'phone').replace(/\D/g, '');
                  if (!/^\d{8,15}$/.test(phone))
                    throw new Error('Informe o telefone com código do país e DDD.');
                  await write(
                    'patients',
                    current ? 'update' : 'insert',
                    {
                      full_name: field(fields, 'full_name'),
                      phone,
                      email: field(fields, 'email') || null,
                      cpf: field(fields, 'cpf') || null,
                      insurance_type: field(fields, 'insurance'),
                      notes: field(fields, 'notes') || null,
                    },
                    current?.id,
                  );
                }
              : undefined
          }
        >
          <fieldset className="form-grid" disabled={!canWrite}>
            <label>
              Nome completo
              <input name="full_name" required defaultValue={current?.full_name} />
            </label>
            <label>
              Telefone com código do país
              <input
                name="phone"
                type="tel"
                required
                placeholder="+55 11 99999-0000"
                defaultValue={current?.phone}
              />
            </label>
            <label>
              E-mail
              <input name="email" type="email" defaultValue={current?.email ?? ''} />
            </label>
            <label>
              CPF
              <input name="cpf" defaultValue={current?.cpf ?? ''} />
            </label>
            <label>
              Atendimento
              <select name="insurance" defaultValue={current?.insurance_type ?? 'particular'}>
                <option value="particular">Particular</option>
                <option value="convenio">Convênio</option>
              </select>
            </label>
            <label className="wide">
              Observações
              <textarea name="notes" defaultValue={current?.notes ?? ''} />
            </label>
          </fieldset>
          {current && (
            <div className="form-history">
              <h3>Histórico de consultas</h3>
              {history.length ? (
                history.map((row) => (
                  <div key={row.id}>
                    <span>{format(new TZDate(row.start_time, timezone), 'dd/MM/yyyy HH:mm')}</span>
                    <span>{statusLabels[row.status]}</span>
                    <strong>{money.format(row.price)}</strong>
                  </div>
                ))
              ) : (
                <p className="muted">Nenhuma consulta registrada.</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
