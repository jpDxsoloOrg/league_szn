import { Link } from 'react-router-dom';
import './Wordmark.css';

/** Product name, a proper noun in every language. */
const BRAND_NAME = 'League SZN';

export default function Wordmark() {
  return (
    <Link to="/" className="wordmark">
      {BRAND_NAME}
    </Link>
  );
}
