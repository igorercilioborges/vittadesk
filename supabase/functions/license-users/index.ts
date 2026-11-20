const roles = new Set(['admin', 'manager', 'receptionist', 'doctor']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function failure(status: number, message: string) {
  return Response.json({ message }, { status, headers: cors });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return failure(405, 'Método não permitido.');

  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) {
    return failure(401, 'Entre no VittaDesk para continuar.');
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return failure(503, 'O cadastro está indisponível.');

  const callerHeaders = { Authorization: authorization, apikey: anonKey };
  const adminHeaders = { Authorization: 'Bearer ' + serviceKey, apikey: serviceKey };
  try {
    const auth = await fetch(new URL('/auth/v1/user', url), { headers: callerHeaders });
    if (auth.status === 401 || auth.status === 403) {
      return failure(401, 'Sua sessão expirou. Entre novamente.');
    }
    if (!auth.ok) return failure(503, 'Não foi possível validar a sessão.');
    const caller = (await auth.json()) as { id?: string };
    if (!caller.id || !uuid.test(caller.id)) return failure(401, 'Sua sessão é inválida.');

    const owner = await fetch(new URL('/rest/v1/rpc/is_license_owner', url), {
      method: 'POST',
      headers: { ...callerHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!owner.ok) return failure(503, 'Não foi possível validar o acesso.');
    if ((await owner.json()) !== true)
      return failure(403, 'Apenas a conta proprietária pode cadastrar usuários.');

    const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    const role = typeof input?.role === 'string' ? input.role : '';
    const clinicId = typeof input?.clinicId === 'string' ? input.clinicId : '';
    if (
      !uuid.test(clinicId) ||
      !roles.has(role) ||
      !name ||
      name.length > 120 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return failure(400, 'Informe uma clínica, um nome, um e-mail e um perfil válidos.');
    }
    if (password.length < 6 || new TextEncoder().encode(password).length > 72) {
      return failure(
        400,
        'Escolha uma senha inicial de 6 a 72 caracteres. Acentos podem ocupar mais espaço.',
      );
    }

    const clinicUrl = new URL('/rest/v1/clinics', url);
    clinicUrl.searchParams.set('id', 'eq.' + clinicId);
    clinicUrl.searchParams.set('select', 'id');
    const clinic = await fetch(clinicUrl, { headers: adminHeaders });
    if (!clinic.ok) return failure(503, 'Não foi possível validar a clínica.');
    if (!(await clinic.json()).length) return failure(404, 'A clínica selecionada não existe.');

    const created = await fetch(new URL('/auth/v1/admin/users', url), {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          vittadesk_license: { owner_id: caller.id, clinic_id: clinicId, name, role },
        },
      }),
    });
    if (created.ok) return Response.json({ created: true }, { status: 201, headers: cors });

    const data = (await created.json().catch(() => ({}))) as { error_code?: string };
    if (data.error_code === 'email_exists' || data.error_code === 'user_already_exists') {
      return failure(409, 'Este e-mail já tem uma conta. Use Liberar licença para vinculá-la à clínica.');
    }
    if (data.error_code === 'weak_password') {
      return failure(400, 'Esta senha não atende aos requisitos do Supabase. Escolha outra senha inicial.');
    }
    return failure(502, 'O cadastro não foi concluído. Confira os dados ou tente novamente.');
  } catch {
    return failure(502, 'O cadastro não foi concluído. Confira a conexão ou tente novamente.');
  }
});
