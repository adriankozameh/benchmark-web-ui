import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  'src/App.tsx',
  'src/components/AddressSearch.tsx',
  'src/components/MapPicker.tsx',
  'src/components/ForecastDashboard.tsx',
  'src/components/StationHardwareEditor.tsx',
  '../../packages/validation/src/index.ts',
];
const translationSource = ts.createSourceFile('language.ts', fs.readFileSync(path.join(root, 'src/language.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let spanish = new Set();
function collectSpanish(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(translationSource) === 'spanish' && ts.isObjectLiteralExpression(node.initializer)) {
    spanish = new Set(node.initializer.properties.map((entry) => entry.name.text));
  }
  ts.forEachChild(node, collectSpanish);
}
collectSpanish(translationSource);

const allowOriginal = new Set(['English', 'Español', 'cp apps/web/.env.example apps/web/.env']);
const missing = new Set();
function check(text, file) {
  if (/[A-Za-zÁ-ÿ]/.test(text) && !spanish.has(text) && !allowOriginal.has(text)) missing.add(`${file}: ${text}`);
}

for (const file of files) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  // Login and Cognito are outside the user-preferences localization scope.
  const checked = file === 'src/App.tsx' ? content.slice(content.indexOf('function AuthenticatedApp({')) : content;
  const source = ts.createSourceFile(file, checked, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text, file);
    if (ts.isPropertyAssignment(node) && ['message', 'label'].includes(node.name.getText(source)) &&
      ts.isStringLiteral(node.initializer)) check(node.initializer.text, file);
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer) &&
      node.parent?.parent && ts.isVariableDeclaration(node.parent.parent) &&
      node.parent.parent.name.getText(source) === 'METRIC_LABELS') check(node.initializer.text, file);
    if (ts.isBinaryExpression(node) && node.left.getText(source).startsWith('errors.') &&
      ts.isStringLiteral(node.right)) check(node.right.text, file);
    if (ts.isJsxText(node)) check(node.text.replace(/\s+/g, ' ').trim(), file);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (missing.size) {
  console.error('Missing Spanish translations:\n' + [...missing].sort().join('\n'));
  process.exitCode = 1;
} else {
  console.log('Spanish translations cover the current frontend text.');
}
