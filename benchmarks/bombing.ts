#! /usr/bin/env node

import { TcpClient } from '../node/tcpClient.js';

const client = new TcpClient();

client.connect({
  url: new URL('mqtt://localhost:1884'),
})

const payload = Buffer.from('payload');

let sent = 0
const interval = 5000

client.onConnected = () => {
  const loop = () => {
    sent++;
    client.publish({ topic: 'test', payload }).then(loop);
  };
  queueMicrotask(loop);
};

function count() {
	console.log('sent/s', (sent / interval) * 1000)
	sent = 0
}

setInterval(count, interval)

client.onError = (err) => {
  console.log('client error', err);
};
