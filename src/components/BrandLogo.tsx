import fullBlueLogo from '../assets/BenchmarkLogo-blue.png';
import fullWhiteLogo from '../assets/BenchmarkLogo-white.png';
import iconLogo from '../assets/BL_Iso_red_128x128.png';

type BrandLogoVariant = 'blue' | 'white' | 'icon';

type Props = {
  variant?: BrandLogoVariant;
  className?: string;
};

const LOGOS: Record<BrandLogoVariant, string> = {
  blue: fullBlueLogo,
  white: fullWhiteLogo,
  icon: iconLogo,
};

export function BrandLogo({ variant = 'blue', className }: Props) {
  const classes = ['brand-logo', className].filter(Boolean).join(' ');

  return <img className={classes} src={LOGOS[variant]} alt="Benchmark Labs" />;
}
