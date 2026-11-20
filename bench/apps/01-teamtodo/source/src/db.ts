import { Pool } from "pg";
import { DATABASE_URL } from "./config";

export const pool = new Pool({ connectionString: DATABASE_URL });

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
