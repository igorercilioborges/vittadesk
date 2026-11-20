# VittaDesk

Monorepo para operação de clínicas, agenda, financeiro e atendimento WhatsApp.

## GitHub

O repositório público do projeto é `igorercilioborges/vittadesk`. Para cloná-lo, execute:

```sh
git clone https://github.com/igorercilioborges/vittadesk.git
cd vittadesk
```

Para a publicação inicial a partir de arquivos locais, use estes comandos com um repositório remoto vazio:

```sh
git init
git branch -M main
git remote add origin https://github.com/igorercilioborges/vittadesk.git
git add .
git commit -m "Implementar VittaDesk"
git push -u origin main
```

## Desenvolvimento

Use Node.js 22 ou superior. Instale com `npm ci`, aplique a migration em um projeto Supabase e copie os arquivos `.env.example` para `apps/web/.env.local` e `apps/worker/.env`. Execute `npm run dev` e, em outro terminal, `npm run dev:worker`. Use `npm run typecheck` e `npm run build` para validar os workspaces.

## Deploy automático

- **Vercel.** Importe `igorercilioborges/vittadesk` como projeto Next.js, selecione `apps/web` como Root Directory e habilite arquivos fora do diretório raiz. Use a instalação padrão do monorepo. Configure as variáveis de `apps/web/.env.example`, configure `main` como Production Branch e mantenha a integração Git ativa.
- **Render.** Importe `igorercilioborges/vittadesk` em **New → Blueprint** depois de publicar o código na branch `main`. O arquivo `render.yaml` configura o build do worker, o deploy automático, a verificação em `/health`, as URLs de produção e a chave de criptografia da sessão. Defina `SUPABASE_SERVICE_ROLE_KEY` no campo secreto solicitado pelo Render. O plano gratuito serve para testar o QR Code e suspende o serviço após inatividade. Para atendimento contínuo, selecione uma instância que permaneça ativa.

Aplique migrations antes de publicar código que dependa delas. A chave de serviço do Supabase é usada no worker e na Edge Function, em ambiente de servidor.

## Configurar login e licenças

1. Aplique as migrations de `supabase/migrations` na ordem dos arquivos. Com a CLI, execute `supabase link --project-ref SEU_PROJETO` e `supabase db push`.
2. No Supabase, mantenha desativada a criação pública de contas. Em **Authentication → Users**, cadastre e confirme o e-mail da conta proprietária. Defina a senha temporária nessa tela e guarde-a fora do repositório.
3. No SQL Editor, substitua o UUID de exemplo pelo ID da conta proprietária e execute:

```sql
insert into private.license_owner(user_id)
values ('00000000-0000-0000-0000-000000000000');
```

Entre no VittaDesk com essa conta e abra **Licenças**. A área aparece automaticamente se a conta ainda não está vinculada a uma clínica. Se já estiver, abra **Gerenciar licenças** no menu de perfil. Use **Alterar senha** para trocar a senha temporária.

Cadastre as clínicas em **Nova clínica**. Abra **Novo usuário ou licença**, escolha a clínica e consulte o e-mail. Para um e-mail novo, informe nome, senha inicial e perfil. Para uma conta existente, o painel libera ou atualiza a licença da clínica selecionada. A criação de uma nova conta e da sua primeira licença ocorre em uma única transação. Revogar uma licença encerra o acesso à clínica daquele vínculo e preserva os registros. Uma conta pode ter licenças para clínicas diferentes.

Publique a Edge Function com `supabase functions deploy license-users` após aplicar as migrations. A função valida a sessão e a permissão da conta proprietária antes de acessar a API administrativa de autenticação.

### Recuperação de senha

Na tela de login, **Esqueci minha senha** pede ao Supabase um link que retorna à mesma origem do painel. No Supabase, configure **Authentication → URL Configuration → Site URL** para a URL de produção e inclua a origem com a barra final em **Redirect URLs**. Use SMTP próprio para que o Supabase envie recuperação aos usuários do sistema. O SMTP padrão do Supabase atende apenas endereços da equipe do projeto.

Cada clínica configura profissionais e etiquetas em **CRM & Financeiro**, além de horário de funcionamento, duração e regras em **Agentes**. O fuso inicial é `America/Sao_Paulo` e pode ser ajustado em `clinics.settings.timezone`. Use números de telefone em formato internacional, apenas dígitos no banco.

## WhatsApp, Maria e Gmail

- O Blueprint gera automaticamente `SESSION_ENCRYPTION_KEY`. Em uma configuração manual, gere a chave com `openssl rand -hex 32`. Preserve essa chave entre deploys para restaurar a autenticação do Baileys e a senha SMTP.
- Configure `WEB_ORIGIN` no worker com a origem da Vercel e `NEXT_PUBLIC_WORKER_URL` no painel com a URL HTTPS do Render. Em **Ferramentas & Conexões**, solicite a conexão e escaneie o QR pelo WhatsApp em **Aparelhos conectados**. A sessão é por clínica e é restaurada após reinicialização.
- Configure o provedor de IA uma vez no worker. Para OpenAI, use `OPENAI_API_KEY` e `OPENAI_MODEL`. Depois de conectar o WhatsApp, cada administrador ou gerente pode clicar em **Agentes → Ativar Maria**, selecionar uma etiqueta padrão de agendamento e salvar os horários e as instruções. A agente agrupa mensagens após três segundos de silêncio, consulta a agenda da clínica e encaminha urgências ou pedidos de atendimento humano.
- Em **Agentes → Ativar lembretes**, habilite a confirmação por WhatsApp às 8h no fuso da clínica. A fila inclui consultas agendadas ou confirmadas a partir das 8h e verifica a situação da consulta antes do envio. O mesmo horário de uma consulta gera um único lembrete na fila. Cadastre e habilite os atendimentos antes das 8h para que sejam incluídos no envio do dia.
- No Gmail, habilite a verificação em duas etapas e gere uma senha de aplicativo. Informe a conta e a senha em **Ferramentas & Conexões**. Habilite o resumo diário para receber, a partir das 8h no fuso da clínica, os totais do dia anterior no e-mail configurado. A fila envia a confirmação de consultas confirmadas quando o paciente tem e-mail, incluindo agendamentos da Maria. O worker precisa de saída SMTP para o Gmail. Use um plano Render que permita conexões SMTP de saída.
- O worker usa uma concessão de 90 segundos no banco para coordenar reinicializações. Use um único serviço Render por ambiente. A fila do WhatsApp conserva o histórico dos envios e exibe falhas no chat. Em uma interrupção entre o envio e a gravação da entrega, a fila pode tentar novamente com o mesmo identificador.
- Para explorar o painel com dados fictícios, execute a web sem variáveis públicas do Supabase. As alterações de demonstração duram até a página ser recarregada.

Cadastre o agendamento uma vez por ambiente no Supabase, usando a URL pública do worker em produção. O Cron verifica a agenda a cada minuto e pode acordar o worker três minutos antes das 8h quando há lembretes previstos.

```sql
select cron.schedule('vittadesk-appointment-reminders', '* * * * *',
  $$select private.run_appointment_reminders('https://seu-worker.onrender.com/health')$$);
```

## Organização das entregas

Para revisar separadamente, agrupe alterações futuras por `supabase/migrations`, `apps/web` e `apps/worker`. Alterações de contrato entre o banco e os aplicativos devem passar juntas pelo ambiente de validação.
