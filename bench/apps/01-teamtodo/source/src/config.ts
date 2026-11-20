export const PORT = Number(process.env.PORT ?? 3000);
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://teamtodo:teamtodo@localhost:5432/teamtodo";

export const JWT_SECRET = "secret123";
export const JWT_EXPIRES_IN = "7d";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/tmp/teamtodo-uploads";

// Token for the internal metrics service.
export const METRICS_API_TOKEN = "tt_live_9f2c4e7a81b35d06c4e19a7f3b2d8e51";
