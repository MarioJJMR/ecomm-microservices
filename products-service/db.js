const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL,
      stock INTEGER NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_reservations (
      order_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      reason TEXT,
      items JSONB,
      total_price NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT COUNT(*) FROM products");
  if (Number(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO products (name, price, stock) VALUES
        ('Laptop', 999, 5),
        ('Mouse', 25, 50),
        ('Keyboard', 75, 30),
        ('Monitor', 299, 10)
    `);
  }
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    stock: row.stock,
  };
}

// Reserves stock for every item in an order as a single all-or-nothing
// transaction, so a shortage on item N never leaves item 1..N-1 decremented.
// Idempotent: replaying the same orderId (e.g. after a redelivered message)
// returns the original outcome instead of reserving stock twice.
async function reserveStock(orderId, items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT status, reason, items, total_price FROM stock_reservations WHERE order_id = $1",
      [orderId]
    );
    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      const row = existing.rows[0];
      return row.status === "reserved"
        ? { ok: true, items: row.items, totalPrice: Number(row.total_price) }
        : { ok: false, reason: row.reason };
    }

    const productIds = items.map((item) => item.productId);
    const { rows } = await client.query(
      "SELECT id, price, stock FROM products WHERE id = ANY($1) FOR UPDATE",
      [productIds]
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    const shortage = items.find((item) => {
      const product = byId.get(item.productId);
      return !product || product.stock < item.quantity;
    });

    if (shortage) {
      const reason = byId.has(shortage.productId)
        ? `Insufficient stock for product ${shortage.productId}`
        : `Product ${shortage.productId} not found`;
      await client.query(
        "INSERT INTO stock_reservations (order_id, status, reason) VALUES ($1, 'rejected', $2)",
        [orderId, reason]
      );
      await client.query("COMMIT");
      return { ok: false, reason };
    }

    for (const item of items) {
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [
        item.quantity,
        item.productId,
      ]);
    }

    const pricedItems = items.map((item) => ({
      ...item,
      price: Number(byId.get(item.productId).price),
    }));
    const totalPrice = pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await client.query(
      "INSERT INTO stock_reservations (order_id, status, items, total_price) VALUES ($1, 'reserved', $2, $3)",
      [orderId, JSON.stringify(pricedItems), totalPrice]
    );
    await client.query("COMMIT");

    return { ok: true, items: pricedItems, totalPrice };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, migrate, toProduct, reserveStock };
