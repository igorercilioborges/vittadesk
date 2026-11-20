import Image from 'next/image';

export function Brand() {
  return (
    <div className="brand">
      <Image
        className="brand-logo"
        src="/branding/vittadesk-logo.webp"
        alt="VittaDesk"
        width={520}
        height={242}
        unoptimized
        preload
      />
    </div>
  );
}
