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
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Mock product database
const products = [
  { id: 1, name: "Laptop", price: 999, stock: 5 },
  { id: 2, name: "Mouse", price: 25, stock: 50 },
  { id: 3, name: "Keyboard", price: 75, stock: 30 },
  { id: 4, name: "Monitor", price: 299, stock: 10 },
];

// ========== ROUTES ==========

// Get all products
app.get("/api/products", (req, res) => {
  console.log("📦 Fetching all products");
  res.json({
    status: "success",
    data: products,
    timestamp: new Date().toISOString(),
  });
});

// Get single product
app.get("/api/products/:id", (req, res) => {
  const { id } = req.params;
  console.log(`📦 Fetching product ${id}`);

  const product = products.find((p) => p.id === parseInt(id));

  if (!product) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  res.json({
    status: "success",
    data: product,
  });
});

// Create product
app.post("/api/products", (req, res) => {
  const { name, price, stock } = req.body;
  console.log(`📦 Creating new product: ${name}`);

  const newProduct = {
    id: products.length + 1,
    name,
    price,
    stock,
  };

  products.push(newProduct);

  res.status(201).json({
    status: "success",
    data: newProduct,
  });
});

// Check stock
app.post("/api/products/check-stock", (req, res) => {
  const { productId, quantity } = req.body;
  console.log(`📦 Checking stock for product ${productId}`);

  const product = products.find((p) => p.id === productId);

  if (!product) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  const hasStock = product.stock >= quantity;

  res.json({
    status: "success",
    data: {
      productId,
      available: hasStock,
      quantity: product.stock,
    },
  });
});

// Update product stock
app.put("/api/products/:id/stock", (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  console.log(`📦 Updating stock for product ${id}`);

  const product = products.find((p) => p.id === parseInt(id));

  if (!product) {
    return res.status(404).json({
      status: "error",
      message: "Product not found",
    });
  }

  product.stock -= quantity;

  res.json({
    status: "success",
    data: {
      message: "Stock updated",
      newStock: product.stock,
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "products-service" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Products Service running on port ${PORT}`);
  console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  sdk.shutdown().then(() => {
    process.exit(0);
  });
});
