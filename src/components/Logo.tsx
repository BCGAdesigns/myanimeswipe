import { useId } from 'react'

/** The WatchMatch mark: two fanned cards with a play symbol (same drawing as public/icon.svg). */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg className={className} viewBox="4 4 56 56" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect x="11" y="10" width="30" height="41" rx="8" fill="#8B5CF6" fillOpacity="0.38" transform="rotate(-13 26 30.5)" />
      <rect x="22" y="12" width="30" height="41" rx="8" fill={`url(#${id})`} transform="rotate(9 37 32.5)" />
      <path
        d="M32.5 25.5 L44 33 L32.5 40.5 Z"
        fill="#fff"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinejoin="round"
        transform="rotate(9 37 32.5)"
      />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span>
      Watch<span className="brand-match">Match</span>
    </span>
  )
}
