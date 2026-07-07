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
const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(express.json());

// Mock users database
const users = [
  {
    id: 1,
    name: "Alice Johnson",
    email: "alice@example.com",
    joinedAt: "2024-01-15",
  },
  {
    id: 2,
    name: "Bob Smith",
    email: "bob@example.com",
    joinedAt: "2024-02-20",
  },
  {
    id: 3,
    name: "Charlie Brown",
    email: "charlie@example.com",
    joinedAt: "2024-03-10",
  },
];

// ========== ROUTES ==========

// Get all users
app.get("/api/users", (req, res) => {
  console.log("👥 Fetching all users");
  res.json({
    status: "success",
    data: users,
  });
});

// Get single user
app.get("/api/users/:id", (req, res) => {
  const { id } = req.params;
  console.log(`👥 Fetching user ${id}`);

  const user = users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.json({
    status: "success",
    data: user,
  });
});

// Create user
app.post("/api/users", (req, res) => {
  const { name, email } = req.body;
  console.log(`👥 Creating user: ${name}`);

  if (!name || !email) {
    return res.status(400).json({
      status: "error",
      message: "Name and email are required",
    });
  }

  const newUser = {
    id: users.length + 1,
    name,
    email,
    joinedAt: new Date().toISOString().split("T")[0],
  };

  users.push(newUser);

  res.status(201).json({
    status: "success",
    data: newUser,
  });
});

// Update user
app.put("/api/users/:id", (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  console.log(`👥 Updating user ${id}`);

  const user = users.find((u) => u.id === parseInt(id));

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  if (name) user.name = name;
  if (email) user.email = email;

  res.json({
    status: "success",
    data: user,
  });
});

// Delete user
app.delete("/api/users/:id", (req, res) => {
  const { id } = req.params;
  console.log(`👥 Deleting user ${id}`);

  const index = users.findIndex((u) => u.id === parseInt(id));

  if (index === -1) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  const deletedUser = users.splice(index, 1);

  res.json({
    status: "success",
    message: "User deleted",
    data: deletedUser[0],
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "users-service" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Users Service running on port ${PORT}`);
  console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  sdk.shutdown().then(() => {
    process.exit(0);
  });
});
