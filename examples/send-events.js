require('sentry-jsfuck');

const Sentry = globalThis.Sentry;

Sentry.init(process.argv[2] || 'http://testkey@127.0.0.1:3003/42');

const messageId = Sentry.captureMessage('hello from six characters', (status, body) => {
  console.log(`captureMessage -> ${status} ${body}`);
});
console.log(`captureMessage id: ${messageId}`);

function parseConfig() {
  return JSON.parse('{ this is not json }');
}

function boot() {
  return parseConfig();
}

try {
  boot();
} catch (err) {
  const exceptionId = Sentry.captureException(err, (status, body) => {
    console.log(`captureException -> ${status} ${body}`);
  });
  console.log(`captureException id: ${exceptionId}`);
}
