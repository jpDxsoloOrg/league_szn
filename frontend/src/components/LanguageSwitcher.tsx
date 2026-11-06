import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './LanguageSwitcher.css';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  // The detector can report a region such as de-DE.
  const baseLanguage = i18n.language?.split('-')[0] ?? 'en';
  const currentLang = languages.find((lang) => lang.code === baseLanguage) ?? languages[0];

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="language-switcher-btn" aria-label={t('languageSwitcher.label')}>
        <Languages aria-hidden="true" size={18} />
        <span className="language-code" aria-hidden="true">{currentLang?.code}</span>
        <ChevronDown aria-hidden="true" className="dropdown-arrow" size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="language-dropdown" align="end" sideOffset={6}>
          <DropdownMenu.RadioGroup value={currentLang?.code} onValueChange={(code) => i18n.changeLanguage(code)}>
            {languages.map((lang) => (
              <DropdownMenu.RadioItem key={lang.code} value={lang.code} className="language-option">
                <span className="language-code" aria-hidden="true">{lang.code}</span>
                <span className="lang-name">{lang.name}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
