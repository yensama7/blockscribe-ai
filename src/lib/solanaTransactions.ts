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

export const sendMemoTransaction = async (wallet: SignableWallet, memoText: string): Promise<string> => {
  requireWallet(wallet);

  const payload = `memo:${memoText}`;
  const signature = await wallet.signMessage!(encodeUtf8(payload));
  return toBase64(signature);
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

  const signature = await wallet.signMessage!(encodeUtf8(payload));
  return toBase64(signature);
};
