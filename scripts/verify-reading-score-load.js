const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readingPages = fs.readdirSync(root)
  .filter((fileName) => /^ielts-reading-(?:test|ended)(?:-[a-z0-9-]+)?\.html$/i.test(fileName));

const missingScorer = readingPages.filter((fileName) => {
  const source = fs.readFileSync(path.join(root, fileName), 'utf8');
  return !/<script\s+src="reading-score\.js\?v=[^"]+"/i.test(source);
});

if (missingScorer.length) {
  throw new Error(`Reading scorer missing from: ${missingScorer.join(', ')}`);
}

const scorerSource = fs.readFileSync(path.join(root, 'reading-score.js'), 'utf8');
const requiredStateHandlers = [
  'function restoreComplexAnswerWidgets',
  'delete merged[qNum]',
  'function queueAnswerSave',
];
const missingStateHandlers = requiredStateHandlers.filter((handler) => !scorerSource.includes(handler));

if (missingStateHandlers.length) {
  throw new Error(`Reading state persistence handlers missing: ${missingStateHandlers.join(', ')}`);
}

console.log(`Verified reading scorer and state persistence on ${readingPages.length} Reading test and completion pages.`);
