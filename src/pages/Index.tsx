import { BlockchainUI } from '@/components/BlockchainUI';
import { TestComponent } from '@/components/TestComponent';

const Index = () => {
  // Temporarily use test component to debug
  return <TestComponent />;
  
  // Original component with error handling
  try {
    return <BlockchainUI />;
  } catch (error) {
    console.error('Error rendering BlockchainUI:', error);
    return (
      <div className="p-4">
        <h1>Error loading component</h1>
        <p>Check console for details</p>
      </div>
    );
  }
};

export default Index;
