import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);

// Model the basename lookup used by typical macOS volumes, even when CI runs on Linux.
function ignoreCase(filename) {
  if (fs.existsSync(filename)) return filename;
  const directory = path.dirname(filename);
  if (!fs.existsSync(directory)) return filename;
  const name = fs.readdirSync(directory).find(entry => entry.toLowerCase() === path.basename(filename).toLowerCase());
  return name ? path.join(directory, name) : filename;
}

const host = {
  fileExists: filename => ts.sys.fileExists(ignoreCase(filename)),
  readFile: filename => ts.sys.readFile(ignoreCase(filename)),
  directoryExists: ts.sys.directoryExists,
  useCaseSensitiveFileNames: false,
};

for (const component of ['AdminSubscriptions', 'StationSites']) {
  test(`${component} resolves to its React component on a case-insensitive filesystem`, () => {
    const result = ts.resolveModuleName(`./components/${component}`, path.join(root, 'src/App.tsx'), options, host);
    assert.equal(result.resolvedModule?.resolvedFileName, path.join(root, `src/components/${component}.tsx`));
  });
}
