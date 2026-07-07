#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="http://localhost"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Microservices API Test Suite${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if services are running
echo -e "${YELLOW}Checking service health...${NC}"
for service in "localhost:3001" "localhost:3002" "localhost:3003"; do
    if curl -s http://$service/health > /dev/null; then
        echo -e "${GREEN}✓ Service $service is healthy${NC}"
    else
        echo -e "${RED}✗ Service $service is NOT responding${NC}"
    fi
done
echo ""

# Test Products Service
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 1: Products Service${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}1.1 Get all products:${NC}"
curl -s $API_URL/api/products | json_pp 2>/dev/null || curl -s $API_URL/api/products
echo -e "\n"

echo -e "${YELLOW}1.2 Get single product:${NC}"
curl -s $API_URL/api/products/1 | json_pp 2>/dev/null || curl -s $API_URL/api/products/1
echo -e "\n"

echo -e "${YELLOW}1.3 Create new product:${NC}"
curl -s -X POST $API_URL/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"USB-C Cable","price":15,"stock":100}' | json_pp 2>/dev/null || \
curl -s -X POST $API_URL/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"USB-C Cable","price":15,"stock":100}'
echo -e "\n\n"

# Test Users Service
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 2: Users Service${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}2.1 Get all users:${NC}"
curl -s $API_URL/api/users | json_pp 2>/dev/null || curl -s $API_URL/api/users
echo -e "\n"

echo -e "${YELLOW}2.2 Get single user:${NC}"
curl -s $API_URL/api/users/1 | json_pp 2>/dev/null || curl -s $API_URL/api/users/1
echo -e "\n"

echo -e "${YELLOW}2.3 Create new user:${NC}"
curl -s -X POST $API_URL/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Eve Wilson","email":"eve@example.com"}' | json_pp 2>/dev/null || \
curl -s -X POST $API_URL/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Eve Wilson","email":"eve@example.com"}'
echo -e "\n\n"

# Test Orders Service (Most important - shows inter-service communication)
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 3: Orders Service (Inter-Service)${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}3.1 Create order (triggers calls to Products Service):${NC}"
curl -s -X POST $API_URL/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [
      {"productId": 1, "quantity": 2},
      {"productId": 2, "quantity": 1}
    ]
  }' | json_pp 2>/dev/null || \
curl -s -X POST $API_URL/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [
      {"productId": 1, "quantity": 2},
      {"productId": 2, "quantity": 1}
    ]
  }'
echo -e "\n"

echo -e "${YELLOW}3.2 Get all orders:${NC}"
curl -s $API_URL/api/orders | json_pp 2>/dev/null || curl -s $API_URL/api/orders
echo -e "\n"

echo -e "${YELLOW}3.3 Get user orders:${NC}"
curl -s $API_URL/api/orders/user/1 | json_pp 2>/dev/null || curl -s $API_URL/api/orders/user/1
echo -e "\n\n"

# Load test
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TEST 4: Load Generation (10 orders)${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}Creating 10 orders to generate traces...${NC}"
for i in {1..10}; do
    echo -ne "${YELLOW}Order $i/10... ${NC}"
    curl -s -X POST $API_URL/api/orders \
      -H "Content-Type: application/json" \
      -d "{\"userId\": $((($i % 3) + 1)), \"items\": [{\"productId\": $((($i % 4) + 1)), \"quantity\": 1}]}" > /dev/null
    echo -e "${GREEN}✓${NC}"
    sleep 0.5
done
echo -e "\n"

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ All tests completed!${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Open SigNoz dashboard: ${GREEN}http://localhost:3301${NC}"
echo -e "2. Go to 'Traces' to see distributed traces"
echo -e "3. Go to 'Service Map' to see service dependencies"
echo -e "4. Look for orders-service traces to see inter-service communication\n"
