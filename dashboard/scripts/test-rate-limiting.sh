#!/bin/bash

# Rate Limiting Test Script
# This script tests the rate limiting implementation

echo "======================================"
echo "Rate Limiting Test Suite"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
LOGIN_ENDPOINT="$BASE_URL/api/auth/login"
TEST_EMAIL="admin@example.com"
TEST_PASSWORD="admin"

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper function to test endpoint
test_endpoint() {
  local name=$1
  local url=$2
  local method=$3
  local data=$4
  local expected_status=$5

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ -z "$method" ]; then
    method="GET"
  fi

  echo -n "Test $TOTAL_TESTS: $name... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} (Status: $status)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}FAIL${NC} (Expected: $expected_status, Got: $status)"
    echo "  Response: $body"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Test 1: Single request should succeed
echo -e "${YELLOW}Phase 1: Basic Functionality${NC}"
test_endpoint \
  "First login attempt (should succeed)" \
  "$LOGIN_ENDPOINT" \
  "POST" \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  "200"

# Test 2-5: Additional requests within limit
for i in {2..5}; do
  test_endpoint \
    "Login attempt $i (within limit)" \
    "$LOGIN_ENDPOINT" \
    "POST" \
    "{\"email\":\"wrong@example.com\",\"password\":\"wrong\"}" \
    "401"
done

# Test 6: Should be rate limited
test_endpoint \
  "Login attempt 6 (should be rate limited)" \
  "$LOGIN_ENDPOINT" \
  "POST" \
  "{\"email\":\"test@example.com\",\"password\":\"test\"}" \
  "429"

echo ""
echo -e "${YELLOW}Phase 2: Rate Limit Headers${NC}"

# Test rate limit headers
echo -n "Test $((TOTAL_TESTS + 1)): Rate limit headers present... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))

response=$(curl -s -i -X POST "$LOGIN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"test\"}")

if echo "$response" | grep -q "X-RateLimit-Limit"; then
  echo -e "${GREEN}PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))

  echo "  Headers found:"
  echo "$response" | grep "X-RateLimit" | sed 's/^/    /'
else
  echo -e "${RED}FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""
echo -e "${YELLOW}Phase 3: Different Clients (IP isolation)${NC}"

# Reset with new IP
echo -n "Test $((TOTAL_TESTS + 1)): Different IP should have independent limit... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))

response=$(curl -s -w "\n%{http_code}" -X POST "$LOGIN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.1.200" \
  -d "{\"email\":\"test@example.com\",\"password\":\"test\"}")

status=$(echo "$response" | tail -n1)

if [ "$status" != "429" ]; then
  echo -e "${GREEN}PASS${NC} (Different IP has available quota)"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}FAIL${NC} (Different IP was rate limited - isolation not working)"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""
echo "======================================"
echo "Test Results"
echo "======================================"
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
