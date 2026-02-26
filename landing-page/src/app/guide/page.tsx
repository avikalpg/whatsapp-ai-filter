'use client'

import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Guide() {
  const router = useRouter();

  return (
    <div className="bg-gray-100 min-h-screen">
      <Header />
      <div className="max-w-3xl mx-auto py-12 px-4 bg-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center" style={{ color: 'var(--secondary-color)' }}>WhatsApp AI Filter Guide</h1>
      <p className="mb-6 text-gray-600 text-center">This guide covers all commands, configuration options, and usage examples for WhatsApp AI Filter.</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Getting Started</h2>
        <ol className="list-decimal ml-6 space-y-2 text-gray-700">
          <li>Open your terminal and navigate to the folder where you want to install the tool.</li>
          <li>Run the following command:
            <pre className="bg-gray-100 p-3 rounded mt-2 text-sm overflow-x-auto font-mono">wget https://whatsapp-ai-filter.vercel.app/install.sh -O - | bash</pre>
          </li>
          <li>Follow the interactive setup prompts.</li>
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Command Reference</h2>
        <ul className="list-disc ml-6 space-y-2 text-gray-700">
          <li><span className="font-semibold">!help</span> — Show help message with all commands.</li>
          <li><span className="font-semibold">!list</span> — List all current configuration values.</li>
          <li><span className="font-semibold">!get &lt;key&gt;</span> — Get the value for a config key (e.g. <code className="bg-gray-100 px-1 rounded">!get interests</code>).</li>
          <li><span className="font-semibold">!set interests=&lt;comma separated list&gt;</span> — Set your interests (e.g. <code className="bg-gray-100 px-1 rounded">!set interests=AI, WhatsApp automation</code>).</li>
          <li><span className="font-semibold">!set processDirectMessages=on|off</span> — Enable/disable direct message processing.</li>
          <li><span className="font-semibold">!set groups</span> — Start interactive group inclusion/exclusion setup.</li>
          <li><span className="font-semibold">!set_command_chat</span> — Set the current chat as the command channel.</li>
          <li><span className="font-semibold">!set_notification_chat</span> — Set the current chat as the notification channel.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Examples</h2>
        <ul className="list-disc ml-6 space-y-2 text-gray-700">
          <li><code className="bg-gray-100 px-1 rounded">!set interests=AI, events, job alerts</code> — Only get notified about messages related to AI, events, or job alerts.</li>
          <li><code className="bg-gray-100 px-1 rounded">!set processDirectMessages=off</code> — Only process group messages, ignore direct messages.</li>
          <li><code className="bg-gray-100 px-1 rounded">!set groups</code> — Interactively select which groups to include or exclude from filtering.</li>
          <li><code className="bg-gray-100 px-1 rounded">!set_command_chat</code> — In any chat, send this command to make it your command channel.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--secondary-color)' }}>Tips</h2>
        <ul className="list-disc ml-6 space-y-2 text-gray-700">
          <li>Use <span className="font-semibold">!list</span> to see all your current settings at any time.</li>
          <li>All configuration is stored locally and can be reset by editing <code className="bg-gray-100 px-1 rounded">core/data/user_config.json</code>.</li>
          <li>For advanced troubleshooting, check logs in <code className="bg-gray-100 px-1 rounded">core/logs/</code>.</li>
        </ul>
      </section>

      <div className="text-center mt-12">
        <Button variant="secondary" onClick={() => router.push('/')}>
          ← Back to Home
        </Button>
      </div>
      </div>
      <Footer />
    </div>
  );
}
