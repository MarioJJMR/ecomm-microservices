// ========== INSTRUMENTATION (Must be at the top!) ==========
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || "orders-service",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ OpenTelemetry SDK initialized for Orders Service");

// ========== EXPRESS APP ==========
const express = require("express");
const { pool, migrate, toOrder } = require("./db");
const queue = require("./queue");
const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// ========== ROUTES ==========

// Create order — inserts a pending row, then hands the actual stock
// reservation off to products-service over the queue. The reservation runs
// as one all-or-nothing transaction over there (see products-service/db.js),
// so a shortage on one line item can no longer leave an earlier item's
// stock decremented with nothing to show for it.
app.post("/api/orders", async (req, res) => {
  const { userId, items } = req.body;
  console.log(`📋 Creating order for user ${userId}`);

  if (!userId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "userId and a non-empty items array are required",
    });
  }

  const { rows } = await pool.query(
    "INSERT INTO orders (user_id, items, status) VALUES ($1, $2, 'pending') RETURNING *",
    [userId, JSON.stringify(items)]
  );
  const order = toOrder(rows[0]);

  queue.publishRequest({ orderId: order.id, items });
  console.log(`📤 Order ${order.id} pending — stock reservation requested`);

  res.status(202).json({
    status: "success",
    data: order,
  });
});

// Get all orders
app.get("/api/orders", async (req, res) => {
  console.log("📋 Fetching all orders");
  const { rows } = await pool.query("SELECT * FROM orders ORDER BY id");
  res.json({
    status: "success",
    data: rows.map(toOrder),
  });
});

// Get single order
app.get("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📋 Fetching order ${id}`);

  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "Order not found",
    });
  }

  res.json({
    status: "success",
    data: toOrder(rows[0]),
  });
});

// Get user orders
app.get("/api/orders/user/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log(`📋 Fetching orders for user ${userId}`);

  const { rows } = await pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY id", [userId]);

  res.json({
    status: "success",
    data: rows.map(toOrder),
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "orders-service" });
});

// ========== QUEUE CONSUMER ==========
// Only updates a row that's still 'pending', so a redelivered message (e.g.
// after a crash right before the ack) is a harmless no-op the second time.
async function handleStockResult({ orderId, ok, items, totalPrice, reason }) {
  if (ok) {
    await pool.query(
      "UPDATE orders SET status = 'confirmed', items = $1, total_price = $2 WHERE id = $3 AND status = 'pending'",
      [JSON.stringify(items), totalPrice, orderId]
    );
    console.log(`✅ Order ${orderId} confirmed`);
  } else {
    await pool.query(
      "UPDATE orders SET status = 'rejected', reason = $1 WHERE id = $2 AND status = 'pending'",
      [reason, orderId]
    );
    console.log(`❌ Order ${orderId} rejected: ${reason}`);
  }
}

// Start server
async function start() {
  await migrate();
  await queue.connect();
  queue.consumeResults(handleStockResult);
  app.listen(PORT, () => {
    console.log(`🚀 Orders Service running on port ${PORT}`);
    console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  });
}

start().catch((error) => {
  console.error("❌ Failed to start orders-service:", error.message);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  sdk.shutdown().then(() => {
    process.exit(0);
  });
});
