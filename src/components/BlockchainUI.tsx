import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FileText, 
  Brain, 
  Link, 
  Search, 
  Database,
  Shield,
  Zap,
  BookOpen,
  Hash,
  Wallet
} from 'lucide-react';

interface Document {
  id: string;
  title: string;
  keywords: string[];
  difficulty: string;
  hash: string;
  uploader: string;
  summary: string;
}

export const BlockchainUI = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [documents] = useState<Document[]>([
    {
      id: '1',
      title: 'Quantum Computing in Cryptography',
      keywords: ['quantum', 'cryptography', 'security'],
      difficulty: 'Advanced',
      hash: '0x7d2a...f8e9',
      uploader: '0x1234...5678',
      summary: 'Comprehensive analysis of quantum computing applications in modern cryptographic systems.'
    },
    {
      id: '2',
      title: 'Machine Learning Fundamentals',
      keywords: ['ML', 'neural networks', 'algorithms'],
      difficulty: 'Intermediate',
      hash: '0x9b3c...a1d2',
      uploader: '0x9876...5432',
      summary: 'Introduction to core concepts and practical applications of machine learning.'
    }
  ]);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadProgress(0);
    
    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <div className="min-h-screen bg-background neural-network">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center blockchain-glow">
                <BookOpen className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">BlockScribe AI</h1>
                <p className="text-sm text-muted-foreground">Decentralized Academic Intelligence</p>
              </div>
            </div>
            <Button variant="outline" className="blockchain-glow">
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/50 backdrop-blur-sm bg-card/80 cyber-glow">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-primary" />
                  <span>Upload Academic Document</span>
                </CardTitle>
                <CardDescription>
                  Upload your PDF and let AI extract metadata for blockchain indexing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Drag & drop your PDF here or click to browse</p>
                  <Button onClick={handleUpload} disabled={isUploading} className="gradient-primary">
                    {isUploading ? 'Processing...' : 'Select File'}
                  </Button>
                </div>
                
                {isUploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="w-full" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing with AI...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Processing Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/50 backdrop-blur-sm bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Brain className="w-5 h-5 text-primary animate-pulse-glow" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">AI Processing</p>
                      <p className="text-xl font-bold text-foreground">Active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 backdrop-blur-sm bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <Link className="w-5 h-5 text-accent animate-blockchain-spin" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Blockchain</p>
                      <p className="text-xl font-bold text-foreground">Solana</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 backdrop-blur-sm bg-card/80">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-destructive/10">
                      <Database className="w-5 h-5 text-destructive animate-float" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Storage</p>
                      <p className="text-xl font-bold text-foreground">IPFS</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Search */}
            <Card className="border-border/50 backdrop-blur-sm bg-card/80 accent-glow">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Search className="w-5 h-5 text-accent" />
                  <span>Search Documents</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Search by keywords, difficulty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-border/50"
                />
              </CardContent>
            </Card>

            {/* Network Status */}
            <Card className="border-border/50 backdrop-blur-sm bg-card/80">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <span>Network Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Connection</span>
                  <Badge variant="secondary" className="bg-accent/20 text-accent">
                    <div className="w-2 h-2 bg-accent rounded-full mr-2 animate-pulse"></div>
                    Online
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Block Height</span>
                  <span className="text-sm font-mono">234,567,890</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gas Price</span>
                  <span className="text-sm font-mono">0.000021 SOL</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Documents Grid */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center">
            <Hash className="w-6 h-6 mr-2 text-primary" />
            Indexed Documents
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {documents.map((doc) => (
              <Card key={doc.id} className="border-border/50 backdrop-blur-sm bg-card/80 hover:cyber-glow transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                      <CardDescription className="mt-2">{doc.summary}</CardDescription>
                    </div>
                    <Badge 
                      variant={doc.difficulty === 'Advanced' ? 'destructive' : 
                              doc.difficulty === 'Intermediate' ? 'default' : 'secondary'}
                    >
                      {doc.difficulty}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {doc.keywords.map((keyword) => (
                      <Badge key={keyword} variant="outline" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Hash:</span>
                      <span className="font-mono text-primary">{doc.hash}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Uploader:</span>
                      <span className="font-mono text-accent">{doc.uploader}</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Zap className="w-4 h-4 mr-2" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Link className="w-4 h-4 mr-2" />
                      Verify
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};