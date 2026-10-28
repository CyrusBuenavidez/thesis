import Image from "next/image";
import Link from "next/link";

type BrandProps = {
  compact?: boolean;
};

export function Brand({ compact = false }: BrandProps) {
  return (
    <Link className="brand" href="/" aria-label="PECIT Thesis Archive home">
      <span className="brand-mark" aria-hidden="true">
        <Image
          src="/pecit-logo.png"
          alt="PECIT Logo Seal"
          width={40}
          height={40}
          className="brand-logo-img object-contain"
          priority
        />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>PECIT</strong>
          <span>Thesis Archive</span>
        </span>
      )}
    </Link>
  );
}
