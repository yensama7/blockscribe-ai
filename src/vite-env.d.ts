/// <reference types="vite/client" />

interface Window {
  solanaWeb3?: {
    PublicKey: new (value: string) => { toString: () => string };
    Connection: new (endpoint: string, commitment?: string) => {
      getLatestBlockhash: (commitment?: string) => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
      confirmTransaction: (
        strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
        commitment?: string,
      ) => Promise<unknown>;
      sendRawTransaction: (rawTx: Uint8Array, options?: { skipPreflight?: boolean }) => Promise<string>;
    };
    TransactionInstruction: new (args: {
      programId: { toString: () => string };
      keys: unknown[];
      data: Uint8Array;
    }) => unknown;
    Transaction: new (args: {
      feePayer: { toString: () => string };
      blockhash: string;
      lastValidBlockHeight: number;
    }) => { add: (ix: unknown) => unknown };
    clusterApiUrl: (cluster: 'devnet' | 'testnet' | 'mainnet-beta') => string;
  };
}
