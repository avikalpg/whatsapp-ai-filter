import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Installation from '@/components/Installation';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div className="bg-gray-100 min-h-screen">
      <Header />
      <Hero />
      <Features />
      <Installation />
      <Footer />
    </div>
  );
}
