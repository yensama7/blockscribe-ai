export interface SignableWallet {
  publicKey?: { toString: () => string };
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
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
  requireWallet(wallet);

  const payload = `memo:${memoText}`;
  const signed = await wallet.signMessage!(encodeUtf8(payload));
  return toBase64(normalizeSignedMessage(signed));
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
