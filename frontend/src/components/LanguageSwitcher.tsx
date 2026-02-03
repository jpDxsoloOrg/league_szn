import { useTranslation } from 'react-i18next';
import './LanguageSwitcher.css';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'de' ? 'en' : 'de';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      className="language-switcher"
      onClick={toggleLanguage}
      title={i18n.language === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
    >
      {i18n.language === 'de' ? '🇬🇧 EN' : '🇩🇪 DE'}
    </button>
  );
}
