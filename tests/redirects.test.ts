import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { safeFetch } from '../lib/safe-fetch';

test('redirect destinations re-enter the private-address guard before another socket opens', async context => {
  let calls = 0;
  context.mock.method(https, 'request', (_url: unknown, _options: unknown, callback: (response: IncomingMessage) => void) => {
    calls++;
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: (error: Error) => void };
    req.write = () => {};
    req.destroy = error => { req.emit('error', error); };
    req.end = () => { queueMicrotask(() => {
      const response = new PassThrough() as unknown as IncomingMessage;
      response.statusCode = 302; response.headers = { location: 'http://169.254.169.254/latest/meta-data' };
      callback(response);
    }); };
    return req;
  });
  await assert.rejects(() => safeFetch('https://8.8.8.8/'), /Private|reserved|link-local/);
  assert.equal(calls, 1);
});
test('response size limits apply while reading the body', async context => {
  context.mock.method(https, 'request', (_url: unknown, _options: unknown, callback: (response: IncomingMessage) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: (error: Error) => void };
    req.write = () => {}; req.destroy = error => { req.emit('error', error); };
    req.end = () => { queueMicrotask(() => {
      const response = new PassThrough() as unknown as IncomingMessage;
      response.statusCode = 200; response.headers = { 'content-type': 'text/html' };
      callback(response); response.emit('data', Buffer.from('This body exceeds the limit.'));
    }); };
    return req;
  });
  await assert.rejects(() => safeFetch('https://8.8.8.8/', { maxBytes: 10 }), /size limit/);
});
