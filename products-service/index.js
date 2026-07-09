// ========== INSTRUMENTATION (Must be at the top!) ==========
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || "products-service",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ OpenTelemetry SDK initialized for Products Service");

// ========== EXPRESS APP ==========
const express = require("express");
const { pool, migrate, toProduct, reserveStock } = require("./db");
const queue = require("./queue");
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// ========== ROUTES ==========

// Get all products
app.get("/api/products", async (req, res) => {
  console.log("📦 Fetching all products");
  const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
  res.json({
    status: "success",
    data: rows.map(toProduct),
    timestamp: new Date().toISOString(),
  });
});

// Get single product
app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📦 Fetching product ${id}`);

  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  res.json({
    status: "success",
    data: toProduct(rows[0]),
  });
});

// Create product
app.post("/api/products", async (req, res) => {
  const { name, price, stock } = req.body;
  console.log(`📦 Creating new product: ${name}`);

  const { rows } = await pool.query(
    "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING *",
    [name, price, stock]
  );

  res.status(201).json({
    status: "success",
    data: toProduct(rows[0]),
  });
});

// Check stock
app.post("/api/products/check-stock", async (req, res) => {
  const { productId, quantity } = req.body;
  console.log(`📦 Checking stock for product ${productId}`);

  const { rows } = await pool.query("SELECT stock FROM products WHERE id = $1", [productId]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  const hasStock = rows[0].stock >= quantity;

  res.json({
    status: "success",
    data: {
      productId,
      available: hasStock,
      quantity: rows[0].stock,
    },
  });
});

// Update product stock
app.put("/api/products/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  console.log(`📦 Updating stock for product ${id}`);

  const { rows } = await pool.query(
    "UPDATE products SET stock = stock - $1 WHERE id = $2 RETURNING stock",
    [quantity, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  res.json({
    status: "success",
    data: {
      message: "Stock updated",
      newStock: rows[0].stock,
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "products-service" });
});

// ========== QUEUE CONSUMER ==========
// Reserves stock for an entire order in one transaction (see db.js) instead
// of the check-stock/PUT-stock REST calls above, which orders-service no
// longer uses for order creation.
async function handleStockRequest({ orderId, items }) {
  console.log(`📦 Reserving stock for order ${orderId}`);
  const result = await reserveStock(orderId, items);
  queue.publishResult({ orderId, ...result });
  console.log(
    result.ok
      ? `✅ Reserved stock for order ${orderId}`
      : `⛔ Rejected order ${orderId}: ${result.reason}`
  );
}

// Start server
async function start() {
  await migrate();
  await queue.connect();
  queue.consumeRequests(handleStockRequest);
  app.listen(PORT, () => {
    console.log(`🚀 Products Service running on port ${PORT}`);
    console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  });
}

start().catch((error) => {
  console.error("❌ Failed to start products-service:", error.message);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  sdk.shutdown().then(() => {
    process.exit(0);
  });
});
