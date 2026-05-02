export interface SignableWallet {
  publicKey?: { toString: () => string };
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string } | string>;
}

const encodeUtf8 = (value: string) => new TextEncoder().encode(value);

const requireWallet = (wallet: SignableWallet) => {
  if (!wallet.publicKey) {
    throw new Error('Wallet publicKey is missing');
  }

  if (!wallet.signMessage) {
    throw new Error('Wallet does not support message signing in this environment');
  }
};

const toBase64 = (data: Uint8Array) => {
  let binary = '';
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const normalizeSignedMessage = (signed: unknown): Uint8Array => {
  if (signed instanceof Uint8Array) {
    return signed;
  }

  if (signed && typeof signed === 'object') {
    const maybeSignature = (signed as { signature?: unknown }).signature;
    if (maybeSignature instanceof Uint8Array) {
      return maybeSignature;
    }
    if (Array.isArray(maybeSignature)) {
      return Uint8Array.from(maybeSignature);
    }
  }

  if (Array.isArray(signed)) {
    return Uint8Array.from(signed);
  }

  throw new Error('Wallet returned an unsupported signMessage payload');
};

export const sendMemoTransaction = async (wallet: SignableWallet, memoText: string): Promise<string> => {
  if (!wallet.publicKey) {
    throw new Error('Wallet publicKey is missing');
  }

  const web3 = window.solanaWeb3;
  if (!web3) {
    throw new Error('Solana web3 SDK is not loaded in browser');
  }

  const payer = new web3.PublicKey(wallet.publicKey.toString());
  const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const memoIx = new web3.TransactionInstruction({
    programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    keys: [],
    data: encodeUtf8(memoText),
  });

  const tx = new web3.Transaction({
    feePayer: payer,
    blockhash,
    lastValidBlockHeight,
  }).add(memoIx);

  if (wallet.signAndSendTransaction) {
    try {
      const txResult = await wallet.signAndSendTransaction(tx);
      const signature = typeof txResult === 'string' ? txResult : txResult.signature;
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      return signature;
    } catch (err) {
      if (!wallet.signTransaction) {
        throw err;
      }
    }
  }

  if (!wallet.signTransaction) {
    throw new Error('Wallet cannot send transactions in this environment');
  }

  const signedTx = await wallet.signTransaction(tx);
  if (!signedTx || typeof signedTx !== 'object' || !('serialize' in signedTx)) {
    throw new Error('Wallet returned an invalid signed transaction');
  }
  const signature = await connection.sendRawTransaction(
    (signedTx as { serialize: () => Uint8Array }).serialize(),
    { skipPreflight: false },
  );
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
};

export const sendFeeSplitTransfer = async (
  wallet: SignableWallet,
  uploaderWallet: string,
  developerWallet: string,
  uploaderLamports: number,
  developerLamports: number,
): Promise<string> => {
  requireWallet(wallet);

  const signer = wallet.publicKey!.toString();
  const payload = [
    'fee_split',
    `from=${signer}`,
    `uploader=${uploaderWallet}`,
    `developer=${developerWallet}`,
    `uploader_lamports=${uploaderLamports}`,
    `developer_lamports=${developerLamports}`,
  ].join('|');

  const signed = await wallet.signMessage!(encodeUtf8(payload));
  return toBase64(normalizeSignedMessage(signed));
};
