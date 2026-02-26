'use client';

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from 'react';
import { LuCopy, LuCheck } from 'react-icons/lu';
import { useRouter } from 'next/navigation';
import { downloadInstallScript, navigateToGuide } from '@/utils/install';

export default function Installation() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const installCommand = 'wget https://whatsapp-ai-filter.vercel.app/install.sh -O - | bash';

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  return (
    <section id="installation" className="py-16 px-8 bg-gray-50">
      <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--secondary-color)' }}>Quick Installation</h2>
      <p className="mt-4 text-center text-gray-700 max-w-2xl mx-auto">Get WhatsApp AI Filter up and running in seconds with our automated installation script.</p>

      <div className="mt-8 max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Option 1: One-Command Installation</h3>
          <p className="text-gray-600 mb-4">Run this command in your terminal:</p>
          <div className="relative">
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto pr-12">
              {installCommand}
            </div>
            <button
              onClick={handleCopyCommand}
              className="absolute top-2 right-2 h-8 w-8 p-0 flex items-center justify-center hover:bg-gray-800 rounded transition-colors duration-200"
              title={copied ? 'Copied!' : 'Copy command'}
            >
              {copied ? <LuCheck className="text-green-400 w-4 h-4" /> : <LuCopy className="text-green-400 w-4 h-4"/>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--secondary-color)' }}>Option 2: Download Script</h3>
            <p className="text-gray-600 mb-4">Download the install script and run it manually:</p>
            <Button variant="secondary" className="w-full" onClick={downloadInstallScript}>
              Download install.sh
            </Button>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--secondary-color)' }}>Option 3: Manual Setup</h3>
            <p className="text-gray-600 mb-4">Clone the repository and run setup manually:</p>
            <Button variant="secondary" className="w-full" onClick={() => navigateToGuide(router)}>
              View Setup Guide
            </Button>
          </Card>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-600">Requirements: Git, Node.js, and npm installed on your system</p>
      </div>
    </section>
  );
}
