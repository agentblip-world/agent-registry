import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";

export function taskRoutes(connection: Connection): Router {
  const router = Router();

  // GET /api/tasks/:escrowPubkey - Get task escrow details
  router.get("/:escrowPubkey", async (req: Request, res: Response) => {
    try {
      const pubkey = new PublicKey(req.params.escrowPubkey);
      const accountInfo = await connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        return res.status(404).json({ error: "Task escrow not found" });
      }

      const data = accountInfo.data;
      let offset = 8; // skip discriminator

      const client = new PublicKey(
        data.subarray(offset, offset + 32)
      ).toBase58();
      offset += 32;

      const agent = new PublicKey(
        data.subarray(offset, offset + 32)
      ).toBase58();
      offset += 32;

      const amount = Number(data.readBigUInt64LE(offset));
      offset += 8;

      const statusByte = data.readUInt8(offset);
      offset += 1;
      const statusMap: Record<number, string> = {
        0: "funded",
        1: "in_progress",
        2: "completed",
        3: "disputed",
      };
      const status = statusMap[statusByte] || "unknown";

      const taskIdLen = data.readUInt32LE(offset);
      offset += 4;
      const taskId = data.subarray(offset, offset + taskIdLen).toString("utf8");
      offset += taskIdLen;

      const createdAt = Number(data.readBigInt64LE(offset));

      res.json({
        publicKey: req.params.escrowPubkey,
        client,
        agent,
        amountLamports: amount,
        amountSol: amount / 1e9,
        status,
        taskId,
        createdAt: new Date(createdAt * 1000).toISOString(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
