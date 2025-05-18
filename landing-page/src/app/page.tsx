import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from 'next/image';

export default function Home() {
  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Logo Header */}
      <div className="flex items-center justify-between py-4 px-6 bg-white shadow-md">
        <div className="flex items-center">
          <Image src="/whatsapp-ai-filter-logo-nobg.png" alt="WhatsApp AI Filter Logo" width={50} height={50} />
          <span className="ml-3 text-xl font-semibold text-gray-800">WhatsApp AI Filter</span>
        </div>
        <a href="https://github.com/avikalpg/whatsapp-ai-filter" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">View on GitHub</a>
      </div>

      {/* Hero Section */}
      <main className="text-center py-28 min-h-96" style={{ background: 'var(--primary-gradient)', color: 'white' }}>
        <h1 className="text-4xl font-bold">Filter the Noise, Focus on What Matters in Your WhatsApp Groups</h1>
        <p className="mt-4 text-lg">An open-source tool leveraging AI to intelligently filter WhatsApp group messages, saving you time and keeping you informed.</p>
        <Button className="mt-6 px-6 py-3 rounded-lg">
          View on GitHub
        </Button>
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

      {/* Footer */}
      <footer className="text-center py-4" style={{ background: 'var(--secondary-color)', color: 'gray' }}>
        <p>© 2025 avikalpg (Avikalp Kumar Gupta). All rights reserved.</p>
      </footer>
    </div>
  );
}
