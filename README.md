# Microservices Project with SigNoz Observability

A complete microservices example with:
- **3 Microservices**: Products, Orders, Users
- **API Gateway**: NGINX for routing
- **OpenTelemetry**: Distributed tracing
- **SigNoz**: Full observability platform

## 📋 Prerequisites

- Docker & Docker Compose
- curl or Postman (for testing)

## 🚀 Quick Start

### 1. Start All Services

```bash
docker-compose up -d
```

This will start:
- ✅ Products Service (port 3001)
- ✅ Orders Service (port 3002)
- ✅ Users Service (port 3003)
- ✅ NGINX Gateway (port 80)
- ✅ SigNoz (port 3301)
- ✅ PostgreSQL (port 5432)

### 2. Access SigNoz Dashboard

Open your browser:
```
http://localhost:3301
```

Wait 30-60 seconds for services to fully initialize and start sending traces.

### 3. Check Service Health

```bash
# Check each service
curl http://localhost/health

curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

---

## 🧪 Testing the Services

### **Test Products Service**

```bash
# Get all products
curl http://localhost/api/products

# Get single product
curl http://localhost/api/products/1

# Create product
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Headphones","price":150,"stock":20}'
```

### **Test Users Service**

```bash
# Get all users
curl http://localhost/api/users

# Get user
curl http://localhost/api/users/1

# Create user
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Diana Prince","email":"diana@example.com"}'
```

### **Test Orders Service** (Most Important - Shows Inter-Service Communication)

```bash
# Create an order (this calls products service internally!)
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [
      {"productId": 1, "quantity": 2},
      {"productId": 2, "quantity": 1}
    ]
  }'

# Get all orders
curl http://localhost/api/orders

# Get user orders
curl http://localhost/api/orders/user/1
```

---

## 📊 What to See in SigNoz

### **1. Service Map**
- Shows all 3 microservices
- Displays how services communicate
- Visualizes latency between services

### **2. Traces**
- Click on any trace to see the full flow
- When you create an order, you'll see:
  1. POST /api/orders (Orders Service)
  2. POST /api/products/check-stock (Products Service)
  3. GET /api/products/:id (Products Service)
  4. PUT /api/products/:id/stock (Products Service)

### **3. Metrics**
- Request rate
- Latency
- Error rate
- CPU/Memory usage

### **4. Logs**
- Search logs from all services
- Correlate with traces

---

## 🔍 Recommended Test Scenarios

### Scenario 1: Order Creation Flow
```bash
# Create an order to see inter-service communication
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 2,
    "items": [{"productId": 3, "quantity": 5}]
  }'

# Then go to SigNoz → Traces and search for "orders-service"
# You'll see the complete trace including calls to products-service
```

### Scenario 2: Load Test
```bash
# Create multiple orders to generate more traces
for i in {1..10}; do
  curl -X POST http://localhost/api/orders \
    -H "Content-Type: application/json" \
    -d '{"userId": 1, "items": [{"productId": 1, "quantity": 1}]}'
done

# Check latency in SigNoz dashboard
```

### Scenario 3: Error Scenario
```bash
# Try to order a product that doesn't exist
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [{"productId": 999, "quantity": 1}]
  }'

# This will show error traces in SigNoz
```

---

## 📁 Project Structure

```
microservices-project/
├── docker-compose.yml          # All services orchestration
├── nginx.conf                  # API Gateway config
├── products-service/
│   ├── index.js               # Service implementation
│   ├── package.json
│   └── Dockerfile
├── orders-service/
│   ├── index.js               # Calls products-service
│   ├── package.json
│   └── Dockerfile
├── users-service/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
└── README.md
```

---

## 🛑 Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (caution: deletes data)
docker-compose down -v
```

---

## 📝 Key Concepts Demonstrated

✅ **Microservices Architecture**: 3 independent services
✅ **API Gateway**: Centralized routing with NGINX
✅ **Inter-service Communication**: Orders calls Products service
✅ **Distributed Tracing**: Track requests across services
✅ **OpenTelemetry**: Automatic instrumentation
✅ **SigNoz**: Comprehensive observability

---

## 🐛 Troubleshooting

### Services not starting?
```bash
# Check logs
docker-compose logs -f products-service
docker-compose logs -f orders-service
docker-compose logs -f users-service
```

### No traces in SigNoz?
- Wait 30-60 seconds for initialization
- Make sure services are running: `docker-compose ps`
- Check that OTEL_EXPORTER_OTLP_ENDPOINT is correct

### Connection errors when creating orders?
- Verify products-service is running
- Check PRODUCTS_SERVICE_URL in docker-compose.yml
- Check network with: `docker network ls`

---

## 📚 Next Steps

1. **Add Database**: Integrate PostgreSQL with each service
2. **Add Caching**: Implement Redis for performance
3. **Message Queue**: Use RabbitMQ or Kafka for async communication
4. **Kubernetes**: Deploy to K8s instead of Docker Compose
5. **CI/CD**: Add GitHub Actions for automated deployment

---

Happy monitoring! 🎉
