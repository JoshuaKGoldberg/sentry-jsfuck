(function (global) {
  var CLIENT = 'sentry.jsfuck/0.1.0';

  // JSFuck runs through the Function constructor, whose body evaluates in global
  // scope — `require` does not exist there. getBuiltinModule is a real global.
  var http = process.getBuiltinModule('node:http');

  var dsn = null;

  function parseDsn(str) {
    var afterScheme = str.split('//')[1];
    var at = afterScheme.split('@');
    var hostPortPath = at[1];
    var lastSlash = hostPortPath.lastIndexOf('/');
    var hostPort = hostPortPath.slice(0, lastSlash).split(':');
    return {
      publicKey: at[0],
      host: hostPort[0],
      port: hostPort[1],
      projectId: hostPortPath.slice(lastSlash + 1),
    };
  }

  function eventId() {
    return crypto.randomUUID().split('-').join('');
  }

  function parseStack(stack) {
    if (!stack) return null;
    var frames = [];
    var lines = String(stack).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var at = lines[i].match(/^\s*at\s+(.*)$/);
      if (!at) continue;
      var rest = at[1];
      var loc = rest.match(/([^\s()]+):(\d+):(\d+)\)?\s*$/);
      if (!loc) continue;
      var paren = rest.indexOf(' (');
      var frame = { filename: loc[1] };
      if (paren > 0) frame.function = rest.slice(0, paren);
      frame.lineno = Number(loc[2]);
      frames.push(frame);
    }
    // V8 prints the crashing frame first; Sentry wants it last.
    frames.reverse();
    return frames.length ? { frames: frames } : null;
  }

  function send(event, done) {
    var body =
      JSON.stringify({ event_id: event.event_id }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify(event) +
      '\n';

    var req = http.request(
      {
        host: dsn.host,
        port: dsn.port,
        method: 'POST',
        path: '/api/' + dsn.projectId + '/envelope/',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'Content-Length': Buffer.byteLength(body),
          'X-Sentry-Auth':
            'Sentry sentry_version=7, sentry_key=' +
            dsn.publicKey +
            ', sentry_client=' +
            CLIENT,
          Connection: 'close',
        },
      },
      function (res) {
        var chunks = '';
        res.on('data', function (c) {
          chunks += c;
        });
        res.on('end', function () {
          if (done) done(res.statusCode, chunks);
        });
      }
    );
    req.end(body);
    return event.event_id;
  }

  global.Sentry = {
    init: function (str) {
      dsn = parseDsn(str);
      return dsn;
    },
    captureMessage: function (text, done) {
      return send(
        {
          event_id: eventId(),
          timestamp: Date.now() / 1000,
          platform: 'other',
          level: 'info',
          logentry: { formatted: text },
        },
        done
      );
    },
    captureException: function (err, done) {
      var value = { type: err.name, value: err.message };
      var stacktrace = parseStack(err.stack);
      if (stacktrace) value.stacktrace = stacktrace;
      return send(
        {
          event_id: eventId(),
          timestamp: Date.now() / 1000,
          platform: 'other',
          level: 'error',
          exception: { values: [value] },
        },
        done
      );
    },
  };
})(globalThis);

if (typeof module !== 'undefined') module.exports = globalThis.Sentry;
