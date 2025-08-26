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
  Wallet,
  Star,
  TrendingUp,
  Users,
  ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  
  const [frequentlySearched] = useState([
    'Machine Learning', 'Blockchain', 'Quantum Computing', 'AI Ethics', 'Cryptography', 'Neural Networks'
  ]);
  
  const [genres] = useState([
    'AI & Machine Learning', 'Blockchain & Crypto', 'Quantum Computing', 'Biology & Medicine', 'Physics', 'Computer Science'
  ]);
  
  const [recentDocuments] = useState<Document[]>([
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
    },
    {
      id: '3',
      title: 'Blockchain Consensus Mechanisms',
      keywords: ['blockchain', 'consensus', 'proof-of-stake'],
      difficulty: 'Advanced',
      hash: '0x4e1f...c7b8',
      uploader: '0x2468...1357',
      summary: 'Deep dive into various blockchain consensus algorithms and their trade-offs.'
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
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
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
        
        {/* Navigation Bar */}
        <div className="border-t border-border/30">
          <div className="container mx-auto px-6">
            <nav className="flex items-center space-x-8 py-3 overflow-x-auto">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2 whitespace-nowrap">
                <Upload className="w-4 h-4" />
                <span>Upload</span>
              </Button>
              <Button variant="ghost" size="sm" className="flex items-center space-x-2 whitespace-nowrap">
                <Shield className="w-4 h-4" />
                <span>Verify</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center space-x-2 whitespace-nowrap">
                    <span>Genres</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {genres.map((genre) => (
                    <DropdownMenuItem key={genre}>
                      {genre}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="flex items-center space-x-2 whitespace-nowrap">
                      <TrendingUp className="w-4 h-4" />
                      <span>Trending</span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {frequentlySearched.map((topic) => (
                      <DropdownMenuItem 
                        key={topic}
                        onClick={() => setSearchQuery(topic)}
                      >
                        {topic}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-6xl font-bold text-foreground mb-6 leading-tight">
              Revolutionize Academic
              <span className="block gradient-text">Research Discovery</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload, index, and discover academic documents with AI-powered metadata extraction 
              and blockchain verification. Join the decentralized knowledge network.
            </p>
            
            {/* Main Search Bar */}
            <div className="relative max-w-2xl mx-auto mb-12">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search academic papers, research topics, authors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-4 text-lg border-border/50 rounded-full bg-card/80 backdrop-blur-sm cyber-glow"
              />
              <Button className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-full gradient-primary">
                Search
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">12,847</div>
                <div className="text-muted-foreground">Documents Indexed</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-accent mb-2">5,429</div>
                <div className="text-muted-foreground">Active Researchers</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">98.7%</div>
                <div className="text-muted-foreground">Verification Rate</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section className="py-16 px-6">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <Card className="border-border/50 backdrop-blur-sm bg-card/80 cyber-glow">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-3xl flex items-center justify-center space-x-3">
                  <Upload className="w-8 h-8 text-primary" />
                  <span>Upload Your Research</span>
                </CardTitle>
                <CardDescription className="text-lg mt-2">
                  AI will extract metadata and create a blockchain-verified index for your academic document
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-all hover:bg-primary/5">
                  <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">Drop your PDF here</h3>
                  <p className="text-muted-foreground mb-6">or click to browse from your device</p>
                  <Button onClick={handleUpload} disabled={isUploading} size="lg" className="gradient-primary px-8">
                    {isUploading ? 'Processing...' : 'Select Document'}
                  </Button>
                </div>
                
                {isUploading && (
                  <div className="space-y-4">
                    <Progress value={uploadProgress} className="w-full h-3" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>AI is extracting metadata and generating hash...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                  </div>
                )}

                {/* Process Steps */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                  <div className="flex items-center space-x-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <Brain className="w-6 h-6 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">AI Analysis</div>
                      <div className="text-sm text-muted-foreground">Extract keywords & metadata</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
                    <Hash className="w-6 h-6 text-accent" />
                    <div>
                      <div className="font-medium text-foreground">Blockchain Index</div>
                      <div className="text-sm text-muted-foreground">Create immutable record</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                    <Database className="w-6 h-6 text-destructive" />
                    <div>
                      <div className="font-medium text-foreground">IPFS Storage</div>
                      <div className="text-sm text-muted-foreground">Decentralized hosting</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Frequently Searched */}
      <section className="py-16 px-6 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 mr-3 text-primary" />
              Trending Research Topics
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Discover what the academic community is researching most actively
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {frequentlySearched.map((topic) => (
              <Button
                key={topic}
                variant="outline"
                className="border-border/50 bg-card/80 backdrop-blur-sm hover:cyber-glow transition-all"
                onClick={() => setSearchQuery(topic)}
              >
                <Search className="w-4 h-4 mr-2" />
                {topic}
              </Button>
            ))}
          </div>

          {/* Featured Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Artificial Intelligence', count: '2,847', icon: Brain, color: 'text-primary' },
              { name: 'Blockchain & Crypto', count: '1,923', icon: Link, color: 'text-accent' },
              { name: 'Quantum Computing', count: '987', icon: Zap, color: 'text-destructive' },
              { name: 'Biotechnology', count: '1,456', icon: Star, color: 'text-primary' }
            ].map((category) => (
              <Card key={category.name} className="border-border/50 backdrop-blur-sm bg-card/80 hover:cyber-glow transition-all cursor-pointer">
                <CardContent className="p-6 text-center">
                  <category.icon className={`w-8 h-8 ${category.color} mx-auto mb-3`} />
                  <h3 className="font-semibold text-foreground mb-1">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">{category.count} papers</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Documents */}
      <section className="py-16 px-6">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4 flex items-center justify-center">
              <Hash className="w-8 h-8 mr-3 text-primary" />
              Recently Indexed Papers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Latest research papers verified and indexed on the blockchain
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentDocuments.map((doc) => (
              <Card key={doc.id} className="border-border/50 backdrop-blur-sm bg-card/80 hover:cyber-glow transition-all group cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">{doc.title}</CardTitle>
                      <CardDescription className="mt-2">{doc.summary}</CardDescription>
                    </div>
                    <Badge 
                      variant={doc.difficulty === 'Advanced' ? 'destructive' : 
                              doc.difficulty === 'Intermediate' ? 'default' : 'secondary'}
                      className="ml-2"
                    >
                      {doc.difficulty}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {doc.keywords.slice(0, 3).map((keyword) => (
                      <Badge key={keyword} variant="outline" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                    {doc.keywords.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{doc.keywords.length - 3} more
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Hash:</span>
                      <span className="font-mono text-primary">{doc.hash}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Author:</span>
                      <span className="font-mono text-accent">{doc.uploader}</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Zap className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Shield className="w-4 h-4 mr-1" />
                      Verify
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button variant="outline" size="lg" className="px-8">
              <Users className="w-5 h-5 mr-2" />
              Explore All Papers
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};