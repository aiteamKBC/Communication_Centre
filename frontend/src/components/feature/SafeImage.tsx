import { useEffect, useState } from 'react';

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export default function SafeImage({ src, alt, className = '', fallback }: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const safeSrc = typeof src === 'string' ? src.trim() : '';

  if (!safeSrc || hasError) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className={className} aria-hidden="true" />
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
