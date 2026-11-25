import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { isApiError } from '../../services/api/apiClient';
import {
  economyApi,
  ECONOMY_CONTRACT_TYPES,
  MAX_FINE_PRESETS,
  type ContractPayTerms,
  type EconomyContractType,
  type EconomySettings,
  type ShopItemKey,
  type ShopSettings,
} from '../../services/api/economy.api';
import { formatInstant } from '../../utils/dateUtils';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import {
  calculateSeasonBudget,
  findEconomyFormProblem,
  toEconomyForm,
  toEconomyInput,
  type EconomyForm,
  type EconomyFormProblem,
} from './economyConfigForm';
import './adminContent.css';
import './AdminEconomyConfig.css';

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}

/** A whole-number input. An empty box is NaN until the GM types a value. */
function NumberField({ id, label, value, onChange, min = 0, max, hint }: NumberFieldProps) {
  return (
    <div className="ac-field">
      <label className="ac-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
      />
      {hint && <p className="ac-field__hint">{hint}</p>}
    </div>
  );
}

const CONTRACT_FALLBACKS: Record<EconomyContractType, string> = {
  tryout: 'Tryout',
  matches: 'Match contract',
  season: 'Season contract',
};

const PAY_FIELDS: { field: keyof ContractPayTerms; fallback: string }[] = [
  { field: 'perMatchPay', fallback: 'Pay per match' },
  { field: 'weeklySalary', fallback: 'Weekly salary' },
  { field: 'winBonus', fallback: 'Win bonus' },
];

const SHOP_FALLBACKS: Record<ShopItemKey, { name: string; description: string }> = {
  injuryShield: { name: 'Injury shield', description: 'Lowers the chance of getting injured for a few matches.' },
  rehab: { name: 'Rehab', description: 'Takes time off an active injury.' },
  staminaTopUp: { name: 'Stamina top-up', description: 'Adds stamina back.' },
  simInterference: { name: 'Sim interference', description: 'Boosts the buyer\'s rating in a simulated match.' },
  gmInterference: { name: 'GM interference', description: 'Pays the GM to step into a match.' },
};

const PROBLEM_FALLBACKS: Record<EconomyFormProblem, string> = {
  currency: 'Give the currency a name and a symbol.',
  amounts: 'Fill in every amount with a whole number of 0 or more. Counts such as matches, weeks and offer days start at 1, and the shield reduction runs from 0 to 100%.',
  presetLabels: 'Give every fine preset a label.',
  tooManyPresets: 'There can be at most {{max}} fine presets.',
};

const DEFAULT_BUDGET_WEEKS = 10;
const DEFAULT_BUDGET_MATCHES = 10;
const DEFAULT_BUDGET_WINS = 5;

type Message = { tone: 'success' | 'error'; text: string; conflict?: boolean };

/** Economy settings (ECO-11): Admins edit, Moderators view. */
export default function AdminEconomyConfig() {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const { features } = useSiteConfig();
  const canEdit = isSuperAdmin;

  const [saved, setSaved] = useState<EconomySettings | null>(null);
  const [form, setForm] = useState<EconomyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [budgetWeeks, setBudgetWeeks] = useState(DEFAULT_BUDGET_WEEKS);
  const [budgetMatches, setBudgetMatches] = useState(DEFAULT_BUDGET_MATCHES);
  const [budgetWins, setBudgetWins] = useState(DEFAULT_BUDGET_WINS);
  const nextRowId = useRef(0);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await economyApi.getConfig(signal);
      if (signal?.aborted) return;
      setSaved(result.settings);
      setForm(toEconomyForm(result.settings));
    } catch {
      if (!signal?.aborted) setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

  const title = t('admin.economyConfig.title', 'Economy Settings');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (!form || !saved || loadFailed) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <AdminNotice
          tone="error"
          action={<Button variant="secondary" size="sm" onClick={() => void loadSettings()}>{t('admin.economyConfig.retry', 'Try again')}</Button>}
        >
          {t('admin.economyConfig.loadFailed', 'Could not load the economy settings.')}
        </AdminNotice>
      </div>
    );
  }

  const symbol = form.currencySymbol.trim();
  const formatMoney = (amount: number) => `${symbol}${amount.toLocaleString(i18n.language)}`;

  const updateForm = (patch: Partial<EconomyForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const updateContract = (type: EconomyContractType, patch: Partial<ContractPayTerms> & { matches?: number }) => {
    setForm((current) => (current
      ? {
        ...current,
        contractDefaults: { ...current.contractDefaults, [type]: { ...current.contractDefaults[type], ...patch } },
      }
      : current));
  };

  const updateShop = <K extends ShopItemKey>(item: K, patch: Partial<ShopSettings[K]>) => {
    setForm((current) => (current
      ? { ...current, shop: { ...current.shop, [item]: { ...current.shop[item], ...patch } } }
      : current));
  };

  const updatePreset = (rowId: string, patch: { label?: string; amount?: number }) => {
    setForm((current) => (current
      ? { ...current, finePresets: current.finePresets.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)) }
      : current));
  };

  const addPreset = () => {
    nextRowId.current += 1;
    const rowId = `new-${nextRowId.current}`;
    setForm((current) => (current
      ? { ...current, finePresets: [...current.finePresets, { rowId, key: '', label: '', amount: 0 }] }
      : current));
  };

  const removePreset = (rowId: string) => {
    setForm((current) => (current
      ? { ...current, finePresets: current.finePresets.filter((row) => row.rowId !== rowId) }
      : current));
  };

  const handleSave = async () => {
    const problem = findEconomyFormProblem(form);
    if (problem) {
      setMessage({
        tone: 'error',
        text: t(`admin.economyConfig.problems.${problem}`, PROBLEM_FALLBACKS[problem], { max: MAX_FINE_PRESETS }),
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await economyApi.updateConfig(toEconomyInput(form), saved.version);
      setSaved(result.settings);
      setForm(toEconomyForm(result.settings));
      setMessage({ tone: 'success', text: t('admin.economyConfig.saved', 'Economy settings saved.') });
    } catch (err) {
      if (isApiError(err, 409)) {
        setMessage({
          tone: 'error',
          conflict: true,
          text: t(
            'admin.economyConfig.conflict',
            'Someone else saved these settings after you opened the page. Reload to see their version, then make your changes again.',
          ),
        });
      } else {
        setMessage({
          tone: 'error',
          text: err instanceof Error ? err.message : t('admin.economyConfig.saveFailed', 'Failed to save the economy settings'),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setForm(toEconomyForm(saved));
    setMessage(null);
  };

  const handleReload = async () => {
    setMessage(null);
    await loadSettings();
  };

  const budget = calculateSeasonBudget(form.contractDefaults.season, budgetWeeks, budgetMatches, budgetWins);
  const shield = form.shop.injuryShield;

  return (
    <div className="ac-page economy-config">
      <PageHeader
        title={title}
        subtitle={t(
          'admin.economyConfig.subtitle',
          'Set the league currency, contract pay, fines and shop prices. Changes apply to new offers, fines and purchases.',
        )}
      />

      {!features.economy && (
        <AdminNotice tone="info">
          {t(
            'admin.economyConfig.featureOff',
            'The economy is turned off, so players don\'t see any of this yet. An Admin can turn it on in Feature Management.',
          )}
        </AdminNotice>
      )}
      {!canEdit && (
        <AdminNotice tone="info">
          {t('admin.economyConfig.readOnly', 'You can view these settings. Only Admins can change them.')}
        </AdminNotice>
      )}
      {message && (
        <AdminNotice
          tone={message.tone}
          onDismiss={() => setMessage(null)}
          action={message.conflict
            ? <Button variant="secondary" size="sm" onClick={() => void handleReload()}>{t('admin.economyConfig.reload', 'Reload')}</Button>
            : undefined}
        >
          {message.text}
        </AdminNotice>
      )}

      <p className="ac-section__text economy-config__version">
        {saved.version > 0 && saved.updatedAt
          ? t('admin.economyConfig.version', 'Version {{version}}, saved by {{user}} on {{date}}.', {
            version: saved.version,
            user: saved.updatedBy ?? '?',
            date: formatInstant(saved.updatedAt, i18n.language),
          })
          : t('admin.economyConfig.notSaved', 'Not saved yet: these are the starting values.')}
      </p>

      <fieldset className="economy-config__fieldset" disabled={!canEdit}>
        <Card className="ac-form">
          <h2 className="ac-section__title">{t('admin.economyConfig.currency.title', 'Currency')}</h2>
          <div className="ac-form__row">
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="economy-currency-name">
                {t('admin.economyConfig.currency.name', 'Currency name')}
              </label>
              <input
                id="economy-currency-name"
                type="text"
                maxLength={40}
                value={form.currencyName}
                onChange={(event) => updateForm({ currencyName: event.target.value })}
              />
            </div>
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="economy-currency-symbol">
                {t('admin.economyConfig.currency.symbol', 'Symbol')}
              </label>
              <input
                id="economy-currency-symbol"
                type="text"
                maxLength={5}
                value={form.currencySymbol}
                onChange={(event) => updateForm({ currencySymbol: event.target.value })}
              />
            </div>
          </div>
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.economyConfig.contracts.title', 'Contract defaults')}</h2>
            <p className="ac-section__text">
              {t('admin.economyConfig.contracts.description', 'Each new offer starts from these terms. GMs can change them on any single offer.')}
            </p>
          </div>
          {ECONOMY_CONTRACT_TYPES.map((type) => {
            const terms = form.contractDefaults[type];
            const typeLabel = t(`admin.economyConfig.contracts.types.${type}`, CONTRACT_FALLBACKS[type]);
            return (
              <fieldset className="economy-config__group" key={type}>
                <legend className="economy-config__legend">{typeLabel}</legend>
                <div className="ac-form__row">
                  {type === 'tryout' && (
                    <NumberField
                      id="economy-tryout-matches"
                      label={t('admin.economyConfig.contracts.tryoutMatches', 'Tryout length (matches)')}
                      value={form.contractDefaults.tryout.matches}
                      min={1}
                      onChange={(value) => updateContract('tryout', { matches: value })}
                    />
                  )}
                  {PAY_FIELDS.map(({ field, fallback }) => (
                    <NumberField
                      key={field}
                      id={`economy-${type}-${field}`}
                      label={t(`admin.economyConfig.contracts.${field}`, fallback)}
                      value={terms[field]}
                      onChange={(value) => updateContract(type, { [field]: value })}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </Card>

        <Card className="ac-form">
          <h2 className="ac-section__title">{t('admin.economyConfig.general.title', 'Bonuses, offers and fines')}</h2>
          <div className="ac-form__row">
            <NumberField
              id="economy-free-agent-win-bonus"
              label={t('admin.economyConfig.general.freeAgentWinBonus', 'Free agent win bonus')}
              hint={t('admin.economyConfig.general.freeAgentWinBonusHint', 'Paid for a win to a wrestler without a contract.')}
              value={form.freeAgentWinBonus}
              onChange={(value) => updateForm({ freeAgentWinBonus: value })}
            />
            <NumberField
              id="economy-offer-expiry-days"
              label={t('admin.economyConfig.general.offerExpiryDays', 'Offer expiry (days)')}
              hint={t('admin.economyConfig.general.offerExpiryDaysHint', 'How long a contract offer stays open.')}
              value={form.offerExpiryDays}
              min={1}
              onChange={(value) => updateForm({ offerExpiryDays: value })}
            />
            <NumberField
              id="economy-no-show-fine"
              label={t('admin.economyConfig.general.noShowFine', 'No-show fine')}
              hint={t('admin.economyConfig.general.noShowFineHint', 'Charged for missing a booked match.')}
              value={form.noShowFine}
              onChange={(value) => updateForm({ noShowFine: value })}
            />
          </div>
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.economyConfig.fines.title', 'Fine presets')}</h2>
            <p className="ac-section__text">
              {t('admin.economyConfig.fines.description', 'One-click fines GMs can hand out.')}
            </p>
          </div>
          {form.finePresets.length === 0 && (
            <p className="ac-section__text">{t('admin.economyConfig.fines.empty', 'No fine presets yet.')}</p>
          )}
          <ul className="economy-config__presets">
            {form.finePresets.map((row, index) => (
              <li className="economy-config__preset" key={row.rowId}>
                <div className="ac-field economy-config__preset-label">
                  <label className="ac-field__label" htmlFor={`economy-preset-label-${row.rowId}`}>
                    {t('admin.economyConfig.fines.label', 'Label')}
                  </label>
                  <input
                    id={`economy-preset-label-${row.rowId}`}
                    type="text"
                    maxLength={80}
                    value={row.label}
                    onChange={(event) => updatePreset(row.rowId, { label: event.target.value })}
                  />
                </div>
                <NumberField
                  id={`economy-preset-amount-${row.rowId}`}
                  label={t('admin.economyConfig.fines.amount', 'Amount')}
                  value={row.amount}
                  onChange={(value) => updatePreset(row.rowId, { amount: value })}
                />
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="economy-config__preset-remove"
                    icon={<Trash2 aria-hidden="true" size={16} />}
                    aria-label={t('admin.economyConfig.fines.removeNamed', 'Remove fine preset {{number}}', { number: index + 1 })}
                    onClick={() => removePreset(row.rowId)}
                  >
                    {t('admin.economyConfig.fines.remove', 'Remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="ac-actions">
              <Button
                variant="secondary"
                icon={<Plus aria-hidden="true" size={16} />}
                onClick={addPreset}
                disabled={form.finePresets.length >= MAX_FINE_PRESETS}
              >
                {t('admin.economyConfig.fines.add', 'Add fine preset')}
              </Button>
            </div>
          )}
        </Card>

        <Card className="ac-form">
          <div>
            <h2 className="ac-section__title">{t('admin.economyConfig.shop.title', 'Shop items')}</h2>
            <p className="ac-section__text">
              {t('admin.economyConfig.shop.description', 'Turn items on or off and set their price and effect. Turned-off items stay out of the shop.')}
            </p>
          </div>

          <fieldset className="economy-config__group">
            <legend className="economy-config__legend">{t('admin.economyConfig.shop.items.injuryShield.name', SHOP_FALLBACKS.injuryShield.name)}</legend>
            <p className="ac-field__hint">{t('admin.economyConfig.shop.items.injuryShield.description', SHOP_FALLBACKS.injuryShield.description)}</p>
            <label className="ac-check">
              <input type="checkbox" checked={shield.enabled} onChange={() => updateShop('injuryShield', { enabled: !shield.enabled })} />
              {t('admin.economyConfig.shop.enabled', 'In the shop')}
            </label>
            <div className="ac-form__row">
              <NumberField
                id="economy-shop-injuryShield-price"
                label={t('admin.economyConfig.shop.price', 'Price')}
                value={shield.price}
                onChange={(value) => updateShop('injuryShield', { price: value })}
              />
              <NumberField
                id="economy-shop-injuryShield-chanceReduction"
                label={t('admin.economyConfig.shop.chanceReduction', 'Injury chance cut (%)')}
                value={Number.isNaN(shield.chanceReduction) ? Number.NaN : Math.round(shield.chanceReduction * 100)}
                max={100}
                onChange={(value) => updateShop('injuryShield', { chanceReduction: value / 100 })}
              />
              <NumberField
                id="economy-shop-injuryShield-matches"
                label={t('admin.economyConfig.shop.shieldMatches', 'Lasts (matches)')}
                value={shield.matches}
                min={1}
                onChange={(value) => updateShop('injuryShield', { matches: value })}
              />
            </div>
          </fieldset>

          <fieldset className="economy-config__group">
            <legend className="economy-config__legend">{t('admin.economyConfig.shop.items.rehab.name', SHOP_FALLBACKS.rehab.name)}</legend>
            <p className="ac-field__hint">{t('admin.economyConfig.shop.items.rehab.description', SHOP_FALLBACKS.rehab.description)}</p>
            <label className="ac-check">
              <input type="checkbox" checked={form.shop.rehab.enabled} onChange={() => updateShop('rehab', { enabled: !form.shop.rehab.enabled })} />
              {t('admin.economyConfig.shop.enabled', 'In the shop')}
            </label>
            <div className="ac-form__row">
              <NumberField
                id="economy-shop-rehab-price"
                label={t('admin.economyConfig.shop.price', 'Price')}
                value={form.shop.rehab.price}
                onChange={(value) => updateShop('rehab', { price: value })}
              />
              <NumberField
                id="economy-shop-rehab-weeksOff"
                label={t('admin.economyConfig.shop.weeksOff', 'Weeks taken off the injury')}
                value={form.shop.rehab.weeksOff}
                min={1}
                onChange={(value) => updateShop('rehab', { weeksOff: value })}
              />
            </div>
          </fieldset>

          <fieldset className="economy-config__group">
            <legend className="economy-config__legend">{t('admin.economyConfig.shop.items.staminaTopUp.name', SHOP_FALLBACKS.staminaTopUp.name)}</legend>
            <p className="ac-field__hint">{t('admin.economyConfig.shop.items.staminaTopUp.description', SHOP_FALLBACKS.staminaTopUp.description)}</p>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={form.shop.staminaTopUp.enabled}
                onChange={() => updateShop('staminaTopUp', { enabled: !form.shop.staminaTopUp.enabled })}
              />
              {t('admin.economyConfig.shop.enabled', 'In the shop')}
            </label>
            <div className="ac-form__row">
              <NumberField
                id="economy-shop-staminaTopUp-price"
                label={t('admin.economyConfig.shop.price', 'Price')}
                value={form.shop.staminaTopUp.price}
                onChange={(value) => updateShop('staminaTopUp', { price: value })}
              />
              <NumberField
                id="economy-shop-staminaTopUp-amount"
                label={t('admin.economyConfig.shop.staminaAmount', 'Stamina added')}
                value={form.shop.staminaTopUp.amount}
                onChange={(value) => updateShop('staminaTopUp', { amount: value })}
              />
            </div>
          </fieldset>

          <fieldset className="economy-config__group">
            <legend className="economy-config__legend">{t('admin.economyConfig.shop.items.simInterference.name', SHOP_FALLBACKS.simInterference.name)}</legend>
            <p className="ac-field__hint">{t('admin.economyConfig.shop.items.simInterference.description', SHOP_FALLBACKS.simInterference.description)}</p>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={form.shop.simInterference.enabled}
                onChange={() => updateShop('simInterference', { enabled: !form.shop.simInterference.enabled })}
              />
              {t('admin.economyConfig.shop.enabled', 'In the shop')}
            </label>
            <div className="ac-form__row">
              <NumberField
                id="economy-shop-simInterference-price"
                label={t('admin.economyConfig.shop.price', 'Price')}
                value={form.shop.simInterference.price}
                onChange={(value) => updateShop('simInterference', { price: value })}
              />
              <NumberField
                id="economy-shop-simInterference-ratingBoost"
                label={t('admin.economyConfig.shop.ratingBoost', 'Rating boost')}
                value={form.shop.simInterference.ratingBoost}
                onChange={(value) => updateShop('simInterference', { ratingBoost: value })}
              />
            </div>
          </fieldset>

          <fieldset className="economy-config__group">
            <legend className="economy-config__legend">{t('admin.economyConfig.shop.items.gmInterference.name', SHOP_FALLBACKS.gmInterference.name)}</legend>
            <p className="ac-field__hint">{t('admin.economyConfig.shop.items.gmInterference.description', SHOP_FALLBACKS.gmInterference.description)}</p>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={form.shop.gmInterference.enabled}
                onChange={() => updateShop('gmInterference', { enabled: !form.shop.gmInterference.enabled })}
              />
              {t('admin.economyConfig.shop.enabled', 'In the shop')}
            </label>
            <div className="ac-form__row">
              <NumberField
                id="economy-shop-gmInterference-price"
                label={t('admin.economyConfig.shop.price', 'Price')}
                value={form.shop.gmInterference.price}
                onChange={(value) => updateShop('gmInterference', { price: value })}
              />
            </div>
          </fieldset>
        </Card>
      </fieldset>

      <Card className="ac-form">
        <div>
          <h2 className="ac-section__title">{t('admin.economyConfig.budget.title', 'Season budget check')}</h2>
          <p className="ac-section__text">
            {t('admin.economyConfig.budget.description', 'What a season contract pays with the terms above, to sanity-check shop prices and fines.')}
          </p>
        </div>
        <div className="ac-form__row">
          <NumberField
            id="economy-budget-weeks"
            label={t('admin.economyConfig.budget.weeks', 'Weeks')}
            value={budgetWeeks}
            onChange={setBudgetWeeks}
          />
          <NumberField
            id="economy-budget-matches"
            label={t('admin.economyConfig.budget.matches', 'Matches')}
            value={budgetMatches}
            onChange={setBudgetMatches}
          />
          <NumberField
            id="economy-budget-wins"
            label={t('admin.economyConfig.budget.wins', 'Wins')}
            value={budgetWins}
            onChange={setBudgetWins}
          />
        </div>
        {budget ? (
          <dl className="economy-config__budget" data-testid="economy-budget">
            <div>
              <dt>{t('admin.economyConfig.budget.salary', 'Salary')}</dt>
              <dd>{formatMoney(budget.salary)}</dd>
            </div>
            <div>
              <dt>{t('admin.economyConfig.budget.matchPay', 'Match pay')}</dt>
              <dd>{formatMoney(budget.matchPay)}</dd>
            </div>
            <div>
              <dt>{t('admin.economyConfig.budget.winBonuses', 'Win bonuses')}</dt>
              <dd>{formatMoney(budget.winBonuses)}</dd>
            </div>
            <div className="economy-config__budget-total">
              <dt>{t('admin.economyConfig.budget.total', 'Season total')}</dt>
              <dd>{formatMoney(budget.total)}</dd>
            </div>
          </dl>
        ) : (
          <p className="ac-field__hint">{t('admin.economyConfig.budget.incomplete', 'Fill in the season contract terms and the numbers above to see a total.')}</p>
        )}
      </Card>

      {canEdit && (
        <div className="ac-actions">
          <Button onClick={() => void handleSave()} loading={saving}>{t('admin.economyConfig.save', 'Save Economy Settings')}</Button>
          <Button variant="ghost" onClick={handleDiscard} disabled={saving}>{t('admin.economyConfig.discard', 'Discard changes')}</Button>
        </div>
      )}
    </div>
  );
}
