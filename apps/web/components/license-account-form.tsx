'use client';

import { useState } from 'react';
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { field, Modal } from './forms';

export const licenseRoles = {
  admin: 'Administração',
  manager: 'Gerência',
  receptionist: 'Recepção',
  doctor: 'Profissional',
};

type Clinic = { id: string; name: string };
type Lookup = {
  status: 'new' | 'existing' | 'unconfirmed';
  license?: { name: string; role: keyof typeof licenseRoles } | null;
};

export function LicenseAccountForm({
  client,
  clinics,
  close,
  onSaved,
}: {
  client: SupabaseClient;
  clinics: Clinic[];
  close: () => void;
  onSaved: (message: string) => void;
}) {
  const [clinicId, setClinicId] = useState(clinics.length === 1 ? clinics[0].id : '');
  const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);

  async function save(fields: FormData) {
    if (!lookup) {
      const { data, error } = await client.rpc('license_admin_find_account', {
        p_email: email.trim(),
        p_clinic_id: clinicId,
      });
      if (error) throw error;
      setLookup(data as Lookup);
      return false;
    }

    const name = field(fields, 'name');
    const role = field(fields, 'role');
    if (lookup.status === 'existing') {
      const { error } = await client.rpc('license_admin_grant', {
        p_email: email.trim(),
        p_clinic_id: clinicId,
        p_name: name,
        p_role: role,
      });
      if (error) throw error;
      onSaved(lookup.license ? 'A licença foi atualizada.' : 'Licença liberada para esta clínica.');
      return;
    }

    const password = String(fields.get('password') ?? '');
    if (password !== fields.get('confirmation')) throw new Error('As senhas não coincidem.');
    const { error } = await client.functions.invoke('license-users', {
      body: { clinicId, email: email.trim(), name, role, password },
    });
    if (error instanceof FunctionsHttpError) {
      if (error.context.status === 409) {
        setLookup(null);
        throw new Error('Este e-mail já foi cadastrado. Consulte novamente para vincular a conta.');
      }
      const response = await error.context.json().catch(() => null);
      if (typeof response?.message === 'string') throw new Error(response.message);
    }
    if (error) throw new Error('Não foi possível concluir o cadastro. Consulte o e-mail e tente novamente.');
    onSaved('Usuário cadastrado e licença liberada.');
  }

  const submitLabel = !lookup
    ? 'Consultar e-mail'
    : lookup.status === 'new'
      ? 'Cadastrar usuário'
      : lookup.license
        ? 'Atualizar licença'
        : 'Liberar licença';

  return (
    <Modal
      title="Novo usuário ou licença"
      close={close}
      onSave={lookup?.status === 'unconfirmed' ? undefined : save}
      submitLabel={submitLabel}
    >
      {!lookup ? (
        <div className="form-grid">
          <label>
            Clínica
            <select
              name="clinic"
              aria-label="Clínica"
              required
              value={clinicId}
              onChange={(event) => setClinicId(event.target.value)}
            >
              <option value="">Selecione uma clínica</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <>
          <p className="account-match">
            <strong>{email.trim()}</strong> · {clinics.find((clinic) => clinic.id === clinicId)?.name}
          </p>
          <Button onClick={() => setLookup(null)}>Alterar e-mail ou clínica</Button>
          {lookup.status === 'unconfirmed' ? (
            <p className="notice">A conta existe, mas o e-mail ainda precisa ser confirmado pelo usuário.</p>
          ) : (
            <>
              <p className="account-match">
                {lookup.status === 'new'
                  ? 'Novo e-mail. Defina a senha inicial para criar a conta e liberar o acesso.'
                  : lookup.license
                    ? 'Esta conta já tem acesso à clínica. Você pode atualizar o perfil.'
                    : 'Conta existente. Escolha o perfil de acesso nesta clínica.'}
              </p>
              <div className="form-grid">
                <label>
                  Nome do usuário
                  <input name="name" maxLength={120} required defaultValue={lookup.license?.name} />
                </label>
                <label>
                  Perfil
                  <select
                    name="role"
                    aria-label="Perfil"
                    defaultValue={lookup.license?.role ?? 'receptionist'}
                    required
                  >
                    {Object.entries(licenseRoles).map(([role, name]) => (
                      <option key={role} value={role}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {lookup.status === 'new' && (
                  <>
                    <label>
                      Senha inicial
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
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
                        minLength={6}
                        maxLength={72}
                        required
                      />
                    </label>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
