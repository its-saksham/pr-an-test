const fs = require('fs');
const path = require('path');

/**
 * Script to generate large diffs for testing PR Risk Analyzer.
 * It takes a file path and duplicates its content N times to simulate a large change.
 */

const filePath = process.argv[2] || 'src/utils/helper.js';
const targetFile = process.argv[3] || 'src/utils/helper_large.js';
const repetitions = parseInt(process.argv[4]) || 100;

const absolutePath = path.resolve(__dirname, '..', filePath);
const absoluteTargetPath = path.resolve(__dirname, '..', targetFile);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: File not found at ${absolutePath}`);
  process.exit(1);
}

const content = fs.readFileSync(absolutePath, 'utf8');
let largeContent = content + '\n\n';

for (let i = 0; i < repetitions; i++) {
  largeContent += `/**
 * Generated block ${i}
 * This is a duplicated block to simulate a large diff.
 */
function duplicatedFunction_${i}() {
  return "This is a duplicated string for block ${i}";
}

`;
}

fs.writeFileSync(absoluteTargetPath, largeContent);
console.log(`Success: Generated ${largeContent.split('\n').length} lines in ${targetFile}`);
