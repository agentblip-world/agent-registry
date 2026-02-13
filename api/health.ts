import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.status(200).json({
    status: 'ok',
    cluster: 'devnet',
    indexerReady: true,
    mockData: true,
    timestamp: Date.now(),
  });
}
