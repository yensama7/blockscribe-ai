const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-primary">Welcome to BlockScribe AI</h1>
        <p className="text-xl text-muted-foreground">Your AI-powered writing assistant</p>
        <div className="w-4 h-4 bg-primary rounded-full animate-pulse mx-auto"></div>
      </div>
    </div>
  );
};

export default Index;
