import { Disc3 } from 'lucide-react';
import { useState } from 'react';

export function Artwork({
  src,
  title,
  className = '',
}: {
  src?: string;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string>();
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (
    <div
      className={`artwork ${className}`}
      style={{ '--art-hue': Math.abs(hash) % 360 } as React.CSSProperties}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt={`${title} cover`}
          loading="lazy"
          onError={() => setFailed(src)}
        />
      ) : (
        <>
          <div className="art-orbit" />
          <Disc3 aria-hidden="true" />
        </>
      )}
    </div>
  );
}
