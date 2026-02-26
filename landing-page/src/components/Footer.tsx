import Link from 'next/link';

export default function Footer() {
	return (
		<footer className="py-4" style={{ background: 'var(--secondary-color)', color: 'white' }}>
			<div className="container max-w-full mx-0 px-6 flex justify-between items-center">
				<p className="flex-1">© {new Date().getFullYear()} avikalpg (Avikalp Kumar Gupta). All rights reserved.</p>
				<Link href="https://github.com/avikalpg/whatsapp-ai-filter" target="_blank" rel="noopener noreferrer">Contribute</Link>
			</div>
		</footer>
	);
}
