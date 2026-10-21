#!/bin/bash

# Fix all vitest imports to use @jest/globals
cd "C:\Users\Administrator\OmniCompany\dashboard"

# List of files to fix
FILES=(
  "lib/async-route.test.ts"
  "app/api/meetings/__tests__/route.test.ts"
  "app/api/__tests__/api-integration.test.ts"
  "app/api/__tests__/error-edge-cases.test.ts"
  "app/api/__tests__/error-handling-comprehensive.test.ts"
  "app/api/__tests__/error-integration.test.ts"
  "app/api/__tests__/error-logging.test.ts"
  "app/api/__tests__/error-security.test.ts"
  "app/api/__tests__/file-operations.test.ts"
  "app/api/__tests__/xss-prevention.test.ts"
  "lib/auth-middleware.test.ts"
  "lib/logger.test.ts"
  "lib/validation/index.test.ts"
  "lib/validation/middleware.test.ts"
  "lib/validation/validation.integration.test.ts"
)

# Replace vitest imports with jest imports
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Replace import statements
    sed -i "s/import.*from 'vitest'/import { describe, it, expect, beforeEach, afterEach } from '@jest\/globals'/g" "$file"
    # Remove vi. prefix from mock functions
    sed -i "s/vi\.mock/jest.mock/g" "$file"
    sed -i "s/vi\.spyOn/jest.spyOn/g" "$file"
    sed -i "s/vi\.fn/jest.fn/g" "$file"
    sed -i "s/vi\.resetAllMocks/jest.resetAllMocks/g" "$file"
    echo "Fixed: $file"
  fi
done

echo "Framework unification complete"
