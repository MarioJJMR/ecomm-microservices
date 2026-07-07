# 🚀 Quick Start Guide

## One-Command Setup

```bash
cd microservices-project
docker-compose up -d
```

## Wait for Startup (30-60 seconds)

Check service health:
```bash
docker-compose ps
```

All services should show "Up".

## Access the Dashboard

### **SigNoz (Observability)**
```
http://localhost:3301
```

### **Verify Services**
```bash
curl http://localhost/health
```

## Generate Traces

### Option 1: Automated Test Script
```bash
chmod +x test-api.sh
./test-api.sh
```

### Option 2: Manual Tests

**Create an Order** (shows inter-service communication):
```bash
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [
      {"productId": 1, "quantity": 2},
      {"productId": 2, "quantity": 1}
    ]
  }'
```

**Get All Products:**
```bash
curl http://localhost/api/products
```

**Get All Users:**
```bash
curl http://localhost/api/users
```

## 📊 What to See in SigNoz

### Traces Tab
- Shows every request through the system
- Click any trace to see full details
- When you create an order, you'll see:
  - POST to orders-service
  - Calls to products-service for stock check
  - Calls to update product stock

### Service Map Tab
- Visual graph of all services
- Shows how they communicate
- Displays latency and error rates

### Metrics Tab
- Response time graphs
- Request rate
- Error rates

## 🛑 Stop Everything

```bash
docker-compose down
```

## 📝 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/products` | List all products |
| POST | `/api/products` | Create product |
| GET | `/api/products/:id` | Get product |
| POST | `/api/users` | Create user |
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user |
| POST | `/api/orders` | Create order ⭐ |
| GET | `/api/orders` | List orders |
| GET | `/api/orders/:id` | Get order |

⭐ = Best for seeing distributed tracing (calls other services)

## 🔍 Key Features to Explore

1. **Create an Order** → See distributed trace in SigNoz
2. **View Service Map** → See how services connect
3. **Check Latency** → Measure response times
4. **Monitor Errors** → See failed requests
5. **View Logs** → All logs from all services in one place

## 🎓 Learning Path

1. Start the project
2. Create a few orders
3. Check SigNoz dashboard
4. Click on a trace to see details
5. View service map
6. Experiment with more orders
7. Check latency graphs

## ⚠️ Troubleshooting

**Services not starting?**
```bash
docker-compose logs -f
```

**No traces appearing?**
- Wait 30+ seconds
- Verify services are running: `docker-compose ps`
- Create an order to generate traces

**Port already in use?**
Edit `docker-compose.yml` and change ports (e.g., 8080:80 instead of 80:80)

---

Enjoy building with microservices! 🎉
