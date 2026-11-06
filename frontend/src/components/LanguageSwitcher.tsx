import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
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
  const { t, i18n } = useTranslation();

  // The detector can report a region such as de-DE.
  const baseLanguage = i18n.language?.split('-')[0] ?? 'en';
  const currentLang = languages.find((lang) => lang.code === baseLanguage) ?? languages[0];
  const CurrentFlag = (currentLang && flags[currentLang.code]) ?? FlagUK;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="language-switcher-btn" aria-label={t('languageSwitcher.label')}>
        <CurrentFlag />
        <ChevronDown aria-hidden="true" className="dropdown-arrow" size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="language-dropdown" align="end" sideOffset={6}>
          <DropdownMenu.RadioGroup value={currentLang?.code} onValueChange={(code) => i18n.changeLanguage(code)}>
            {languages.map((lang) => {
              const Flag = flags[lang.code];
              if (!Flag) return null;
              return (
                <DropdownMenu.RadioItem key={lang.code} value={lang.code} className="language-option">
                  <Flag />
                  <span className="lang-name">{lang.name}</span>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
