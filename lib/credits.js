// lib/credits.js
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const START_CREDITS = 1;        // tyle dostaje nowy user
const COST_NORMAL = 1;          // zwykła generacja
const COST_WITH_BG_REMOVE = 3;  // generacja + remove.bg

export function getCostForRequest({ removeBackground }) {
  return removeBackground ? COST_WITH_BG_REMOVE : COST_NORMAL;
}

// Tworzymy rekord jeśli nie istnieje
export async function getOrCreateCreditsRow(customer) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const id = String(customer.id);
    const email = customer.email || null;

    const existing = await client.query(
      `SELECT * FROM ai_credits WHERE customer_id = $1 FOR UPDATE`,
      [id]
    );

    let row;
    if (existing.rowCount === 0) {
      const inserted = await client.query(
        `INSERT INTO ai_credits (customer_id, email, balance)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, email, START_CREDITS]
      );
      row = inserted.rows[0];
    } else {
      row = existing.rows[0];
    }

    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Odliczamy kredyty PO udanej generacji
export async function deductCredits(customer, cost) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const id = String(customer.id);

    const updated = await client.query(
      `UPDATE ai_credits
       SET balance = balance - $2,
           total_used = total_used + $2,
           updated_at = now()
       WHERE customer_id = $1
         AND balance >= $2
       RETURNING balance`,
      [id, cost]
    );

    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, balance: 0 };
    }

    await client.query("COMMIT");
    return { ok: true, balance: updated.rows[0].balance };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
