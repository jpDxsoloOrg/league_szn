import { Link } from 'react-router-dom';
import './Wordmark.css';

/** Product name, a proper noun in every language. */
const BRAND_NAME = 'League SZN';
const WORDMARK_SRC = '/images/brand/logo-wordmark.png';
/** The file's pixel size. CSS sets the shown size; these reserve its shape before it loads. */
const WORDMARK_WIDTH = 662;
const WORDMARK_HEIGHT = 120;

export default function Wordmark() {
  return (
    <Link to="/" className="wordmark">
      <img
        className="wordmark__image"
        src={WORDMARK_SRC}
        alt={BRAND_NAME}
        width={WORDMARK_WIDTH}
        height={WORDMARK_HEIGHT}
      />
    </Link>
  );
}
