import { createClient } from '@clickhouse/client';

const client = createClient({
  url: 'http://localhost:8123',
  username: 'dev',
  password: 'dev',
  database: 'logs_db',
});

const result = await client.query({
  query: 'SELECT 1',
  format: 'JSONEachRow',
});

console.log('ClickHouse bağlı:', await result.json());
