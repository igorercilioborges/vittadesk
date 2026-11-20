'use client';

import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';

export function PasswordRecovery({ client, finish }: { client: SupabaseClient; finish: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') ?? '');
    if (password !== fields.get('confirmation')) {
      setMessage('As senhas não coincidem.');
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setMessage('A senha é muito longa. Escolha uma senha menor.');
      return;
    }

    setMessage('');
    setBusy(true);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (!error) {
        setUpdated(true);
      } else if (error.code === 'same_password' || error.code === 'weak_password') {
        setMessage('Escolha uma nova senha que atenda aos requisitos de segurança.');
      } else {
        setMessage('Não foi possível salvar a senha. Solicite um novo link se a sessão tiver expirado.');
      }
    } catch {
      setMessage('Não foi possível conectar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="card">
        <Brand />
        {updated ? (
          <>
            <h1>Senha redefinida</h1>
            <p>Sua nova senha está salva.</p>
            <Button variant="default" onClick={finish}>
              Abrir VittaDesk
            </Button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1>Redefinir senha</h1>
            <label>
              Nova senha
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
              Confirme a nova senha
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={6}
                maxLength={72}
                required
              />
            </label>
            <Button variant="default" type="submit" disabled={busy}>
              Salvar nova senha
            </Button>
            <button
              type="button"
              className="text-button"
              onClick={() => void client.auth.signOut({ scope: 'local' })}
            >
              Voltar ao login
            </button>
            {message && <p role="alert">{message}</p>}
          </form>
        )}
      </section>
    </main>
  );
}
