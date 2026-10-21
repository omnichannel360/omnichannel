#!/usr/bin/env node

/**
 * Six Sigma Test Audit Analyzer - Task 22/150
 * Comprehensive test quality assessment across all test files
 */

const fs = require('fs');
const path = require('path');

const dashboardPath = 'C:\\Users\\Administrator\\OmniCompany\\dashboard';
const testPattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

const metrics = {
  totalFiles: 0,
  totalLines: 0,
  defectsFound: 0,
  defectsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  aaaPattern: { compliant: 0, nonCompliant: 0 },
  mockCoverage: { mocked: 0, notMocked: 0 },
  typeUnsafety: { violations: [] },
  testIsolation: { broken: 0, fixed: 0 },
  assertions: { total: 0, avgPerTest: 0 },
  edgeCases: { identified: 0 },
};

const defects = [];

function findTestFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
      files = files.concat(findTestFiles(fullPath));
    } else if (item.isFile() && testPattern.test(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const fileName = path.relative(dashboardPath, filePath);

    metrics.totalFiles++;
    metrics.totalLines += lines.length;

    // AAA Pattern Analysis
    const arrangeCount = (content.match(/\/\/\s*Arrange/gi) || []).length;
    const actCount = (content.match(/\/\/\s*Act/gi) || []).length;
    const assertCount = (content.match(/\/\/\s*Assert/gi) || []).length;
    const testCount = (content.match(/it\('|it\("/g) || []).length;

    if (arrangeCount === actCount && actCount === assertCount && arrangeCount === testCount) {
      metrics.aaaPattern.compliant++;
    } else if (arrangeCount > 0) {
      metrics.aaaPattern.nonCompliant++;
    }

    // Type Unsafety (as any, as unknown)
    const typeUnsafeMatches = content.match(/ as (any|unknown)/g) || [];
    if (typeUnsafeMatches.length > 0) {
      metrics.defectsFound++;
      metrics.defectsBySeverity.CRITICAL += typeUnsafeMatches.length;
      typeUnsafeMatches.forEach((match, idx) => {
        const lineNum = content.substring(0, content.lastIndexOf(match)).split('\n').length;
        defects.push({
          file: fileName,
          line: lineNum,
          severity: 'CRITICAL',
          type: 'Type Unsafety',
          message: `Unsafe type cast: ${match}`,
          fix: 'Replace with proper types or unknown with safe narrowing',
        });
      });
    }

    // Mock Coverage
    const fetchCalls = (content.match(/fetch\(/g) || []).length;
    const mockFetchCalls = (content.match(/vi\.fn\(|jest\.fn\(|mock/gi) || []).length;
    if (fetchCalls > 0) {
      if (mockFetchCalls >= fetchCalls) {
        metrics.mockCoverage.mocked++;
      } else {
        metrics.mockCoverage.notMocked++;
        defects.push({
          file: fileName,
          severity: 'HIGH',
          type: 'Mock Coverage',
          message: `${fetchCalls} fetch calls detected, only ${mockFetchCalls} appear mocked`,
          fix: 'Mock all external API calls with vi.fn() or jest.fn()',
        });
      }
    }

    // Test Isolation - beforeAll vs beforeEach
    const beforeAllCount = (content.match(/beforeAll\s*\(/g) || []).length;
    const beforeEachCount = (content.match(/beforeEach\s*\(/g) || []).length;

    if (beforeAllCount > 0 && beforeEachCount === 0) {
      metrics.testIsolation.broken++;
      defects.push({
        file: fileName,
        severity: 'HIGH',
        type: 'Test Isolation',
        message: `Using beforeAll (${beforeAllCount}x) creates shared state. Use beforeEach instead.`,
        fix: 'Replace all beforeAll with beforeEach to ensure test isolation',
      });
    } else if (beforeEachCount > 0) {
      metrics.testIsolation.fixed++;
    }

    // Assertion Density
    const expectCalls = (content.match(/expect\(/g) || []).length;
    metrics.assertions.total += expectCalls;
    if (testCount > 0) {
      metrics.assertions.avgPerTest = (metrics.assertions.total / (metrics.totalFiles * 5)).toFixed(2);
    }

    if (testCount > 0 && expectCalls / testCount < 2) {
      metrics.edgeCases.identified++;
      defects.push({
        file: fileName,
        severity: 'MEDIUM',
        type: 'Low Assertion Density',
        message: `Average ${(expectCalls / testCount).toFixed(1)} assertions per test (target: 3+)`,
        fix: 'Add more assertions to verify behavior, mock interactions, and edge cases',
      });
    }

    // Edge Case Coverage - check for null/undefined tests
    const nullTests = (content.match(/null|undefined/gi) || []).length;
    if (nullTests === 0 && testCount > 5) {
      defects.push({
        file: fileName,
        severity: 'MEDIUM',
        type: 'Missing Edge Cases',
        message: 'No null/undefined edge case tests detected',
        fix: 'Add tests for null, undefined, empty array, empty string, and boundary values',
      });
    }
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
  }
}

// Main execution
console.log('🔍 Six Sigma Test Audit 22/150 - DMAIC Measure Phase\n');
console.log('Scanning test files...\n');

const testFiles = findTestFiles(dashboardPath);
testFiles.forEach((file) => analyzeFile(file));

// Calculate Sigma Level
const dpmo = (metrics.defectsFound / (metrics.totalFiles * 1000)) * 1000000;
let sigmaLevel = 3;
if (dpmo < 6210) sigmaLevel = 4;
if (dpmo < 233) sigmaLevel = 5;
if (dpmo < 3.4) sigmaLevel = 6;
if (dpmo < 0.019) sigmaLevel = 7;

console.log('='.repeat(70));
console.log('BASELINE METRICS - Current State');
console.log('='.repeat(70));
console.log(`\n📊 Coverage:`);
console.log(`  Total test files: ${metrics.totalFiles}`);
console.log(`  Total test lines: ${metrics.totalLines}`);
console.log(`  Total defects found: ${metrics.defectsFound}`);
console.log(`  DPMO (Defects Per Million): ${dpmo.toFixed(0)}`);
console.log(`  Sigma Level: ${sigmaLevel.toFixed(1)}σ`);
console.log(`  Gap to Omega (12-13σ): ${(13 - sigmaLevel).toFixed(1)} sigma levels`);

console.log(`\n🎯 AAA Pattern Compliance:`);
console.log(`  Fully compliant: ${metrics.aaaPattern.compliant}`);
console.log(`  Partially compliant: ${metrics.aaaPattern.nonCompliant}`);
console.log(`  Compliance rate: ${((metrics.aaaPattern.compliant / (metrics.aaaPattern.compliant + metrics.aaaPattern.nonCompliant)) * 100 || 0).toFixed(1)}%`);

console.log(`\n🔒 Type Safety:`);
console.log(`  Type cast violations: ${metrics.typeUnsafety.violations.length}`);

console.log(`\n🧪 Mock Coverage:`);
console.log(`  Properly mocked: ${metrics.mockCoverage.mocked}`);
console.log(`  Not fully mocked: ${metrics.mockCoverage.notMocked}`);

console.log(`\n🔀 Test Isolation:`);
console.log(`  Using beforeEach (good): ${metrics.testIsolation.fixed}`);
console.log(`  Using beforeAll (bad): ${metrics.testIsolation.broken}`);

console.log(`\n📈 Assertions:`);
console.log(`  Total assertions: ${metrics.assertions.total}`);
console.log(`  Average per test: ${metrics.assertions.avgPerTest}`);
console.log(`  Target per test: 3.0`);

console.log(`\n🔍 Edge Cases:`);
console.log(`  Files with low edge case coverage: ${metrics.edgeCases.identified}`);

console.log('\n' + '='.repeat(70));
console.log(`TOP DEFECTS (First 20 of ${defects.length})`);
console.log('='.repeat(70));

defects.slice(0, 20).forEach((defect, idx) => {
  console.log(`\n${idx + 1}. [${defect.severity}] ${defect.type}`);
  console.log(`   File: ${defect.file}`);
  if (defect.line) console.log(`   Line: ${defect.line}`);
  console.log(`   Issue: ${defect.message}`);
  console.log(`   Fix: ${defect.fix}`);
});

console.log('\n' + '='.repeat(70));
console.log('Summary for Root Cause Analysis');
console.log('='.repeat(70));
console.log(`\nSeverity breakdown:`);
console.log(`  CRITICAL: ${metrics.defectsBySeverity.CRITICAL} issues`);
console.log(`  HIGH: ${metrics.defectsBySeverity.HIGH} issues`);
console.log(`  MEDIUM: ${metrics.defectsBySeverity.MEDIUM} issues`);
console.log(`  LOW: ${metrics.defectsBySeverity.LOW} issues`);

// Save full report
const fullReport = JSON.stringify({ metrics, defects }, null, 2);
fs.writeFileSync(
  'C:\\Users\\Administrator\\OmniCompany\\TEST_AUDIT_22_BASELINE_METRICS.json',
  fullReport
);

console.log('\n✅ Full report saved: TEST_AUDIT_22_BASELINE_METRICS.json');
