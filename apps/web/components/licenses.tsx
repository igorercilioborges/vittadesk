'use client';

import { useEffect, useState } from 'react';
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';
import { field, Heading, Modal } from './forms';

const roles = {
  admin: 'Administração',
  manager: 'Gerência',
  receptionist: 'Recepção',
  doctor: 'Profissional',
};
type Clinic = { id: string; name: string };
type License = {
  id: string;
  clinic_name: string;
  email: string;
  name: string;
  role: keyof typeof roles;
};
type Snapshot = { clinics: Clinic[]; licenses: License[] };
type Action = 'clinic' | 'register' | 'grant' | 'password' | License;

export function Licenses({
  client,
  email,
  openClinic,
  refreshAccount,
}: {
  client: SupabaseClient;
  email: string;
  openClinic?: () => void;
  refreshAccount: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ clinics: [], licenses: [] });
  const [action, setAction] = useState<Action | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await client.rpc('license_admin_snapshot');
      if (!active) return;
      if (error) {
        setNotice(error.message);
      } else {
        setSnapshot(data as Snapshot);
        setNotice('');
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, refresh]);

  async function save(values: FormData) {
    if (action === 'password') {
      const password = String(values.get('password') ?? '');
      if (password !== values.get('confirmation')) throw new Error('As senhas não coincidem.');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      return;
    }

    if (action === 'register') {
      const password = String(values.get('password') ?? '');
      if (password !== values.get('confirmation')) throw new Error('As senhas não coincidem.');
      const { error } = await client.functions.invoke('license-users', {
        body: {
          clinicId: field(values, 'clinic'),
          email: field(values, 'email'),
          name: field(values, 'name'),
          role: field(values, 'role'),
          password,
        },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const response = await error.context.json().catch(() => null);
          if (typeof response?.message === 'string') throw new Error(response.message);
        }
        throw new Error('Não foi possível comunicar com o serviço de cadastro.');
      }
      setRefresh((current) => current + 1);
      refreshAccount();
      return;
    }

    const response =
      action === 'clinic'
        ? await client.rpc('license_admin_create_clinic', {
            p_name: field(values, 'name'),
            p_slug: field(values, 'slug'),
          })
        : action === 'grant'
          ? await client.rpc('license_admin_grant', {
              p_clinic_id: field(values, 'clinic'),
              p_email: field(values, 'email'),
              p_name: field(values, 'name'),
              p_role: field(values, 'role'),
            })
          : await client.rpc('license_admin_revoke', { p_license_id: action?.id });
    if (response.error) throw response.error;
    setRefresh((current) => current + 1);
    refreshAccount();
  }

  const title =
    action === 'clinic'
      ? 'Nova clínica'
      : action === 'register'
        ? 'Cadastrar usuário'
        : action === 'grant'
          ? 'Liberar licença'
          : action === 'password'
            ? 'Alterar minha senha'
            : 'Revogar licença';

  return (
    <main className="main license-workspace">
      <Brand />
      <Heading title="Licenças" description={email}>
        <div className="toolbar-group">
          {openClinic && <Button onClick={openClinic}>Painel da clínica</Button>}
          <Button onClick={() => setAction('password')}>Alterar senha</Button>
          <Button onClick={() => void client.auth.signOut()}>Sair</Button>
        </div>
      </Heading>
      <section className="card record-panel">
        <div className="section-line">
          <h2>Acessos por clínica</h2>
          <div className="toolbar-group">
            <Button onClick={() => setAction('clinic')}>Nova clínica</Button>
            <Button disabled={!snapshot.clinics.length} onClick={() => setAction('grant')}>
              Liberar licença
            </Button>
            <Button
              variant="default"
              disabled={!snapshot.clinics.length}
              onClick={() => setAction('register')}
            >
              Cadastrar usuário
            </Button>
          </div>
        </div>
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.licenses.map((row) => (
                <tr key={row.id}>
                  <td>{row.clinic_name}</td>
                  <td>
                    {row.name}
                    <br />
                    <small>{row.email}</small>
                  </td>
                  <td>{roles[row.role]}</td>
                  <td>
                    <Button onClick={() => setAction(row)}>Revogar</Button>
                  </td>
                </tr>
              ))}
              {!snapshot.licenses.length && (
                <tr>
                  <td colSpan={4}>{loading ? 'Carregando acessos…' : 'Nenhum acesso cadastrado.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {action && (
        <Modal title={title} close={() => setAction(null)} onSave={save}>
          <div className="form-grid">
            {action === 'clinic' && (
              <>
                <label>
                  Nome da clínica
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  Identificador da clínica
                  <input
                    name="slug"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={63}
                    placeholder="clinica-exemplo"
                    required
                  />
                </label>
              </>
            )}
            {(action === 'grant' || action === 'register') && (
              <>
                <label>
                  Clínica
                  <select name="clinic" aria-label="Clínica" required>
                    {snapshot.clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  E-mail
                  <input type="email" name="email" required />
                </label>
                <label>
                  Nome do usuário
                  <input name="name" maxLength={120} required />
                </label>
                <label>
                  Perfil
                  <select name="role" aria-label="Perfil" defaultValue="receptionist" required>
                    {Object.entries(roles).map(([role, name]) => (
                      <option key={role} value={role}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {(action === 'password' || action === 'register') && (
              <>
                <label>
                  {action === 'register' ? 'Senha inicial' : 'Nova senha'}
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={action === 'register' ? 6 : 12}
                    maxLength={72}
                    required
                  />
                </label>
                <label>
                  Confirme a senha
                  <input
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    minLength={action === 'register' ? 6 : 12}
                    maxLength={72}
                    required
                  />
                </label>
              </>
            )}
            {typeof action === 'object' && (
              <p>
                A revogação encerra o acesso de {action.name} à clínica {action.clinic_name}.
              </p>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}
