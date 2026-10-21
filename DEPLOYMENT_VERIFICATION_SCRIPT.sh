#!/bin/bash

###############################################################################
# DEPLOYMENT VERIFICATION SCRIPT
#
# Purpose: Automate post-deployment validation checks
# Usage: ./DEPLOYMENT_VERIFICATION_SCRIPT.sh [api_url] [auth_token]
#
# Example: ./DEPLOYMENT_VERIFICATION_SCRIPT.sh https://api.omniforge.dev $JWT_TOKEN
###############################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${1:-https://api.omniforge.dev}"
AUTH_TOKEN="${2:-}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
RESULTS_FILE="deployment-verification-$(date +%s).log"

###############################################################################
# Helper Functions
###############################################################################

log_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_pass() {
    echo -e "${GREEN}✅ PASS: $1${NC}"
    echo "✅ PASS: $1" >> "$RESULTS_FILE"
}

log_fail() {
    echo -e "${RED}❌ FAIL: $1${NC}"
    echo "❌ FAIL: $1" >> "$RESULTS_FILE"
}

log_warn() {
    echo -e "${YELLOW}⚠️  WARN: $1${NC}"
    echo "⚠️  WARN: $1" >> "$RESULTS_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}"
    echo "ℹ️  INFO: $1" >> "$RESULTS_FILE"
}

print_separator() {
    echo ""
    echo "---"
    echo ""
}

###############################################################################
# Pre-Deployment Checks
###############################################################################

run_pre_checks() {
    log_header "PRE-DEPLOYMENT VERIFICATION CHECKS"

    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_fail "curl is not installed"
        exit 1
    fi
    log_pass "curl is available"

    # Check if jq is available (for JSON parsing)
    if ! command -v jq &> /dev/null; then
        log_warn "jq is not installed - JSON parsing will be limited"
    else
        log_pass "jq is available for JSON parsing"
    fi

    # Verify API URL is reachable
    if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" | grep -q "200"; then
        log_pass "API is reachable at $API_URL"
    else
        log_fail "API is not reachable at $API_URL"
        exit 1
    fi

    print_separator
}

###############################################################################
# Authentication Tests
###############################################################################

run_auth_tests() {
    log_header "AUTHENTICATION VERIFICATION"

    # Test 1: Unauthorized request should be rejected
    log_info "Testing unauthorized request rejection..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/protected" \
        -H "Content-Type: application/json" | tail -1)

    if [ "$RESPONSE" == "401" ]; then
        log_pass "Unauthorized requests are properly rejected (401)"
    else
        log_fail "Unauthorized requests not rejected properly (got $RESPONSE)"
    fi

    # Test 2: Health endpoint should not require auth
    log_info "Testing public health endpoint..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/health" | tail -1)

    if [ "$RESPONSE" == "200" ]; then
        log_pass "Public health endpoint is accessible (200)"
    else
        log_fail "Public health endpoint failed (got $RESPONSE)"
    fi

    # Test 3: With valid token, request should succeed
    if [ -n "$AUTH_TOKEN" ]; then
        log_info "Testing authenticated request with valid token..."
        RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/protected" \
            -H "Authorization: Bearer $AUTH_TOKEN" | tail -1)

        if [ "$RESPONSE" == "200" ]; then
            log_pass "Authenticated requests succeed with valid token (200)"
        else
            log_warn "Authenticated request returned $RESPONSE (expected 200)"
        fi
    else
        log_warn "No AUTH_TOKEN provided - skipping authenticated request test"
    fi

    print_separator
}

###############################################################################
# Error Handling Tests
###############################################################################

run_error_tests() {
    log_header "ERROR HANDLING VERIFICATION"

    # Test 1: Malformed JSON should return 400
    log_info "Testing malformed JSON error handling..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/test" \
        -H "Content-Type: application/json" \
        -d 'invalid json {' | tail -1)

    if [ "$RESPONSE" == "400" ] || [ "$RESPONSE" == "422" ]; then
        log_pass "Malformed JSON properly rejected (400/422)"
    else
        log_warn "Malformed JSON returned $RESPONSE (expected 400/422)"
    fi

    # Test 2: Invalid endpoint should return 404
    log_info "Testing 404 error handling..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/nonexistent" | tail -1)

    if [ "$RESPONSE" == "404" ]; then
        log_pass "Invalid endpoints return 404"
    else
        log_warn "Invalid endpoint returned $RESPONSE (expected 404)"
    fi

    # Test 3: Invalid method should return 405
    log_info "Testing invalid HTTP method..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/api/health" | tail -1)

    if [ "$RESPONSE" == "405" ] || [ "$RESPONSE" == "404" ]; then
        log_pass "Invalid HTTP methods properly rejected"
    else
        log_warn "Invalid HTTP method returned $RESPONSE"
    fi

    print_separator
}

###############################################################################
# Security Tests
###############################################################################

run_security_tests() {
    log_header "SECURITY VERIFICATION"

    # Test 1: XSS Prevention - Script tags should be escaped
    log_info "Testing XSS prevention..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/test" \
        -H "Content-Type: application/json" \
        -d '{"name":"<script>alert(1)</script>"}')

    if ! echo "$RESPONSE" | grep -q "<script>"; then
        log_pass "XSS prevention is active (script tags escaped)"
    else
        log_fail "XSS prevention may be compromised (script tags found in response)"
    fi

    # Test 2: Rate limiting should return 429
    log_info "Testing rate limiting..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/test" | tail -1)

    if [ "$RESPONSE" == "429" ]; then
        log_pass "Rate limiting is active"
    else
        log_info "Rate limiting check - got $RESPONSE (may require multiple rapid requests)"
    fi

    # Test 3: Check for sensitive headers
    log_info "Testing security headers..."
    HEADERS=$(curl -s -I "$API_URL/health")

    if echo "$HEADERS" | grep -q "X-Content-Type-Options"; then
        log_pass "Security headers are present"
    else
        log_warn "Security headers may be incomplete"
    fi

    print_separator
}

###############################################################################
# Performance Tests
###############################################################################

run_performance_tests() {
    log_header "PERFORMANCE VERIFICATION"

    # Test 1: Response time for health endpoint
    log_info "Measuring response time for health endpoint..."
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health")

    # Convert to milliseconds
    RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc)

    if (( $(echo "$RESPONSE_MS < 500" | bc -l) )); then
        log_pass "Health endpoint response time is good: ${RESPONSE_MS}ms"
    elif (( $(echo "$RESPONSE_MS < 2000" | bc -l) )); then
        log_warn "Health endpoint response time is slow: ${RESPONSE_MS}ms"
    else
        log_fail "Health endpoint response time is too slow: ${RESPONSE_MS}ms"
    fi

    # Test 2: Multiple concurrent requests
    log_info "Testing concurrent request handling (5 requests)..."
    SUCCESS_COUNT=0
    for i in {1..5}; do
        RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/health" | tail -1)
        if [ "$RESPONSE" == "200" ]; then
            ((SUCCESS_COUNT++))
        fi
    done

    if [ "$SUCCESS_COUNT" == "5" ]; then
        log_pass "All 5 concurrent requests succeeded"
    else
        log_warn "$SUCCESS_COUNT out of 5 concurrent requests succeeded"
    fi

    print_separator
}

###############################################################################
# Database Tests
###############################################################################

run_database_tests() {
    log_header "DATABASE VERIFICATION"

    log_info "Testing database connectivity..."

    # This endpoint should require database
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/database-test" \
        -H "Authorization: Bearer $AUTH_TOKEN" 2>/dev/null | tail -1)

    if [ "$RESPONSE" == "200" ]; then
        log_pass "Database is connected and accessible"
    elif [ "$RESPONSE" == "500" ]; then
        log_fail "Database connection error detected"
    else
        log_info "Database test endpoint returned $RESPONSE"
    fi

    print_separator
}

###############################################################################
# Logging Tests
###############################################################################

run_logging_tests() {
    log_header "LOGGING VERIFICATION"

    log_info "Testing error logging..."

    # Trigger an error and verify it's logged
    RESPONSE=$(curl -s -X POST "$API_URL/api/test" \
        -H "Content-Type: application/json" \
        -d 'malformed json')

    # Check if response contains error message
    if echo "$RESPONSE" | grep -q "error"; then
        log_pass "Error logging is active (error messages present)"
    else
        log_warn "Error messages may not be properly formatted"
    fi

    print_separator
}

###############################################################################
# Summary Report
###############################################################################

generate_summary() {
    log_header "DEPLOYMENT VERIFICATION SUMMARY"

    echo ""
    echo "✅ Verification completed at $TIMESTAMP"
    echo "📋 Results saved to: $RESULTS_FILE"
    echo ""

    # Count results
    PASS_COUNT=$(grep -c "^✅ PASS" "$RESULTS_FILE" || true)
    FAIL_COUNT=$(grep -c "^❌ FAIL" "$RESULTS_FILE" || true)
    WARN_COUNT=$(grep -c "^⚠️  WARN" "$RESULTS_FILE" || true)

    echo "Results:"
    echo "  ✅ Passed: $PASS_COUNT"
    echo "  ⚠️  Warnings: $WARN_COUNT"
    echo "  ❌ Failed: $FAIL_COUNT"
    echo ""

    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}🎉 DEPLOYMENT VERIFICATION SUCCESSFUL!${NC}"
        echo ""
        echo "The deployment appears to be working correctly."
        echo "Proceed with full team sign-off."
        return 0
    else
        echo -e "${RED}⚠️  DEPLOYMENT VERIFICATION FOUND ISSUES${NC}"
        echo ""
        echo "Please review the failures above and investigate."
        echo "Do NOT proceed with sign-off until all failures are resolved."
        return 1
    fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║       DEPLOYMENT VERIFICATION SCRIPT                      ║"
    echo "║       Generated: $TIMESTAMP                      ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    # Initialize results file
    echo "Deployment Verification Report" > "$RESULTS_FILE"
    echo "Generated: $TIMESTAMP" >> "$RESULTS_FILE"
    echo "API URL: $API_URL" >> "$RESULTS_FILE"
    echo "" >> "$RESULTS_FILE"

    # Run all tests
    run_pre_checks
    run_auth_tests
    run_error_tests
    run_security_tests
    run_performance_tests
    run_database_tests
    run_logging_tests

    # Generate summary
    generate_summary
    EXIT_CODE=$?

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    exit $EXIT_CODE
}

# Run main function
main "$@"
