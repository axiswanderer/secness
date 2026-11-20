import { Router } from "express";
import { query } from "../db";

export const todosRouter = Router();

todosRouter.get("/", async (req, res) => {
  const todos = await query(
    "SELECT * FROM todos WHERE team_id = $1 ORDER BY created_at DESC",
    [req.user!.teamId],
  );
  res.json(todos);
});

todosRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  const todos = await query(
    `SELECT * FROM todos WHERE team_id = ${req.user!.teamId} AND title ILIKE '%${q}%' ORDER BY created_at DESC`,
  );
  res.json(todos);
});

todosRouter.post("/", async (req, res) => {
  const { title, notes } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const [todo] = await query(
    "INSERT INTO todos (team_id, author_id, title, notes) VALUES ($1, $2, $3, $4) RETURNING *",
    [req.user!.teamId, req.user!.id, title, notes ?? ""],
  );
  res.status(201).json(todo);
});

todosRouter.get("/:id", async (req, res) => {
  const [todo] = await query("SELECT * FROM todos WHERE id = $1", [req.params.id]);
  if (!todo) return res.status(404).json({ error: "Not found" });
  res.json(todo);
});

todosRouter.patch("/:id", async (req, res) => {
  const { title, notes, done } = req.body;
  const [todo] = await query(
    `UPDATE todos SET title = COALESCE($1, title), notes = COALESCE($2, notes), done = COALESCE($3, done)
     WHERE id = $4 AND team_id = $5 RETURNING *`,
    [title, notes, done, req.params.id, req.user!.teamId],
  );
  if (!todo) return res.status(404).json({ error: "Not found" });
  res.json(todo);
});

todosRouter.delete("/:id", async (req, res) => {
  await query("DELETE FROM todos WHERE id = $1 AND team_id = $2", [req.params.id, req.user!.teamId]);
  res.status(204).end();
});

todosRouter.get("/:id/comments", async (req, res) => {
  const comments = await query(
    `SELECT c.*, u.display_name AS author FROM comments c
     JOIN users u ON u.id = c.author_id
     JOIN todos t ON t.id = c.todo_id
     WHERE c.todo_id = $1 AND t.team_id = $2 ORDER BY c.created_at`,
    [req.params.id, req.user!.teamId],
  );
  res.json(comments);
});

todosRouter.post("/:id/comments", async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: "body is required" });
  const [todo] = await query("SELECT id FROM todos WHERE id = $1 AND team_id = $2", [
    req.params.id,
    req.user!.teamId,
  ]);
  if (!todo) return res.status(404).json({ error: "Not found" });
  const [comment] = await query(
    "INSERT INTO comments (todo_id, author_id, body) VALUES ($1, $2, $3) RETURNING *",
    [req.params.id, req.user!.id, body],
  );
  res.status(201).json(comment);
});

todosRouter.post("/:id/link", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  const page = await fetch(url);
  const html = await page.text();
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? url;
  const [todo] = await query(
    "UPDATE todos SET link_url = $1, link_title = $2 WHERE id = $3 AND team_id = $4 RETURNING *",
    [url, title, req.params.id, req.user!.teamId],
  );
  if (!todo) return res.status(404).json({ error: "Not found" });
  res.json({ ...todo, preview: html.slice(0, 500) });
});
