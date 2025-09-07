import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-white text-black py-0 px-6 border-b border-gray-200">
      <div className="max-w-4xl mx-auto flex items-center justify-center">
        <div className="flex items-center space-x-4">
          <Image 
            src="/images/logo.png" 
            alt="ロゴ" 
            width={200} 
            height={60}
            className="object-contain"
          />
        </div>
      </div>
    </header>
  );
}