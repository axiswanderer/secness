import { Router } from "express";
import _ from "lodash";
import { query } from "../db";

export const usersRouter = Router();

usersRouter.get("/me", async (req, res) => {
  const [user] = await query(
    "SELECT id, email, display_name, role, team_id, settings FROM users WHERE id = $1",
    [req.user!.id],
  );
  res.json(user);
});

usersRouter.patch("/me", async (req, res) => {
  const updates: Record<string, unknown> = { ...req.body };
  delete updates.id;
  delete updates.password_hash;
  const columns = Object.keys(updates);
  if (columns.length === 0) return res.status(400).json({ error: "Nothing to update" });
  const assignments = columns.map((c, i) => `"${c.replace(/"/g, "")}" = $${i + 1}`).join(", ");
  const [user] = await query(
    `UPDATE users SET ${assignments} WHERE id = $${columns.length + 1}
     RETURNING id, email, display_name, role, team_id`,
    [...Object.values(updates), req.user!.id],
  );
  res.json(user);
});

usersRouter.put("/me/settings", async (req, res) => {
  const [row] = await query("SELECT settings FROM users WHERE id = $1", [req.user!.id]);
  const settings = _.merge({}, row.settings, req.body);
  await query("UPDATE users SET settings = $1 WHERE id = $2", [settings, req.user!.id]);
  res.json(settings);
});
