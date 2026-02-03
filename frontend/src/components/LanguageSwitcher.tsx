import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './LanguageSwitcher.css';

// SVG Flag components
const FlagUK = () => (
  <svg viewBox="0 0 60 30" className="flag-icon">
    <clipPath id="uk-clip">
      <rect width="60" height="30"/>
    </clipPath>
    <g clipPath="url(#uk-clip)">
      <rect width="60" height="30" fill="#012169"/>
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath="url(#uk-diag)"/>
      <clipPath id="uk-diag">
        <path d="M30,15 L60,30 L60,25 L35,15 L60,5 L60,0 L30,15 L0,0 L0,5 L25,15 L0,25 L0,30 Z"/>
      </clipPath>
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10"/>
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6"/>
    </g>
  </svg>
);

const FlagDE = () => (
  <svg viewBox="0 0 5 3" className="flag-icon">
    <rect width="5" height="1" y="0" fill="#000"/>
    <rect width="5" height="1" y="1" fill="#DD0000"/>
    <rect width="5" height="1" y="2" fill="#FFCE00"/>
  </svg>
);

const flags: Record<string, () => JSX.Element> = {
  en: FlagUK,
  de: FlagDE,
};

const languages = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find(lang => lang.code === i18n.language) || languages[0];
  const CurrentFlag = flags[currentLang.code];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="language-switcher" ref={dropdownRef}>
      <button
        className="language-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentFlag />
        <svg
          className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {isOpen && (
        <ul className="language-dropdown" role="listbox">
          {languages.map((lang) => {
            const Flag = flags[lang.code];
            return (
              <li
                key={lang.code}
                className={`language-option ${lang.code === i18n.language ? 'active' : ''}`}
                onClick={() => handleLanguageChange(lang.code)}
                role="option"
                aria-selected={lang.code === i18n.language}
              >
                <Flag />
                <span className="lang-name">{lang.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
