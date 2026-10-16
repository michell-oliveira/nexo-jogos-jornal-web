import { MIN_PASSWORD } from './users';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Mensagens possíveis após uma ação (a URL carrega só o código, nunca texto livre). */
export const ADMIN_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  created: { text: 'Usuário cadastrado.' },
  password: { text: 'Senha trocada.' },
  deleted: { text: 'Usuário removido.' },
  invalid: { text: 'Usuário inválido: use 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.', error: true },
  weak: { text: `Senha inválida: use de ${MIN_PASSWORD} a 200 caracteres.`, error: true },
  exists: { text: 'Esse usuário já existe.', error: true },
  reserved: { text: 'Esse nome pertence a uma conta fixa do servidor.', error: true },
  missing: { text: 'Usuário não encontrado.', error: true },
  limit: { text: 'Limite de usuários cadastrados atingido.', error: true },
  nokv: { text: 'Cadastro indisponível: o armazenamento (KV) não está configurado.', error: true },
};

export interface AdminView {
  base: string;
  admin: string;
  /** Contas fixas (secrets), só para exibir. */
  fixed: string[];
  users: { name: string; createdAt: number }[];
  messageCode?: string;
}

const fmtDate = (ms: number): string => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Página do administrador, sem JavaScript: cada ação é um formulário POST. */
export function adminPage(v: AdminView): string {
  const msg = v.messageCode ? ADMIN_MESSAGES[v.messageCode] : undefined;
  const rows =
    v.fixed.map((n) => `<tr><td>${esc(n)}</td><td>conta fixa${n === v.admin ? ' (admin)' : ''}</td><td>—</td><td></td></tr>`).join('') +
    v.users
      .map(
        (u) => `<tr><td>${esc(u.name)}</td><td>cadastro</td><td>${fmtDate(u.createdAt)}</td><td class="acts">
<form method="post" action="${v.base}/admin/password"><input type="hidden" name="user" value="${esc(u.name)}">
<input name="password" type="password" autocomplete="new-password" placeholder="nova senha" minlength="${MIN_PASSWORD}" maxlength="200" required>
<button>Trocar senha</button></form>
<form method="post" action="${v.base}/admin/delete"><input type="hidden" name="user" value="${esc(u.name)}"><button class="del">Remover</button></form>
</td></tr>`,
      )
      .join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Jogos de Jornal — Usuários</title>
<style>
:root{--bg:#fff;--card:#f4f4f4;--fg:#121212;--line:#9e9e9e;--primary:#1565c0;--on:#fff;--err:#c62828;--ok:#2e7d32;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#282a36;--card:#343746;--fg:#f8f8f2;--line:#6272a4;--primary:#bd93f9;--on:#111;--err:#ff6b6b;--ok:#50fa7b}}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif}
header{display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--primary);color:var(--on)}
header h1{flex:1;margin:0;font-size:18px}header a{color:var(--on)}
main{max-width:760px;margin:0 auto;padding:16px}
section{background:var(--card);border-radius:8px;padding:16px;margin:12px 0}
h2{margin:0 0 12px;font-size:16px}
label{display:grid;gap:4px;font-size:13px}
input{font:inherit;padding:9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:inherit;min-width:0}
button{font:inherit;font-weight:600;padding:9px 14px;border:0;border-radius:6px;background:var(--primary);color:var(--on);cursor:pointer}
button.del{background:var(--err)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.row label{flex:1 1 180px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}
.acts{display:flex;gap:8px;flex-wrap:wrap}.acts form{display:flex;gap:6px}
.msg{padding:10px 12px;border-radius:6px;border:1px solid var(--ok);color:var(--ok)}.msg.err{border-color:var(--err);color:var(--err)}
small{opacity:.75}
</style>
</head>
<body>
<header><a href="${v.base}/">← Jogos</a><h1>Usuários</h1><span>${esc(v.admin)}</span></header>
<main>
${msg ? `<p class="msg${msg.error ? ' err' : ''}" role="status">${esc(msg.text)}</p>` : ''}
<section>
<h2>Novo usuário</h2>
<form method="post" action="${v.base}/admin/create" class="row">
<label>Usuário<input name="user" autocomplete="off" maxlength="40" required></label>
<label>Senha (mín. ${MIN_PASSWORD})<input name="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" maxlength="200" required></label>
<button>Cadastrar</button>
</form>
</section>
<section>
<h2>Usuários</h2>
<table><tr><th>Usuário</th><th>Origem</th><th>Criado em</th><th></th></tr>${rows}</table>
<p><small>Senhas guardadas como hash PBKDF2 (nunca exibidas). Remover um usuário encerra o acesso dele na próxima requisição; trocar a senha não derruba sessões já abertas.</small></p>
</section>
</main>
</body>
</html>`;
}
