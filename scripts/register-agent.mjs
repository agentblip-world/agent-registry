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
  const parts = items.map(encodeString);
  return Buffer.concat([len, ...parts]);
}

function encodeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value), 0);
  return buf;
}

async function main() {
  const keypairData = JSON.parse(readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log('Wallet:', wallet.publicKey.toBase58());

  const connection = new Connection(RPC, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  const [agentProfilePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  console.log('Agent PDA:', agentProfilePDA.toBase58());

  // Check if already registered
  const info = await connection.getAccountInfo(agentProfilePDA);
  if (info) {
    console.log('Agent already registered! Account size:', info.data.length);
    return;
  }

  const name = 'TradeBot Alpha';
  const capabilities = ['trading', 'defi', 'analytics'];
  const pricingLamports = 100_000_000; // 0.1 SOL
  const metadataUri = 'https://agent-book.ai';

  const data = Buffer.concat([
    ixDiscriminator('register_agent'),
    encodeString(name),
    encodeStringVec(capabilities),
    encodeU64(pricingLamports),
    encodeString(metadataUri),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: agentProfilePDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(wallet);

  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log('Tx:', sig);
  await connection.confirmTransaction(sig, 'confirmed');
  console.log('Agent registered successfully!');
}

main().catch(console.error);
