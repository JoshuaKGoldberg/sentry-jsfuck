const fs = require('fs');
const path = require('path');
const JScrewIt = require('jscrewit');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'src/sdk.js'), 'utf8');

// JScrewIt, not the `jsfuck` npm package: that one is unmaintained since 2015,
// emits ~16x larger output than its own master branch, and its CLI defaults to
// wrapWithEval=false, which produces an inert string literal that runs nothing.
const encoded = JScrewIt.encode(source, {
  features: 'NODE_22_12',
  runAs: 'express-eval',
});

if (!/^[[\]()!+]+$/.test(encoded)) {
  const stray = [...new Set(encoded.replace(/[[\]()!+]/g, ''))].join('');
  throw new Error(`encoded output left the []()!+ charset: ${JSON.stringify(stray)}`);
}

const out = path.join(root, 'dist/sentry.jsfuck.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encoded);

// The artifact is a library, so evaluating it must define the API and do nothing
// else. A build that silently starts sending events is the failure to catch here.
const probe = require('child_process').spawnSync(
  process.execPath,
  ['-e', `require(${JSON.stringify(out)}); console.log(Object.keys(globalThis.Sentry || {}).join(','))`],
  { encoding: 'utf8' }
);
const api = probe.stdout.trim();
if (api !== 'init,captureMessage,captureException') {
  throw new Error(`artifact did not define the expected API, got: ${api || probe.stderr}`);
}

console.log(`source:  ${source.length} chars`);
console.log(`encoded: ${encoded.length} chars (${(encoded.length / 1024).toFixed(1)} KiB)`);
console.log(`ratio:   ${(encoded.length / source.length).toFixed(1)}x`);
console.log(`charset: ${[...new Set(encoded)].sort().join('')}`);
console.log(`api:     globalThis.Sentry { ${api.split(',').join(', ')} }`);
console.log(`wrote:   ${path.relative(root, out)}`);
