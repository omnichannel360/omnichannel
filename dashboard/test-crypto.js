const { randomUUID } = require('crypto');
const validation = require('./lib/validation.ts');

console.log('Testing crypto functionality:');
console.log('randomUUID() exists:', typeof randomUUID === 'function');
console.log('Sample UUID:', randomUUID());
console.log('generateId() test:', typeof validation.generateId === 'function');
console.log('✓ Crypto imports working correctly');
