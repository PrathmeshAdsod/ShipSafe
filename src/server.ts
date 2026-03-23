import crypto from 'node:crypto';
import express, { Request } from 'express';
import { getConfig } from './config';
import { handleStatusCheckHook, handleWebhookEvent } from './orchestrator';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function timingSafeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyStatusCheckSignature(req: RawBodyRequest): boolean {
  const config = getConfig();
  const sharedSecret = config.gitlabStatusCheckSharedSecret;

  if (!sharedSecret) {
    return true;
  }

  const header = req.headers['x-gitlab-signature'];
  if (typeof header !== 'string' || !req.rawBody) {
    return false;
  }

  const actual = header.replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', sharedSecret).update(req.rawBody).digest('hex');
  return timingSafeMatch(actual, expected);
}

export function createApp() {
  const app = express();

  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buffer);
    }
  }));

  app.get('/health', (_, res) => {
    res.json({ status: 'ok', service: 'shipsafe' });
  });

  app.post('/webhook', (req, res) => {
    const config = getConfig();
    if (req.headers['x-gitlab-token'] !== config.gitlabWebhookSecret) {
      return res.status(401).send('unauthorized');
    }

    res.status(200).send('ok');
    handleWebhookEvent(req.body).catch((error) => console.error('[webhook] processing failed', error));
  });

  app.post('/status-checks/hook', (req, res) => {
    if (!verifyStatusCheckSignature(req as RawBodyRequest)) {
      return res.status(401).send('unauthorized');
    }

    res.status(200).send('ok');
    handleStatusCheckHook(req.body).catch((error) => console.error('[status-checks] processing failed', error));
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const config = getConfig();
  app.listen(config.port, () => {
    console.log(`ShipSafe listening on port ${config.port}`);
  });
}
