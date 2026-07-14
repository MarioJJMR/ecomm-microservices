// ========== INSTRUMENTATION (Must be at the top!) ==========
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || "users-service",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ OpenTelemetry SDK initialized for Users Service");

// ========== EXPRESS APP ==========
const express = require("express");
const { pool, migrate, toUser } = require("./db");
const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(express.json());

// ========== ROUTES ==========

// Get all users
app.get("/api/users", async (req, res) => {
  console.log("👥 Fetching all users");
  const { rows } = await pool.query("SELECT * FROM users ORDER BY id");
  res.json({
    status: "success",
    data: rows.map(toUser),
  });
});

// Get single user
app.get("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`👥 Fetching user ${id}`);

  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.json({
    status: "success",
    data: toUser(rows[0]),
  });
});

// Create user
app.post("/api/users", async (req, res) => {
  const { name, email } = req.body;
  console.log(`👥 Creating user: ${name}`);

  if (!name || !email) {
    return res.status(400).json({
      status: "error",
      message: "Name and email are required",
    });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
      [name, email]
    );

    res.status(201).json({
      status: "success",
      data: toUser(rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        status: "error",
        message: "Email already exists",
      });
    }
    throw error;
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  console.log(`👥 Updating user ${id}`);

  const { rows } = await pool.query(
    "UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *",
    [name || null, email || null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.json({
    status: "success",
    data: toUser(rows[0]),
  });
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`👥 Deleting user ${id}`);

  const { rows } = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *", [id]);

  if (rows.length === 0) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.json({
    status: "success",
    message: "User deleted",
    data: toUser(rows[0]),
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "users-service" });
});

// Start server
migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Users Service running on port ${PORT}`);
      console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to run database migration:", error.message);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  Promise.all([sdk.shutdown(), pool.end()]).then(() => {
    process.exit(0);
  });
});
