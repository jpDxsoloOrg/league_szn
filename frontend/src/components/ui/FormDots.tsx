import { useTranslation } from 'react-i18next';
import './FormDots.css';

export type FormResult = 'W' | 'L' | 'D';

export interface FormDotsProps {
  /** Oldest to newest, as the standings API returns `recentForm`. */
  results: FormResult[];
  className?: string;
}

const RESULT_KEYS: Record<FormResult, string> = {
  W: 'ui.formDots.win',
  L: 'ui.formDots.loss',
  D: 'ui.formDots.draw',
};

/** Recent results as coloured dots, with a text alternative for screen readers. */
export default function FormDots({ results, className = '' }: FormDotsProps) {
  const { t } = useTranslation();
  const summary = results.map((result) => t(RESULT_KEYS[result])).join(', ');

  return (
    <span className={`ui-form-dots ${className}`.trim()} role="img" aria-label={`${t('ui.formDots.label')}: ${summary}`}>
      {results.map((result, index) => (
        <span key={index} className={`ui-form-dots__dot ui-form-dots__dot--${result.toLowerCase()}`} />
      ))}
    </span>
  );
}
