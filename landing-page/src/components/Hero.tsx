'use client';

import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';

export default function Hero() {
  const router = useRouter();

  const handleDownloadScript = () => {
    const link = document.createElement('a');
    link.href = '/install.sh';
    link.download = 'install.sh';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewGuide = () => {
    router.push('/guide');
  };

  return (
    <main className="text-center py-28 min-h-96" style={{ background: 'var(--primary-gradient)', color: 'white' }}>
      <h1 className="text-4xl font-bold">Filter the Noise, Focus on What Matters in Your WhatsApp Groups</h1>
      <p className="mt-4 text-lg">An open-source tool leveraging AI to intelligently filter WhatsApp group messages, saving you time and keeping you informed.</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
        <Button onClick={handleDownloadScript}>
          Download Install Script
        </Button>
        <Button variant="secondary" onClick={handleViewGuide}>
          View Guide
        </Button>
      </div>
      <div className="mt-6 text-sm opacity-90">
        <p>Or run directly: <code className="bg-black bg-opacity-20 px-2 py-1 rounded">wget https://whatsapp-ai-filter.vercel.app/install.sh -O - | bash</code></p>
      </div>
    </main>
  );
}
