type Props = { size?: number };

/** Success mark that draws its circle, then its tick (470 ms). Remount with a new key to replay. */
export function SuccessCheck({ size = 18 }: Props) {
  return <svg className="success-check" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle className="success-check-circle" cx="12" cy="12" r="10" pathLength={1} />
    <path className="success-check-tick" d="M7.5 12.5l3 3 6-6.5" pathLength={1} />
  </svg>;
}
