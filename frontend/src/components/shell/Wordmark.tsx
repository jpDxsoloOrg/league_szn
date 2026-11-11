import { Link } from 'react-router-dom';
import './Wordmark.css';

/** Product name, a proper noun in every language. */
const BRAND_NAME = 'League SZN';
const BRAND_MARK = 'SZN';
const BRAND_LEAD = 'League';

/** Booking-desk wordmark: a slanted plate with the mark, then the name. */
export default function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label={BRAND_NAME}>
      <span className="wordmark__plate" aria-hidden="true">
        <span className="wordmark__mark">{BRAND_MARK}</span>
      </span>
      <span className="wordmark__name" aria-hidden="true">
        {BRAND_LEAD} <span className="wordmark__name-accent">{BRAND_MARK}</span>
      </span>
    </Link>
  );
}
