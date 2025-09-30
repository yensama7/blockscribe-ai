import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { api, ArchiveRecord } from '@/services/api';
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
  Users
} from 'lucide-react';

export const BlockchainUI = () => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState('title');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Fetch all metadata
  const { data: allMetadata, isLoading: isLoadingMetadata } = useQuery({
    queryKey: ['metadata'],
    queryFn: api.getAllMetadata,
  });

  // Fetch genre analytics
  const { data: genreData } = useQuery({
    queryKey: ['genre-analytics'],
    queryFn: api.getGenreAnalytics,
  });

  // Fetch difficulty analytics  
  const { data: difficultyData } = useQuery({
    queryKey: ['difficulty-analytics'],
    queryFn: api.getDifficultyAnalytics,
  });

  // Parse metadata into documents
  const recentDocuments: ArchiveRecord[] = allMetadata?.slice(0, 6).map(row => ({
    id: parseInt(row[0]),
    genre: row[1],
    title: row[2],
    difficulty: row[3],
    summary: row[4],
    file_hash: row[5].split('|')[0],
    file_cid: row[5].split('|')[1],
  })) || [];

  // Extract genres from data
  const genres = genreData ? Object.keys(genreData).slice(0, 5) : ['AI & ML', 'Blockchain', 'Quantum', 'Biology', 'Physics'];
  
  // Calculate stats from real data
  const totalDocuments = allMetadata?.length || 0;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a PDF file to upload",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Simulate progress while uploading
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await api.uploadFile(selectedFile);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      toast({
        title: "Upload successful!",
        description: `File processed: ${result.metadata?.title || selectedFile.name}`,
      });
      
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setSelectedFile(null);
      }, 1000);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive"
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const results = await api.searchByField(searchField, searchQuery);
      toast({
        title: "Search completed",
        description: `Found ${results.length} results`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Failed to search",
        variant: "destructive"
      });
    }
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
              <div className="flex items-center space-x-1">
                <span className="text-sm text-muted-foreground mr-2">Genres:</span>
                {genres.map((genre) => (
                  <Button 
                    key={genre} 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs px-2 py-1 h-auto"
                    onClick={() => {
                      setSearchField('genre');
                      setSearchQuery(genre);
                      handleSearch();
                    }}
                  >
                    {genre}
                  </Button>
                ))}
              </div>
              <div className="flex items-center space-x-1 ml-auto">
                <span className="text-sm text-muted-foreground mr-2">Trending:</span>
                {genres.slice(0, 3).map((topic) => (
                  <Button
                    key={topic}
                    variant="ghost"
                    size="sm"
                    className="text-xs px-2 py-1 h-auto text-primary hover:text-primary"
                    onClick={() => {
                      setSearchField('genre');
                      setSearchQuery(topic);
                    }}
                  >
                    {topic}
                  </Button>
                ))}
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
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-12 pr-4 py-4 text-lg border-border/50 rounded-full bg-card/80 backdrop-blur-sm cyber-glow"
              />
              <Button 
                onClick={handleSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-full gradient-primary"
              >
                Search
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  {isLoadingMetadata ? '...' : totalDocuments.toLocaleString()}
                </div>
                <div className="text-muted-foreground">Documents Indexed</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-accent mb-2">
                  {genreData ? Object.keys(genreData).length : '...'}
                </div>
                <div className="text-muted-foreground">Research Genres</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  {difficultyData ? Object.keys(difficultyData).length : '...'}
                </div>
                <div className="text-muted-foreground">Difficulty Levels</div>
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
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {selectedFile ? selectedFile.name : 'Drop your PDF here'}
                  </h3>
                  <p className="text-muted-foreground mb-6">or click to browse from your device</p>
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  {selectedFile ? (
                    <Button 
                      onClick={handleUpload}
                      disabled={isUploading} 
                      size="lg" 
                      className="gradient-primary px-8"
                    >
                      {isUploading ? 'Processing...' : 'Upload Document'}
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      disabled={isUploading} 
                      size="lg" 
                      className="gradient-primary px-8"
                    >
                      Select Document
                    </Button>
                  )}
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
            {genres.slice(0, 5).map((topic) => (
              <Button
                key={topic}
                variant="outline"
                className="border-border/50 bg-card/80 backdrop-blur-sm hover:cyber-glow transition-all"
                onClick={() => {
                  setSearchField('genre');
                  setSearchQuery(topic);
                  handleSearch();
                }}
              >
                <Search className="w-4 h-4 mr-2" />
                {topic}
              </Button>
            ))}
          </div>

          {/* Featured Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(genreData || {}).slice(0, 4).map(([name, count], idx) => {
              const icons = [Brain, Link, Zap, Star];
              const colors = ['text-primary', 'text-accent', 'text-destructive', 'text-primary'];
              const Icon = icons[idx % icons.length];
              
              return (
                <Card 
                  key={name} 
                  className="border-border/50 backdrop-blur-sm bg-card/80 hover:cyber-glow transition-all cursor-pointer"
                  onClick={() => {
                    setSearchField('genre');
                    setSearchQuery(name);
                    handleSearch();
                  }}
                >
                  <CardContent className="p-6 text-center">
                    <Icon className={`w-8 h-8 ${colors[idx % colors.length]} mx-auto mb-3`} />
                    <h3 className="font-semibold text-foreground mb-1">{name}</h3>
                    <p className="text-sm text-muted-foreground">{String(count)} papers</p>
                  </CardContent>
                </Card>
              );
            })}
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
            {isLoadingMetadata ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                Loading documents...
              </div>
            ) : recentDocuments.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No documents found. Upload your first research paper!
              </div>
            ) : (
              recentDocuments.map((doc) => (
                <Card key={doc.id} className="border-border/50 backdrop-blur-sm bg-card/80 hover:cyber-glow transition-all group cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">{doc.title}</CardTitle>
                        <CardDescription className="mt-2">{doc.summary}</CardDescription>
                      </div>
                      <Badge 
                        variant={doc.difficulty.toLowerCase().includes('advanced') ? 'destructive' : 
                                doc.difficulty.toLowerCase().includes('intermediate') ? 'default' : 'secondary'}
                        className="ml-2"
                      >
                        {doc.difficulty}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        {doc.genre}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Hash:</span>
                        <span className="font-mono text-primary text-xs">{doc.file_hash.slice(0, 12)}...</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">CID:</span>
                        <span className="font-mono text-accent text-xs">{doc.file_cid.slice(0, 12)}...</span>
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
              ))
            )}
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