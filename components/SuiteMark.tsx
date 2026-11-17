// The Cleary app-suite mark: the blue "CT" monogram on a dark tile, with this app's badge
// (a product box) in the corner. Same art as app/icon.svg.
export default function SuiteMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="64" height="64" rx="14" fill="#16181B" />
      <g transform="translate(1 0) scale(0.84)" fill="none" stroke="#4C8DFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"><path d="M52 16H27A11 11 0 0 0 16 27V37A11 11 0 0 0 27 48H30"/><path d="M44 16V48"/></g>
      <g fill="none" stroke="#E8C38A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M50 42L59 46.5V55.5L50 60L41 55.5V46.5Z"/><path d="M41 46.5L50 51L59 46.5M50 51V60"/><path d="M45.5 44.2L54.5 48.7V52.5" strokeWidth="1.6"/></g>
    </svg>
  );
}
