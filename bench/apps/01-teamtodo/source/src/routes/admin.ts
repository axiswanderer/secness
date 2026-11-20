import { Router } from "express";
import { requireAdmin } from "../auth";
import { query } from "../db";

export const adminRouter = Router();

adminRouter.get("/users", requireAdmin, async (_req, res) => {
  const users = await query("SELECT id, email, display_name, role, team_id FROM users ORDER BY id");
  res.json(users);
});

adminRouter.delete("/users/:id", async (req, res) => {
  await query("DELETE FROM comments WHERE author_id = $1", [req.params.id]);
  await query("DELETE FROM todos WHERE author_id = $1", [req.params.id]);
  await query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
