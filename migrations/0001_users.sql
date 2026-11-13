-- Usuários cadastrados pela tela /admin (senha nunca em texto: só salt + hash PBKDF2-SHA-256, em base64).
CREATE TABLE IF NOT EXISTS users (
  name TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  iter INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
