const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// pg emits 'error' on idle clients that lose their connection in the
// background (e.g. Postgres restart) — without a listener this throws and
// kills the process, since Pool is a plain EventEmitter.
pool.on("error", (error) => {
  console.error("⚠️  Unexpected Postgres pool error:", error.message);
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      items JSONB NOT NULL,
      total_price NUMERIC,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Relax constraints in case this table was created before orders became
  // async (total_price used to be known at insert time; now it's filled in
  // once products-service confirms the stock reservation).
  await pool.query("ALTER TABLE orders ALTER COLUMN total_price DROP NOT NULL");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS reason TEXT");
  await pool.query("ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending'");
}

function toOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    items: row.items,
    totalPrice: row.total_price === null ? null : Number(row.total_price),
    status: row.status,
    reason: row.reason || undefined,
    createdAt: row.created_at.toISOString(),
  };
}

module.exports = { pool, migrate, toOrder };
