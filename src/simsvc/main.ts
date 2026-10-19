import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { advance, BadSave, inspect, verify, type ShippedFish } from './handlers';

/**
 * 模擬小服務：給 Spring Boot 在內部呼叫（不要對外開放）。
 * SIM_PORT 預設 8091；SIM_TOKEN 有設定時，每個請求都要帶 X-Sim-Token。
 */
const PORT = Number(process.env.SIM_PORT ?? 8091);
const HOST = process.env.SIM_HOST ?? '127.0.0.1';
const TOKEN = process.env.SIM_TOKEN ?? '';
/**
 * Spring Boot 一份存檔上限 4 MB（max-save-bytes），verify 一次帶兩份，所以這裡要大於兩倍；
 * 太小的話正常存檔也會被 413 擋下，變成存不了檔（#74）。
 */
const MAX_BODY = 10 * 1024 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function authorized(req: IncomingMessage): boolean {
  if (!TOKEN) return true;
  const got = Buffer.from(String(req.headers['x-sim-token'] ?? ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, '資料太大');
    chunks.push(chunk as Buffer);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object') return body;
  } catch {
    // 下面統一回 400
  }
  throw new HttpError(400, '不是 JSON');
}

function num(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `缺少 ${key}`);
  return v;
}

/** 已經出貨的魚（市場用的魚資料，沒帶就是空的）。 */
function shippedList(v: unknown): ShippedFish[] {
  return Array.isArray(v) ? v.filter((x): x is ShippedFish => !!x && typeof x === 'object' && typeof (x as ShippedFish).id === 'number') : [];
}

const routes: Record<string, (body: Record<string, unknown>) => unknown> = {
  '/advance': (b) => advance(b.save, num(b, 'now')),
  '/verify': (b) => ({ problems: verify(b.previous, b.next, num(b, 'elapsedMs'), shippedList(b.shipped)) }),
  '/inspect': (b) => inspect(b.save, num(b, 'fishId')),
};

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (!authorized(req)) throw new HttpError(401, '沒有權限');
    const route = req.method === 'POST' && req.url ? routes[req.url] : undefined;
    if (!route) throw new HttpError(404, '沒有這個功能');
    send(res, 200, route(await readJson(req)));
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { message: e.message });
    else if (e instanceof BadSave) send(res, 422, { message: e.message });
    else {
      console.error(e);
      send(res, 500, { message: '模擬出錯了' });
    }
  }
});

server.listen(PORT, HOST, () => console.log(`cycle sim service on http://${HOST}:${PORT}`));
