import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerBuildView } from '../../../services/api/builds.api';
import { ApiError } from '../../../services/api/apiClient';
import { buildRulesFixture } from '../../../test/buildRulesFixture';

const { mockGetRules, mockGetPlayerBuild, mockUpdateMyBuild } = vi.hoisted(() => ({
  mockGetRules: vi.fn(),
  mockGetPlayerBuild: vi.fn(),
  mockUpdateMyBuild: vi.fn(),
}));

vi.mock('../../../services/api/builds.api', () => ({
  buildsApi: { getRules: mockGetRules, getPlayerBuild: mockGetPlayerBuild, updateMyBuild: mockUpdateMyBuild },
}));

const stableT = (key: string, options?: Record<string, unknown>) => {
  if (!options) return key;
  const values = Object.entries(options)
    .filter(([name]) => name !== 'defaultValue')
    .map(([, value]) => String(value));
  return values.length > 0 ? `${key} ${values.join(' ')}` : key;
};
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import BuildEditor from '../BuildEditor';

const baseStats = { strikes: 40, grapple: 40, agility: 40, endurance: 40 };

function buildView(overrides: Partial<PlayerBuildView> = {}): PlayerBuildView {
  const status = { cost: 0, budget: 100, remaining: 100, overBudget: false };
  return {
    playerId: 'p1',
    isDefault: true,
    build: { style: 'allRounder', stats: { ...baseStats }, updatedAt: '' },
    moves: {
      signatures: [{ gameName: 'Spear', customName: '', level: 1 }],
      finishers: [{ gameName: 'Jackhammer', customName: 'The Hammer', level: 1 }],
    },
    budget: status,
    effective: {
      style: 'allRounder',
      stats: { ...baseStats },
      spentStats: { ...baseStats },
      signatureLevels: [1],
      finisherLevels: [1],
      scaled: false,
      status,
    },
    rulesVersion: 1,
    ...overrides,
  };
}

async function renderEditor(view: PlayerBuildView = buildView()) {
  mockGetRules.mockResolvedValue(buildRulesFixture());
  mockGetPlayerBuild.mockResolvedValue(view);
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(<BuildEditor playerId="p1" onSaved={onSaved} onCancel={onCancel} />);
  await screen.findByTestId('build-editor');
  return { onSaved, onCancel };
}

const statInput = (stat: string) => within(screen.getByTestId(`stat-row-${stat}`)).getByRole('spinbutton');
const setStatValue = (stat: string, value: number) => {
  fireEvent.change(statInput(stat), { target: { value: String(value) } });
  fireEvent.blur(statInput(stat));
};

describe('BuildEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows spent, budget and remaining and updates them as stats change', async () => {
    await renderEditor();
    expect(mockGetPlayerBuild).toHaveBeenCalledWith('p1', expect.any(AbortSignal));
    expect(screen.getByTestId('build-spent')).toHaveTextContent('0');
    expect(screen.getByTestId('build-budget-total')).toHaveTextContent('100');
    expect(screen.getByTestId('build-remaining')).toHaveTextContent('100');

    // 40 → 80: 35 points at 1 plus 5 points at 2.
    setStatValue('strikes', 80);
    expect(statInput('strikes')).toHaveValue(80);
    expect(screen.getByTestId('build-spent')).toHaveTextContent('45');
    expect(screen.getByTestId('build-remaining')).toHaveTextContent('55');
    expect(screen.getByTestId('stat-next-strikes')).toHaveTextContent('builds.editor.nextPoint 2');
  });

  it('counts move levels and blocks raising a level past the budget', async () => {
    const user = userEvent.setup();
    await renderEditor(buildView({ budget: { cost: 0, budget: 10, remaining: 10, overBudget: false } }));

    const raiseFinisher = screen.getByRole('button', { name: 'builds.editor.raiseLevel The Hammer' });
    await user.click(raiseFinisher);
    expect(screen.getByTestId('build-spent')).toHaveTextContent('8');
    expect(within(screen.getByTestId('move-finishers-0')).getByText('builds.moveLevel 2')).toBeInTheDocument();
    // 2 left: neither a finisher level (8) nor a signature level (5) fits.
    expect(raiseFinisher).toBeDisabled();
    expect(screen.getByRole('button', { name: 'builds.editor.raiseLevel Spear' })).toBeDisabled();
  });

  it('stops stat increases at what the budget covers', async () => {
    await renderEditor(buildView({ budget: { cost: 0, budget: 36, remaining: 36, overBudget: false } }));

    // 35 buys 41-75; the 76th point costs 2, which the last single point can't cover.
    setStatValue('grapple', 100);
    expect(statInput('grapple')).toHaveValue(75);
    expect(screen.getByTestId('build-remaining')).toHaveTextContent('1');

    // The slider is held to the budget the same way.
    fireEvent.change(screen.getByRole('slider', { name: 'builds.editor.statSlider builds.stats.agility' }), {
      target: { value: '60' },
    });
    expect(statInput('agility')).toHaveValue(41);

    // Lowering is always allowed.
    setStatValue('grapple', 50);
    expect(statInput('grapple')).toHaveValue(50);
  });

  it('shows each style bonus with what it is strong and weak against', async () => {
    await renderEditor();
    const powerhouse = screen.getByTestId('style-option-powerhouse');
    expect(powerhouse).toHaveTextContent('builds.editor.statBonus 8 builds.stats.grapple');
    expect(powerhouse).toHaveTextContent('builds.editor.strongAgainst builds.styles.highFlyer');
    expect(powerhouse).toHaveTextContent('builds.editor.weakAgainst builds.styles.striker');
    expect(screen.getByTestId('style-option-allRounder')).toHaveTextContent('builds.editor.noEdge');
  });

  it('only lets the chosen style pick its specialties, with a reason on the others', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(within(screen.getByTestId('style-option-powerhouse')).getByRole('radio'));

    const highRisk = screen.getByTestId('specialty-option-highRisk');
    expect(within(highRisk).getByRole('radio')).toBeDisabled();
    expect(highRisk).toHaveTextContent(
      'builds.editor.specialtyNotAllowed builds.styles.powerhouse simCategories.highRisk',
    );
    expect(highRisk).toHaveTextContent('simCategories.examples.highRisk');
    expect(within(screen.getByTestId('specialty-option-hardcore')).getByRole('radio')).toBeEnabled();
    expect(within(screen.getByTestId('specialty-option-cage')).getByRole('radio')).toBeEnabled();
  });

  it('clears a specialty the new style does not allow and says so', async () => {
    const user = userEvent.setup();
    await renderEditor(buildView({
      isDefault: false,
      build: { style: 'highFlyer', specialty: 'highRisk', stats: { ...baseStats }, updatedAt: 'x' },
    }));
    expect(within(screen.getByTestId('specialty-option-highRisk')).getByRole('radio')).toBeChecked();

    await user.click(within(screen.getByTestId('style-option-powerhouse')).getByRole('radio'));
    expect(screen.getByTestId('specialty-cleared')).toHaveTextContent(
      'builds.editor.specialtyCleared simCategories.highRisk builds.styles.powerhouse',
    );
    expect(within(screen.getByTestId('specialty-option-none')).getByRole('radio')).toBeChecked();

    // A specialty the new style also allows stays.
    await user.click(within(screen.getByTestId('specialty-option-cage')).getByRole('radio'));
    await user.click(within(screen.getByTestId('style-option-highFlyer')).getByRole('radio'));
    expect(screen.queryByTestId('specialty-cleared')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('specialty-option-cage')).getByRole('radio')).toBeChecked();
  });

  it('shows the over-budget banner after a relegation and blocks saving until it fits', async () => {
    const stats = { ...baseStats, strikes: 90 };
    const budget = { cost: 65, budget: 50, remaining: -15, overBudget: true };
    await renderEditor(buildView({
      isDefault: false,
      build: { style: 'striker', stats, updatedAt: 'x' },
      budget,
    }));

    expect(screen.getByTestId('build-over-budget')).toHaveTextContent('builds.editor.overBudget 15');
    expect(screen.getByTestId('build-budget')).toHaveClass('build-editor__budget--over');
    expect(screen.getByRole('button', { name: 'builds.editor.save' })).toBeDisabled();
    // No increase while over budget.
    setStatValue('agility', 41);
    expect(statInput('agility')).toHaveValue(40);

    setStatValue('strikes', 80);
    expect(screen.queryByTestId('build-over-budget')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'builds.editor.save' })).toBeEnabled();
  });

  it('saves through PUT /players/me/build with the stats, specialty and move levels', async () => {
    const user = userEvent.setup();
    const saved = buildView({ isDefault: false });
    mockUpdateMyBuild.mockResolvedValue(saved);
    const { onSaved } = await renderEditor();

    await user.click(within(screen.getByTestId('style-option-technician')).getByRole('radio'));
    await user.click(within(screen.getByTestId('specialty-option-technical')).getByRole('radio'));
    setStatValue('grapple', 60);
    await user.click(screen.getByRole('button', { name: 'builds.editor.raiseLevel Spear' }));
    await user.click(screen.getByRole('button', { name: 'builds.editor.save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(mockUpdateMyBuild).toHaveBeenCalledWith({
      style: 'technician',
      specialty: 'technical',
      stats: { ...baseStats, grapple: 60 },
      moveLevels: { signatures: [2], finishers: [1] },
    });
  });

  it('shows server validation errors inline', async () => {
    const user = userEvent.setup();
    mockUpdateMyBuild.mockRejectedValue(new ApiError('bad', 400, {
      body: {
        message: 'bad',
        errors: [
          { code: 'SPECIALTY_NOT_ALLOWED', field: 'specialty', message: 'nope' },
          { code: 'OVER_BUDGET', field: 'stats', message: 'too much', details: { cost: 120, budget: 100 } },
        ],
      },
    }));
    const { onSaved } = await renderEditor();

    await user.click(screen.getByRole('button', { name: 'builds.editor.save' }));
    expect(await screen.findByText('builds.editor.errors.SPECIALTY_NOT_ALLOWED')).toBeInTheDocument();
    expect(screen.getByText('builds.editor.errors.OVER_BUDGET 120 100')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('resets to the default build', async () => {
    const user = userEvent.setup();
    await renderEditor(buildView({
      isDefault: false,
      build: { style: 'brawler', specialty: 'hardcore', stats: { ...baseStats, strikes: 60 }, updatedAt: 'x' },
      moves: {
        signatures: [{ gameName: 'Spear', customName: '', level: 3 }],
        finishers: [{ gameName: 'Jackhammer', customName: '', level: 1 }],
      },
    }));
    expect(screen.getByTestId('build-spent')).toHaveTextContent('30');

    await user.click(screen.getByRole('button', { name: 'builds.editor.reset' }));
    expect(screen.getByTestId('build-spent')).toHaveTextContent('0');
    expect(within(screen.getByTestId('style-option-allRounder')).getByRole('radio')).toBeChecked();
    expect(within(screen.getByTestId('specialty-option-none')).getByRole('radio')).toBeChecked();
    expect(statInput('strikes')).toHaveValue(40);
  });
});
