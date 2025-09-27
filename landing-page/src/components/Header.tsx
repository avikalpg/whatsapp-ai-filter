import { Button } from "@/components/ui/button";
import Image from 'next/image';
import Link from 'next/link';

export default function Header() {
  return (
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
  );
}
