const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Página de login sem JavaScript (CSP `script-src 'none'`), cores pelo claro/escuro do sistema. */
export function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Jogos de Jornal — Entrar</title>
<style>
:root{--bg:#fff;--card:#f4f4f4;--fg:#121212;--line:#9e9e9e;--primary:#1565c0;--on:#fff;--err:#c62828;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#282a36;--card:#343746;--fg:#f8f8f2;--line:#6272a4;--primary:#bd93f9;--on:#111;--err:#ff6b6b}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif}
form{width:min(92vw,340px);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px 24px;display:grid;gap:12px}
h1{margin:0;font:800 30px Georgia,serif;text-align:center}
p{margin:0 0 8px;text-align:center;font-size:14px;opacity:.75}
label{font-size:13px;display:grid;gap:4px}
input{font:inherit;padding:10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:inherit}
button{font:inherit;font-weight:600;padding:12px;border:0;border-radius:6px;background:var(--primary);color:var(--on);cursor:pointer}
.err{color:var(--err);font-size:13px;text-align:center}
</style>
</head>
<body>
<form method="post" action="/login">
<h1>Sudoku</h1>
<p>Jogos de Jornal — acesso restrito</p>
<label>Usuário<input name="user" autocomplete="username" maxlength="200" required autofocus></label>
<label>Senha<input name="password" type="password" autocomplete="current-password" maxlength="200" required></label>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<button type="submit">Entrar</button>
</form>
</body>
</html>`;
}
