import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import { authRouter, requireAuth } from "./auth";
import { PORT } from "./config";
import { adminRouter } from "./routes/admin";
import { filesRouter } from "./routes/files";
import { todosRouter } from "./routes/todos";
import { usersRouter } from "./routes/users";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/todos", requireAuth, todosRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/files", requireAuth, filesRouter);
app.use("/api/admin", requireAuth, adminRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(PORT, () => console.log(`teamtodo listening on :${PORT}`));
