'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="module-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

export function Modal({
  title,
  close,
  onSave,
  children,
}: {
  title: string;
  close: () => void;
  onSave?: (fields: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSave || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(new FormData(event.currentTarget));
      close();
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      aria-labelledby={titleId}
      className="modal"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit}>
        <div className="section-line">
          <h2 id={titleId}>{title}</h2>
          <Button size="icon" aria-label="Fechar" onClick={close}>
            <X size={19} />
          </Button>
        </div>
        {children}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {onSave && (
          <div className="modal-actions">
            <Button onClick={close}>Cancelar</Button>
            <Button variant="default" type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>
    </dialog>
  );
}
export const field = (fields: FormData, name: string) => String(fields.get(name) ?? '').trim();
