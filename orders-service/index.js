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
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3002;

const PRODUCTS_SERVICE_URL = process.env.PRODUCTS_SERVICE_URL || "http://localhost:3001";

// Middleware
app.use(express.json());

// Mock orders database
const orders = [];

// ========== ROUTES ==========

// Create order (calls products service)
app.post("/api/orders", async (req, res) => {
  const { userId, items } = req.body;
  console.log(`📋 Creating order for user ${userId}`);

  try {
    // Simulate calling products service to validate and update stock
    let totalPrice = 0;

    for (const item of items) {
      try {
        console.log(`   Checking product ${item.productId}...`);
        
        // Check stock
        const stockResponse = await axios.post(
          `${PRODUCTS_SERVICE_URL}/api/products/check-stock`,
          {
            productId: item.productId,
            quantity: item.quantity,
          }
        );

        if (!stockResponse.data.data.available) {
          return res.status(400).json({
            status: "error",
            message: `Insufficient stock for product ${item.productId}`,
          });
        }

        // Get product details
        const productResponse = await axios.get(
          `${PRODUCTS_SERVICE_URL}/api/products/${item.productId}`
        );

        totalPrice += productResponse.data.data.price * item.quantity;

        // Update stock
        await axios.put(
          `${PRODUCTS_SERVICE_URL}/api/products/${item.productId}/stock`,
          { quantity: item.quantity }
        );
      } catch (error) {
        console.error(`   Error processing product ${item.productId}:`, error.message);
        return res.status(500).json({
          status: "error",
          message: `Error communicating with products service: ${error.message}`,
        });
      }
    }

    // Create order
    const newOrder = {
      id: orders.length + 1,
      userId,
      items,
      totalPrice,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };

    orders.push(newOrder);

    console.log(`✅ Order ${newOrder.id} created successfully`);

    res.status(201).json({
      status: "success",
      data: newOrder,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error.message);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Get all orders
app.get("/api/orders", (req, res) => {
  console.log("📋 Fetching all orders");
  res.json({
    status: "success",
    data: orders,
  });
});

// Get single order
app.get("/api/orders/:id", (req, res) => {
  const { id } = req.params;
  console.log(`📋 Fetching order ${id}`);

  const order = orders.find((o) => o.id === parseInt(id));

  if (!order) {
    return res.status(404).json({
      status: "error",
      message: "Order not found",
    });
  }

  res.json({
    status: "success",
    data: order,
  });
});

// Get user orders
app.get("/api/orders/user/:userId", (req, res) => {
  const { userId } = req.params;
  console.log(`📋 Fetching orders for user ${userId}`);

  const userOrders = orders.filter((o) => o.userId === parseInt(userId));

  res.json({
    status: "success",
    data: userOrders,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "orders-service" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Orders Service running on port ${PORT}`);
  console.log(`📊 Traces being sent to: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  console.log(`🔗 Products Service URL: ${PRODUCTS_SERVICE_URL}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  sdk.shutdown().then(() => {
    process.exit(0);
  });
});
