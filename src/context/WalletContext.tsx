import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type WalletProviderName = 'Phantom' | 'Backpack' | 'Solflare' | 'Glow' | 'Exodus' | 'Wallet';

export interface SolanaProvider {
  publicKey?: { toString: () => string };
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  isGlow?: boolean;
  isExodus?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signTransaction?: (tx: unknown) => Promise<unknown>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string } | string>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  disconnect?: () => Promise<void>;
}

declare global {
  interface Window {
    solana?: SolanaProvider & { providers?: SolanaProvider[] };
  }
}

const getProviderName = (provider: SolanaProvider): WalletProviderName => {
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBackpack) return 'Backpack';
  if (provider.isSolflare) return 'Solflare';
  if (provider.isGlow) return 'Glow';
  if (provider.isExodus) return 'Exodus';
  return 'Wallet';
};

interface WalletContextType {
  walletAddress: string;
  walletName: WalletProviderName | null;
  walletConnected: boolean;
  walletPill: string;
  availableWallets: { name: WalletProviderName; provider: SolanaProvider }[];
  connectWallet: (provider: SolanaProvider, name: WalletProviderName) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  requireWallet: () => boolean;
  connectedProvider: SolanaProvider | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletName, setWalletName] = useState<WalletProviderName | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<SolanaProvider | null>(null);

  const availableWallets = useMemo(() => {
    if (!window.solana) return [];
    const providers = window.solana.providers?.length ? window.solana.providers : [window.solana];
    const unique = new Map<string, SolanaProvider>();
    providers.forEach((provider) => unique.set(getProviderName(provider), provider));
    return [...unique.entries()].map(([name, provider]) => ({ name: name as WalletProviderName, provider }));
  }, []);

  const walletConnected = Boolean(walletAddress);
  const walletPill = walletConnected
    ? `${walletName || 'Wallet'} • ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : 'Wallet not connected';

  const connectWallet = async (provider: SolanaProvider, name: WalletProviderName) => {
    const wallet = await provider.connect();
    const address = wallet.publicKey.toString();
    setWalletAddress(address);
    setWalletName(name);
    setConnectedProvider(provider);
  };

  const disconnectWallet = async () => {
    try {
      await connectedProvider?.disconnect?.();
    } finally {
      setWalletAddress('');
      setWalletName(null);
      setConnectedProvider(null);
    }
  };

  const requireWallet = () => walletConnected;

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        walletName,
        walletConnected,
        walletPill,
        availableWallets,
        connectWallet,
        disconnectWallet,
        requireWallet,
        connectedProvider,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
};
