import React from "react";

/**
 * Pure Cute Halloween SVG Sticker & Illustration System.
 * Decorative stickers use aria-hidden="true" so screen readers are never cluttered.
 */

export function CuteGhostSticker({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      className={`${className} animate-float-slow select-none`}
    >
      <path
        d="M16 28C16 16.954 23.163 8 32 8C40.837 8 48 16.954 48 28V52C48 53.5 46 54.5 44.5 53C43 51.5 41 51.5 39.5 53C38 54.5 36 54.5 34.5 53C33 51.5 31 51.5 29.5 53C28 54.5 26 54.5 24.5 53C23 51.5 21 51.5 19.5 53C18 54.5 16 53.5 16 52V28Z"
        fill="#FFF8ED"
        stroke="#C4B5FD"
        strokeWidth="2.5"
      />
      <circle cx="26" cy="27" r="3" fill="#160B28" />
      <circle cx="38" cy="27" r="3" fill="#160B28" />
      <ellipse cx="22" cy="31" rx="2.5" ry="1.5" fill="#FF7B29" fillOpacity="0.65" />
      <ellipse cx="42" cy="31" rx="2.5" ry="1.5" fill="#FF7B29" fillOpacity="0.65" />
      <path
        d="M29 33C30 34.8 34 34.8 35 33"
        stroke="#160B28"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PumpkinSticker({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" className={className}>
      <path
        d="M30 14C30 10 33 7 37 8"
        stroke="#4ADE80"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <ellipse cx="32" cy="36" rx="22" ry="17" fill="#FF7B29" stroke="#FFF8ED" strokeWidth="2" />
      <ellipse cx="32" cy="36" rx="12" ry="17" fill="#FF944D" stroke="#160B28" strokeWidth="1.5" />
      <polygon points="23,31 27,31 25,26" fill="#160B28" />
      <polygon points="37,31 41,31 39,26" fill="#160B28" />
      <path
        d="M23 40C26 44 38 44 41 40L38 41L35 39L32 41L29 39L26 41L23 40Z"
        fill="#160B28"
      />
    </svg>
  );
}

export function CuteSkeletonSticker({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" className={className}>
      <rect
        x="14"
        y="10"
        width="36"
        height="32"
        rx="16"
        fill="#FFF8ED"
        stroke="#C4B5FD"
        strokeWidth="2.5"
      />
      <rect
        x="22"
        y="38"
        width="20"
        height="14"
        rx="4"
        fill="#FFF8ED"
        stroke="#C4B5FD"
        strokeWidth="2.5"
      />
      <circle cx="25" cy="25" r="4.5" fill="#160B28" />
      <circle cx="39" cy="25" r="4.5" fill="#160B28" />
      <polygon points="32,30 29.5,34 34.5,34" fill="#FF7B29" />
      <line x1="27" y1="41" x2="27" y2="49" stroke="#160B28" strokeWidth="2" />
      <line x1="32" y1="41" x2="32" y2="49" stroke="#160B28" strokeWidth="2" />
      <line x1="37" y1="41" x2="37" y2="49" stroke="#160B28" strokeWidth="2" />
    </svg>
  );
}

export function BatClusterSticker({ className = "w-12 h-8" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 44" fill="none" className={className}>
      <path
        d="M12 22C18 14 24 18 30 22C34 17 38 17 40 22C42 17 46 17 50 22C56 18 62 14 68 22C60 24 55 29 50 32C45 27 35 27 30 32C25 29 20 24 12 22Z"
        fill="#C4B5FD"
      />
      <circle cx="37" cy="23" r="1.4" fill="#FF7B29" />
      <circle cx="43" cy="23" r="1.4" fill="#FF7B29" />
    </svg>
  );
}

export function SpookyMoonBadge({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" className={className}>
      <circle cx="32" cy="32" r="24" fill="#21113B" stroke="#3E236B" strokeWidth="2" />
      <path
        d="M38 14C27.5 14 19 22.5 19 33C19 43.5 27.5 52 38 52C42.5 52 46.6 50.4 49.8 47.8C41.2 47.4 34.4 40.3 34.4 31.6C34.4 23.4 40.4 16.6 48.2 15.5C45.1 14.5 41.6 14 38 14Z"
        fill="#FF944D"
      />
      <circle cx="46" cy="24" r="1.8" fill="#FFF8ED" />
      <circle cx="24" cy="20" r="1.3" fill="#C4B5FD" />
    </svg>
  );
}

export function HauntedHouseIllustration({ className = "w-28 h-28" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" fill="none" className={className}>
      <circle cx="60" cy="60" r="50" fill="#21113B" stroke="#3E236B" strokeWidth="2" />
      <circle cx="82" cy="34" r="12" fill="#FF944D" fillOpacity="0.85" />
      <polygon points="32,62 60,30 88,62" fill="#2C184D" stroke="#C4B5FD" strokeWidth="2" />
      <rect
        x="38"
        y="62"
        width="44"
        height="38"
        fill="#160B28"
        stroke="#C4B5FD"
        strokeWidth="2"
      />
      <rect x="54" y="78" width="12" height="22" rx="6" fill="#FF7B29" />
      <rect x="44" y="68" width="8" height="8" rx="2" fill="#FFF8ED" />
      <rect x="68" y="68" width="8" height="8" rx="2" fill="#FFF8ED" />
      <polygon points="56,36 60,22 64,36" fill="#C4B5FD" />
    </svg>
  );
}

export function HalloweenEmptyState({
  title,
  description,
  action,
  variant = "ghost",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  variant?: "ghost" | "pumpkin" | "skeleton" | "haunted";
}) {
  return (
    <div className="rounded-2xl border border-[#3e236b] bg-[#160b28]/90 p-8 text-center shadow-lg">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-[#3e236b] bg-[#21113b]">
        {variant === "ghost" && <CuteGhostSticker className="h-12 w-12" />}
        {variant === "pumpkin" && <PumpkinSticker className="h-12 w-12" />}
        {variant === "skeleton" && <CuteSkeletonSticker className="h-12 w-12" />}
        {variant === "haunted" && <HauntedHouseIllustration className="h-16 w-16" />}
      </div>
      <h2 className="text-lg font-semibold text-[#fff8ed]">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[#d8cbe8]">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
