import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN, JWT_SECRET } from "./config";
import { query } from "./db";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  teamId: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admins only" });
  next();
}

function sign(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password, displayName, teamId } = req.body;
  if (!email || !password || !displayName || !teamId) {
    return res.status(400).json({ error: "email, password, displayName and teamId are required" });
  }
  const hash = await bcrypt.hash(password, 10);
  const [row] = await query(
    "INSERT INTO users (email, password_hash, display_name, team_id) VALUES ($1, $2, $3, $4) RETURNING id, email, role, team_id",
    [email, hash, displayName, teamId],
  );
  const user = { id: row.id, email: row.email, role: row.role, teamId: row.team_id };
  res.status(201).json({ token: sign(user), user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const [row] = await query("SELECT * FROM users WHERE email = $1", [email]);
  if (!row) return res.status(401).json({ error: "No account with that email" });
  const ok = await bcrypt.compare(password ?? "", row.password_hash);
  if (!ok) return res.status(401).json({ error: "Wrong password" });
  const user = { id: row.id, email: row.email, role: row.role, teamId: row.team_id };
  res.json({ token: sign(user), user });
});
