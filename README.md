# VittaDesk

Monorepo para operação de clínicas, agenda, financeiro e atendimento WhatsApp.

## GitHub

O código está em `igorercilioborges/vittadesk`. Para trabalhar a partir do repositório público, execute:

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
- **Render.** Crie um Web Service Node vinculado a `main` no mesmo repositório. Deixe Root Directory vazio para acessar o lockfile e use Build Command `npm ci --include=dev && npm run build -w @vittadesk/worker` e Start Command `npm run start -w @vittadesk/worker`. Use `/health` como Health Check Path, habilite auto-deploy e configure as variáveis de `apps/worker/.env.example`. Selecione uma instância que permaneça ativa.

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

Cadastre as clínicas em **Nova clínica**. Em **Cadastrar usuário**, informe o nome, e-mail, senha inicial, clínica e perfil. O VittaDesk cria a conta e o acesso à clínica em uma única transação. Para uma conta existente, use **Liberar licença** para adicionar uma clínica ou atualizar o perfil. Revogar uma licença encerra o acesso à clínica daquele vínculo e preserva os registros. Uma conta pode ter licenças para clínicas diferentes.

Publique a Edge Function com `supabase functions deploy license-users` após aplicar as migrations. A função valida a sessão e a permissão da conta proprietária antes de acessar a API administrativa de autenticação.

Cada clínica configura profissionais e etiquetas em **CRM & Financeiro**, além de horário de funcionamento, duração e regras em **Agentes**. O fuso inicial é `America/Sao_Paulo` e pode ser ajustado em `clinics.settings.timezone`. Use números de telefone em formato internacional, apenas dígitos no banco.

## WhatsApp, Maria e Gmail

- Gere uma chave de criptografia com `openssl rand -hex 32` e configure `SESSION_ENCRYPTION_KEY` no Render. Preserve essa chave entre deploys. Ela protege os dados da autenticação do Baileys e a senha SMTP.
- Configure `WEB_ORIGIN` no worker com a origem da Vercel e `NEXT_PUBLIC_WORKER_URL` no painel com a URL HTTPS do Render. Em **Ferramentas & Conexões**, solicite a conexão e escaneie o QR pelo WhatsApp em **Aparelhos conectados**. A sessão é por clínica e é restaurada após reinicialização.
- Configure `OPENAI_API_KEY` e `OPENAI_MODEL` no worker para ativar a Maria. A agente agrupa mensagens após três segundos de silêncio, consulta a agenda e encaminha urgências ou pedidos de atendimento humano. A integração usa mensagens do WhatsApp como contexto de recepção.
- No Gmail, habilite a verificação em duas etapas e gere uma senha de aplicativo. Informe a conta e a senha em **Ferramentas & Conexões**. Habilite o resumo diário para receber, a partir das 8h no fuso da clínica, os totais do dia anterior no e-mail configurado. A fila envia a confirmação de consultas confirmadas quando o paciente tem e-mail, incluindo agendamentos da Maria. O worker precisa de saída SMTP para o Gmail. Use um plano Render que permita conexões SMTP de saída.
- O worker usa uma concessão de 90 segundos no banco para coordenar reinicializações. Use um único serviço Render por ambiente. A fila do WhatsApp conserva o histórico dos envios e exibe falhas no chat. Em uma interrupção entre o envio e a gravação da entrega, a fila pode tentar novamente com o mesmo identificador.
- Para explorar o painel com dados fictícios, execute a web sem variáveis públicas do Supabase. As alterações de demonstração duram até a página ser recarregada.

## Organização das entregas

Para revisar separadamente, agrupe alterações futuras por `supabase/migrations`, `apps/web` e `apps/worker`. Alterações de contrato entre o banco e os aplicativos devem passar juntas pelo ambiente de validação.
