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
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      joined_at DATE NOT NULL DEFAULT CURRENT_DATE
    )
  `);

  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (Number(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO users (name, email, joined_at) VALUES
        ('Alice Johnson', 'alice@example.com', '2024-01-15'),
        ('Bob Smith', 'bob@example.com', '2024-02-20'),
        ('Charlie Brown', 'charlie@example.com', '2024-03-10')
    `);
  }
}

function toUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    joinedAt: row.joined_at.toISOString().split("T")[0],
  };
}

module.exports = { pool, migrate, toUser };
