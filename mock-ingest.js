const http = require('http');

const PORT = Number(process.env.PORT || 3000);

function fail(res, reason) {
  console.log(`  REJECTED: ${reason}\n`);
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: reason }));
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    console.log(`${req.method} ${req.url}  (${body.length} bytes)`);

    const path = req.url.match(/^\/api\/([^/]+)\/envelope\/?$/);
    if (req.method !== 'POST' || !path) {
      return fail(res, 'expected POST to /api/<project_id>/envelope/');
    }

    const auth = req.headers['x-sentry-auth'];
    if (!auth) return fail(res, 'missing X-Sentry-Auth header');
    const key = auth.match(/sentry_key=([^,\s]+)/);
    if (!key) return fail(res, `X-Sentry-Auth has no sentry_key: ${auth}`);
    console.log(`  project=${path[1]} key=${key[1]}`);

    const client = auth.match(/sentry_client=([^,\s]+)/);
    if (client) console.log(`  client=${client[1]}`);

    const lines = body.toString('utf8').split('\n').filter((l) => l.trim());
    if (lines.length < 3) {
      return fail(res, `envelope needs 3 lines, got ${lines.length}`);
    }

    const names = ['envelope header', 'item header', 'event'];
    const parsed = [];
    for (let i = 0; i < 3; i++) {
      try {
        parsed.push(JSON.parse(lines[i]));
      } catch (e) {
        return fail(res, `${names[i]} is not valid JSON: ${e.message}`);
      }
    }
    const [envelopeHeader, itemHeader, event] = parsed;

    if (itemHeader.type !== 'event') {
      return fail(res, `item header type should be "event", got ${JSON.stringify(itemHeader.type)}`);
    }

    const id = event.event_id;
    if (!/^[0-9a-f]{32}$/.test(id || '')) {
      return fail(res, `event_id should be 32 lowercase hex chars, got ${JSON.stringify(id)}`);
    }
    if (envelopeHeader.event_id !== id) {
      return fail(res, `event_id differs between envelope header and event`);
    }

    if ('timestamp' in event) {
      const t = event.timestamp;
      const seconds = typeof t === 'number' ? t : Date.parse(t) / 1000;
      if (!seconds) {
        return fail(res, `timestamp should be unix seconds or ISO 8601, got ${JSON.stringify(t)}`);
      }
      const skew = Math.abs(seconds - Date.now() / 1000);
      const note = skew > 86400 ? `  <-- ${Math.round(skew / 86400)} days off, check your clock math` : '';
      console.log(`  timestamp=${t}${note}`);
    } else {
      console.log('  timestamp omitted, server will stamp on receipt');
    }

    if (event.exception) {
      const v = event.exception.values[0];
      console.log(`  ${event.level}: ${v.type}: ${v.value}`);
      const frames = v.stacktrace && v.stacktrace.frames;
      if (frames) {
        console.log(`  stacktrace, ${frames.length} frames, crashing frame last:`);
        for (const f of frames) {
          console.log(`    ${f.filename || '?'}:${f.lineno || '?'} in ${f.function || '?'}`);
        }
      }
    } else if (event.logentry) {
      console.log(`  ${event.level}: ${event.logentry.formatted}`);
    } else {
      return fail(res, 'event has neither logentry nor exception');
    }

    console.log(`  ACCEPTED ${id}\n`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock sentry ingest on http://127.0.0.1:${PORT}`);
  console.log(`DSN: http://testkey@127.0.0.1:${PORT}/42\n`);
});
