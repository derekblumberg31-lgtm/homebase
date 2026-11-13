import { Link } from 'react-router-dom';
import { PRODUCT } from './areas';

/** The logo and name at the top of the sidebar. A real link to Home; the label also covers the narrow sidebar, where the name is hidden. */
export function BrandLink() {
  return (
    <Link to="/home" className="brand" aria-label={`${PRODUCT.name}, go to Home`}>
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <div className="brand-text">
        <div className="brand-name">{PRODUCT.name}</div>
      </div>
    </Link>
  );
}
