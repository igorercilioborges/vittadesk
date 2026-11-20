import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VittaDesk | Gestão clínica',
  description: 'Agenda, atendimento e financeiro em um só lugar.',
  icons: { icon: '/branding/vittadesk-logo.webp' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
