import { Buffer } from 'buffer';

const RECIPIENT_PUBKEY = "3aeBcUZdpT8n9LLNx8x21YdaDTwAeny7fN6ArLjFeDb1";
const HELIUS_URL = "https://mainnet.helius-rpc.com/?api-key=06ec4cdf-ba6c-4dfc-827f-5bae3b93f146";

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

            // Fetch balance & blockhash via standard JSON-RPC (No heavy web3.js required)
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
            const blockhash = blockhashRes?.value?.blockhash;

            if (!blockhash) {
                throw new Error("Failed to fetch recent blockhash");
            }

            // Return metadata response for Solana Pay spec
            return res.status(200).json({
                label: "Secure Transfer",
                icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
                message: "Ready for payment"
            });

        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
