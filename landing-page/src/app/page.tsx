import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Logo Header */}
      <div className="flex items-center justify-between py-4 px-6 bg-white shadow-md">
        <div className="flex items-center">
          <Image src="/whatsapp-ai-filter-logo-nobg.png" alt="WhatsApp AI Filter Logo" width={50} height={50} />
          <span className="ml-3 text-xl font-semibold text-gray-800">WhatsApp AI Filter</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="https://github.com/avikalpg/whatsapp-ai-filter" target="_blank" rel="noopener noreferrer">
            <img src="https://img.shields.io/github/stars/avikalpg/whatsapp-ai-filter?style=social" alt="GitHub stars" className="h-6" />
          </Link>

          <Link href="#installation">
            <Button className="!font-medium !text-md !h-8 !py-0">Try Now</Button>
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <main className="text-center py-28 min-h-96" style={{ background: 'var(--primary-gradient)', color: 'white' }}>
        <h1 className="text-4xl font-bold">Filter the Noise, Focus on What Matters in Your WhatsApp Groups</h1>
        <p className="mt-4 text-lg">An open-source tool leveraging AI to intelligently filter WhatsApp group messages, saving you time and keeping you informed.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
          <Button>
            <Link href="/install.sh" download="install.sh">Download Install Script</Link>
          </Button>
          <Button>
            <Link href="/guide">View Guide</Link>
          </Button>
        </div>
        <div className="mt-6 text-sm opacity-90">
          <p>Or run directly: <code className="bg-black bg-opacity-20 px-2 py-1 rounded">wget https://whatsapp-ai-filter.vercel.app/install.sh -O - | bash</code></p>
        </div>
      </main>

      {/* Features Section */}
      <section className="py-16 px-8">
        <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--secondary-color)' }}>Features</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="p-6 text-center">
            <h3 className="text-xl font-semibold" style={{ color: 'var(--secondary-color)' }}>Intelligent Filtering</h3>
            <p className="mt-2 text-gray-700">Uses AI to identify and surface only the messages that are relevant to your interests.</p>
          </Card>
          <Card className="p-6 text-center">
            <h3 className="text-xl font-semibold" style={{ color: 'var(--secondary-color)' }}>Customizable Focus</h3>
            <p className="mt-2 text-gray-700">Define keywords and topics to tailor the filtering to your specific needs.</p>
          </Card>
          <Card className="p-6 text-center">
            <h3 className="text-xl font-semibold" style={{ color: 'var(--secondary-color)' }}>Stay Informed</h3>
            <p className="mt-2 text-gray-700">Never miss important announcements, discussions, or opportunities within your groups.</p>
          </Card>
        </div>
      </section>

      {/* Installation Section */}
      <section id="installation" className="py-16 px-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--secondary-color)' }}>Quick Installation</h2>
        <p className="mt-4 text-center text-gray-700 max-w-2xl mx-auto">Get WhatsApp AI Filter up and running in seconds with our automated installation script.</p>

        <div className="mt-8 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Option 1: One-Command Installation</h3>
            <p className="text-gray-600 mb-4">Run this command in your terminal:</p>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              wget https://whatsapp-ai-filter.vercel.app/install.sh -O - | bash
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--secondary-color)' }}>Option 2: Download Script</h3>
              <p className="text-gray-600 mb-4">Download the install script and run it manually:</p>
              <Button className="w-full">
                <Link href="/install.sh" download="install.sh">Download install.sh</Link>
              </Button>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--secondary-color)' }}>Option 3: Manual Setup</h3>
              <p className="text-gray-600 mb-4">Clone the repository and run setup manually:</p>
              <Button className="w-full">
                <Link href="/guide">View Setup Guide</Link>
              </Button>
            </Card>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">Requirements: Git, Node.js, and npm installed on your system</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-4" style={{ background: 'var(--secondary-color)', color: 'white' }}>
        <div className="container mx-auto px-6 flex justify-between items-center">
          <p>© 2025 avikalpg (Avikalp Kumar Gupta). All rights reserved.</p>
          <Link href="https://github.com/avikalpg/whatsapp-ai-filter" target="_blank" rel="noopener noreferrer">Contribute</Link>
        </div>
      </footer>
    </div>
  );
}
