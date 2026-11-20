CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  team_id INTEGER NOT NULL REFERENCES teams(id),
  settings JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE todos (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  link_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO teams (name) VALUES ('Acme'), ('Globex');
