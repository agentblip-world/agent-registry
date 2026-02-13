import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const PROGRAM_ID = new PublicKey('4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY');
const RPC = 'https://api.devnet.solana.com';

function ixDiscriminator(name) {
  const hash = createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}
function encodeString(s) {
  const bytes = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}
function encodeStringVec(items) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(items.length, 0);
  return Buffer.concat([len, ...items.map(encodeString)]);
}
function encodeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value), 0);
  return buf;
}

async function main() {
  const keypairData = JSON.parse(readFileSync('/tmp/agent2.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log('Wallet:', wallet.publicKey.toBase58());

  const connection = new Connection(RPC, 'confirmed');

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), wallet.publicKey.toBuffer()], PROGRAM_ID
  );
  console.log('PDA:', pda.toBase58());

  const info = await connection.getAccountInfo(pda);
  if (info) { console.log('Already registered'); return; }

  const data = Buffer.concat([
    ixDiscriminator('register_agent'),
    encodeString('CodeAgent Pro'),
    encodeStringVec(['coding', 'debugging', 'review']),
    encodeU64(50_000_000),
    encodeString('https://agent-book.ai'),
  ]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID, data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(wallet);
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log('Tx:', sig);
  await connection.confirmTransaction(sig, 'confirmed');
  console.log('Registered!');
}
main().catch(console.error);
