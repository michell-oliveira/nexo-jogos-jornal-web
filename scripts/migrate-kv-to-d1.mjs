// Migração única e idempotente: copia os usuários cadastrados (chaves `u:*` do KV USERS) para a tabela `users` do D1.
// Usa `INSERT OR IGNORE`: rodar de novo não duplica nem sobrescreve nada. Não apaga o KV.
//
// Uso:  node scripts/migrate-kv-to-d1.mjs [--dry-run]
// Requer `wrangler login` feito e o D1 já criado, com a migração 0001 aplicada (veja o README).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_NAME = 'jogos-jornal-users';
const dryRun = process.argv.includes('--dry-run');

// O id do namespace KV vem do wrangler.jsonc (binding USERS), sem depender de parser JSONC.
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const nsId = /"binding"\s*:\s*"USERS"\s*,\s*"id"\s*:\s*"([0-9a-f]{32})"/.exec(config)?.[1];
if (!nsId) throw new Error('Binding KV "USERS" não encontrado no wrangler.jsonc.');

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 });

const keys = JSON.parse(wrangler(['kv', 'key', 'list', '--namespace-id', nsId, '--prefix', 'u:', '--remote']));
console.log(`${keys.length} usuário(s) no KV.`);

const NAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

let migrated = 0;
for (const { name: key } of keys) {
  const name = key.slice(2);
  const rec = JSON.parse(wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']));
  // Valida a forma antes de montar SQL (os valores vão como literais; só passam base64 e inteiros).
  if (!NAME_RE.test(name) || !B64_RE.test(rec.salt) || !B64_RE.test(rec.hash) || !Number.isInteger(rec.iter) || !Number.isInteger(rec.createdAt)) {
    console.warn(`  ignorado (formato inesperado): ${name}`);
    continue;
  }
  const sql = `INSERT OR IGNORE INTO users (name, salt, hash, iter, created_at) VALUES ('${name}', '${rec.salt}', '${rec.hash}', ${rec.iter}, ${rec.createdAt});`;
  if (dryRun) console.log(`  [dry-run] ${sql.replace(rec.hash, '<hash>')}`);
  else {
    // `--file` em vez de `--command`: no Windows o shell do npx quebra o SQL em vários argumentos.
    const dir = mkdtempSync(join(tmpdir(), 'kv2d1-'));
    const file = join(dir, 'insert.sql');
    writeFileSync(file, sql);
    try {
      wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', file]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`  ok: ${name}`);
  migrated++;
}
console.log(`${migrated} usuário(s) ${dryRun ? 'seriam copiados' : 'copiados (já existentes foram mantidos)'}.`);
