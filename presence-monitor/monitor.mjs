import { createClient } from '@supabase/supabase-js';
import net from 'node:net';

const configs = [
  { env: 'PRD', host: 'nomeia-ai-prd' },
  { env: 'HML', host: 'nomeia-ai-hml' },
];
const zabbixHost = process.env.ZABBIX_SERVER || '127.0.0.1';
const zabbixPort = Number(process.env.ZABBIX_PORT || 10051);
const intervalMs = 15000;

function countUsers(state) {
  const ids = new Set();
  for (const [key, values] of Object.entries(state || {})) {
    if (key && key !== 'viewer') ids.add(key);
    if (Array.isArray(values)) {
      for (const presence of values) {
        if (presence && typeof presence.user_id === 'string' && presence.user_id !== 'viewer') {
          ids.add(presence.user_id);
        }
      }
    }
  }
  return ids.size;
}

function sendValue(host, key, value) {
  const body = Buffer.from(JSON.stringify({
    request: 'sender data',
    data: [{ host, key, value: String(value), clock: Math.floor(Date.now() / 1000) }],
  }));
  const header = Buffer.alloc(13);
  header.write('ZBXD\x01', 0, 'binary');
  header.writeBigUInt64LE(BigInt(body.length), 5);
  const frame = Buffer.concat([header, body]);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: zabbixHost, port: zabbixPort });
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    socket.setTimeout(5000, () => finish(new Error('Zabbix sender timeout')));
    socket.once('connect', () => socket.write(frame));
    socket.on('data', (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (response.length < 13) return;
      const size = Number(response.readBigUInt64LE(5));
      if (response.length < 13 + size) return;
      try {
        finish(null, JSON.parse(response.subarray(13, 13 + size).toString('utf8')));
      } catch (error) {
        finish(error);
      }
    });
    socket.once('error', (error) => finish(error));
  }).then((result) => {
    if (result.response !== 'success' || !String(result.info || '').includes('processed: 1;')) {
      throw new Error(result.info || result.response || 'Zabbix rejected metric');
    }
  });
}

for (const config of configs) {
  const url = process.env[config.env + '_SUPABASE_URL'];
  const key = process.env[config.env + '_SUPABASE_KEY'];
  if (!url || !key) {
    console.error(config.env + ': missing Supabase configuration');
    continue;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let channel;
  let connected = false;
  let lastCount = 0;
  let sending = false;

  const publish = async () => {
    if (sending || !connected || !channel) return;
    sending = true;
    try {
      lastCount = countUsers(channel.presenceState());
      await sendValue(config.host, 'nomeia.presence.connection_status', 1);
      await sendValue(config.host, 'nomeia.presence.online_users', lastCount);
      console.log(config.env + ': metric sent');
    } catch (error) {
      console.error(config.env + ': metric delivery failed: ' + error.message);
    } finally {
      sending = false;
    }
  };

  channel = client.channel('online_users', {
    config: { presence: { key: 'zabbix-monitor-' + config.env.toLowerCase() } },
  });
  channel
    .on('presence', { event: 'sync' }, () => void publish())
    .on('presence', { event: 'join' }, () => void publish())
    .on('presence', { event: 'leave' }, () => void publish())
    .subscribe((status, error) => {
      connected = status === 'SUBSCRIBED';
      console.log(config.env + ': realtime ' + status + (error ? ' detail=' + (error.message || String(error)) : ''));
      void sendValue(config.host, 'nomeia.presence.connection_status', connected ? 1 : 0)
        .catch((error) => console.error(config.env + ': status delivery failed: ' + error.message));
      if (connected) void publish();
    });

  setInterval(() => {
    if (connected) void publish();
  }, intervalMs);
}

console.log('Presence collectors started');
