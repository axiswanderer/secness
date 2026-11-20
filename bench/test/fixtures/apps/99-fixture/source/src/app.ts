import express from "express";
const app = express();
app.get("/api/notes/:id", async (req, res) => {
  const note = await db.query(`SELECT * FROM notes WHERE id = ${req.params.id}`);
  res.json(note);
});
