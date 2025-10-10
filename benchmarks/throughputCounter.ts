#! /usr/bin/env node

import { TcpClient } from '../node/tcpClient.js';

const client = new TcpClient();

client.connect({
  url: new URL('mqtt://localhost:1884'),
});

client.onConnected = async () => {

  let counter = 0;

  const interval = 5000;

  function count() {
    console.log('received/s', (counter / interval) * 1000);
    counter = 0;
  }

  setInterval(count, interval);

  client.subscribe({ subscriptions: [{ topicFilter: 'test', qos: 0 }] });

  for await (const message of client.messages()) {
    // await new Promise<void>(resolve => queueMicrotask(resolve));
    counter++;
  }
};
