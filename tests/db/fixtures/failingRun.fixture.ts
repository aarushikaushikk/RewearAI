import { afterAll, beforeAll, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { startMongoTestServer, type MongoTestServer } from '../../helpers/mongoTestServer';

// Run only by mongoTestServerFailure.test.ts, in a separate Vitest process.
let server: MongoTestServer;

beforeAll(async () => {
  const uriBeforeStart = process.env.MONGODB_URI;
  server = await startMongoTestServer();
  writeFileSync(
    process.env.FIXTURE_OUTPUT!,
    JSON.stringify({ port: server.port, dbPath: server.dbPath, uriBeforeStart }),
  );
});

afterAll(async () => {
  await server?.stop();
});

it('ends the run while the server is up', () => {
  if (process.env.FIXTURE_MODE === 'crash') {
    process.kill(process.pid, 'SIGKILL');
  }
  throw new Error('expected fixture failure');
});
