import forecast from '../assets/product-icons/forecast.svg';
import burncast from '../assets/product-icons/burncast.svg';
import farmcast from '../assets/product-icons/farmcast.svg';
import safecast from '../assets/product-icons/safecast.svg';

const sources = { forecast, burncast, farmcast, safecast };
type IconProps = { size?: number };

function ProductIcon({ product, size = 20 }: IconProps & { product: keyof typeof sources }) {
  const mask = `url("${sources[product]}")`;
  return <i className="product-nav-icon" aria-hidden="true" style={{
    width: size, height: size, maskImage: mask, WebkitMaskImage: mask,
  }} />;
}

export const ForecastIcon = (props: IconProps) => <ProductIcon {...props} product="forecast" />;
export const BurncastIcon = (props: IconProps) => <ProductIcon {...props} product="burncast" />;
export const FarmcastIcon = (props: IconProps) => <ProductIcon {...props} product="farmcast" />;
export const SafecastIcon = (props: IconProps) => <ProductIcon {...props} product="safecast" />;
