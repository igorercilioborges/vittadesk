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

Aplique migrations antes de publicar código que dependa delas. Mantenha a chave de serviço do Supabase apenas no worker.

## Provisionar a primeira clínica

Crie um usuário com e-mail e senha em **Supabase → Authentication → Users**. Aplique o SQL de `supabase/migrations` no SQL Editor do projeto ou, com a CLI instalada, execute `supabase link --project-ref SEU_PROJETO` e `supabase db push`. Desative o cadastro público no Supabase Auth se os usuários forem provisionados pela equipe.

Como administrador do banco, substitua o UUID abaixo pelo ID do usuário criado e execute:

```sql
with clinic as (
  insert into public.clinics(name,slug) values ('Clínica Vita Saúde','vita-saude') returning id
)
insert into public.clinic_members(clinic_id,user_id,role,name)
select id,'00000000-0000-0000-0000-000000000000','admin','Administradora' from clinic;
```

Ao entrar no painel, cadastre profissionais e etiquetas em **CRM & Financeiro**. Configure horário de funcionamento, duração e regras em **Agentes**. O fuso inicial é `America/Sao_Paulo` e pode ser ajustado no JSON `clinics.settings.timezone`. Use números de telefone em formato internacional, apenas dígitos no banco.

## WhatsApp, Maria e Gmail

- Gere uma chave de criptografia com `openssl rand -hex 32` e configure `SESSION_ENCRYPTION_KEY` no Render. Preserve essa chave entre deploys. Ela protege os dados da autenticação do Baileys e a senha SMTP.
- Configure `WEB_ORIGIN` no worker com a origem da Vercel e `NEXT_PUBLIC_WORKER_URL` no painel com a URL HTTPS do Render. Em **Ferramentas & Conexões**, solicite a conexão e escaneie o QR pelo WhatsApp em **Aparelhos conectados**. A sessão é por clínica e é restaurada após reinicialização.
- Configure `OPENAI_API_KEY` e `OPENAI_MODEL` no worker para ativar a Maria. A agente agrupa mensagens após três segundos de silêncio, consulta a agenda e encaminha urgências ou pedidos de atendimento humano. A integração usa mensagens do WhatsApp como contexto de recepção.
- No Gmail, habilite a verificação em duas etapas e gere uma senha de aplicativo. Informe a conta e a senha em **Ferramentas & Conexões**. Habilite o resumo diário para receber, a partir das 8h no fuso da clínica, os totais do dia anterior no e-mail configurado. A fila envia a confirmação de consultas confirmadas quando o paciente tem e-mail, incluindo agendamentos da Maria. O worker precisa de saída SMTP para o Gmail. Use um plano Render que permita conexões SMTP de saída.
- O worker usa uma concessão de 90 segundos no banco para coordenar reinicializações. Use um único serviço Render por ambiente. A fila do WhatsApp conserva o histórico dos envios e exibe falhas no chat. Em uma interrupção entre o envio e a gravação da entrega, a fila pode tentar novamente com o mesmo identificador.
- Para explorar o painel com dados fictícios, execute a web sem variáveis públicas do Supabase. As alterações de demonstração duram até a página ser recarregada.

## Organização das entregas

Para revisar separadamente, agrupe alterações futuras por `supabase/migrations`, `apps/web` e `apps/worker`. Alterações de contrato entre o banco e os aplicativos devem passar juntas pelo ambiente de validação.
