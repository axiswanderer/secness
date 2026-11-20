import { Router } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "../config";

export const filesRouter = Router();

filesRouter.post("/", async (req, res) => {
  const { name, contentBase64 } = req.body;
  if (!name || !contentBase64) return res.status(400).json({ error: "name and contentBase64 are required" });
  const safeName = path.basename(String(name));
  const dir = path.join(UPLOAD_DIR, String(req.user!.teamId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), Buffer.from(contentBase64, "base64"));
  res.status(201).json({ name: safeName });
});

filesRouter.get("/", async (req, res) => {
  const file = String(req.query.file ?? "");
  const fullPath = path.join(UPLOAD_DIR, String(req.user!.teamId), file);
  try {
    const data = await readFile(fullPath);
    res.type("application/octet-stream").send(data);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});
