import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/services/api';
import { useWallet } from '@/context/WalletContext';
import { useToast } from '@/hooks/use-toast';

export default function MyAccount() {
  const { walletAddress, walletConnected } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAuthorWallet, setSelectedAuthorWallet] = useState('');
  const [chatDraft, setChatDraft] = useState('');

  const { data: myUploads = [], isLoading: myUploadsLoading } = useQuery({
    queryKey: ['library-metadata-by-wallet', walletAddress],
    queryFn: () => api.getMetadataByWallet(walletAddress),
    enabled: Boolean(walletAddress),
  });

  const { data: library = [] } = useQuery({
    queryKey: ['library-metadata'],
    queryFn: api.getAllMetadata,
  });

  const availableAuthors = useMemo(() => {
    const authors = new Set(
      library
        .map((book) => book.uploader_wallet || '')
        .filter((wallet) => wallet && wallet !== walletAddress),
    );
    return [...authors];
  }, [library, walletAddress]);

  const selectedAuthor = selectedAuthorWallet || availableAuthors[0] || '';

  const { data: chatMessages = [], isLoading: chatLoading } = useQuery({
    queryKey: ['author-chat', selectedAuthor, walletAddress],
    queryFn: () => api.getChatMessages(selectedAuthor, walletAddress),
    enabled: Boolean(selectedAuthor && walletAddress),
    refetchInterval: 5000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAuthor || !walletAddress || !chatDraft.trim()) {
        throw new Error('Select author and enter a message');
      }
      return api.postChatMessage(selectedAuthor, walletAddress, walletAddress, chatDraft.trim());
    },
    onSuccess: () => {
      setChatDraft('');
      queryClient.invalidateQueries({ queryKey: ['author-chat'] });
    },
    onError: (error) => {
      toast({
        title: 'Message failed',
        description: error instanceof Error ? error.message : 'Could not send message.',
        variant: 'destructive',
      });
    },
  });

  if (!walletConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Account</CardTitle>
          <CardDescription>Link your wallet to see your memos and chat with authors.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Wallet Memos</CardTitle>
          <CardDescription>Memo records published by your connected wallet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {myUploadsLoading && <p className="text-sm text-muted-foreground">Loading your memos...</p>}
          {!myUploadsLoading && myUploads.length === 0 && (
            <p className="text-sm text-muted-foreground">No uploads found for this wallet yet.</p>
          )}
          {myUploads.slice(0, 10).map((record) => (
            <div key={record.id} className="rounded border border-border/40 px-3 py-2">
              <p className="font-medium">{record.title}</p>
              <p className="text-xs break-all text-muted-foreground">
                memo tx: {record.solana_signature || 'pending'} • created: {record.created_at || 'unknown'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Author Chat (48h)</CardTitle>
          <CardDescription>Messages auto-expire after 48 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Author wallet address"
            value={selectedAuthor}
            onChange={(event) => setSelectedAuthorWallet(event.target.value.trim())}
          />
          {availableAuthors.length > 0 && (
            <p className="text-xs text-muted-foreground break-all">Suggested authors: {availableAuthors.slice(0, 3).join(' • ')}</p>
          )}

          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-border/40 p-3">
            {chatLoading && <p className="text-sm text-muted-foreground">Loading chat...</p>}
            {!chatLoading && chatMessages.length === 0 && (
              <p className="text-sm text-muted-foreground">No messages yet for this conversation.</p>
            )}
            {chatMessages.map((message) => (
              <div key={message.id} className="rounded bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground break-all">
                  {message.sender_wallet === walletAddress ? 'You' : 'Author'} • {message.created_at}
                </p>
                <p className="text-sm">{message.message}</p>
              </div>
            ))}
          </div>

          <Textarea
            placeholder="Share notes or thoughts for the author..."
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
          />
          <Button onClick={() => sendMessageMutation.mutate()} disabled={sendMessageMutation.isPending || !selectedAuthor}>
            {sendMessageMutation.isPending ? 'Sending...' : 'Send message'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
