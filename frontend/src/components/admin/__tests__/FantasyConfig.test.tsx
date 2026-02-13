import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockFantasyApi } = vi.hoisted(() => ({
  mockFantasyApi: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  fantasyApi: mockFantasyApi,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import FantasyConfig from '../FantasyConfig';
import type { FantasyConfig as FantasyConfigType } from '../../../types/fantasy';

// --- Test data ---
const defaultConfig: FantasyConfigType = {
  configKey: 'GLOBAL',
  defaultBudget: 500,
  defaultPicksPerDivision: 2,
  baseWinPoints: 10,
  championshipBonus: 5,
  titleWinBonus: 15,
  titleDefenseBonus: 10,
  costFluctuationEnabled: false,
  costChangePerWin: 10,
  costChangePerLoss: 5,
  costResetStrategy: 'reset',
  underdogMultiplier: 1.5,
  perfectPickBonus: 25,
  streakBonusThreshold: 3,
  streakBonusPoints: 5,
};

function renderComponent() {
  return render(<FantasyConfig />);
}

describe('FantasyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFantasyApi.getConfig.mockResolvedValue(defaultConfig);
  });

  it('renders all 14 config fields after loading', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.config.title')).toBeInTheDocument();
    });

    // Verify all 11 always-visible fields are rendered by their HTML id attribute
    const alwaysVisibleFieldIds = [
      'defaultBudget',
      'defaultPicksPerDivision',
      'baseWinPoints',
      'championshipBonus',
      'titleWinBonus',
      'titleDefenseBonus',
      'perfectPickBonus',
      'underdogMultiplier',
      'streakBonusThreshold',
      'streakBonusPoints',
      'costFluctuationEnabled',
    ];

    for (const fieldId of alwaysVisibleFieldIds) {
      expect(document.getElementById(fieldId)).toBeTruthy();
    }

    // Verify actual input count — 10 number inputs + 1 checkbox = 11 when fluctuation disabled
    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs.length).toBe(10);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    // Cost fluctuation sub-fields are hidden when disabled (3 more fields: 14 total)
    expect(document.getElementById('costChangePerWin')).toBeNull();
    expect(document.getElementById('costChangePerLoss')).toBeNull();
    expect(document.getElementById('costResetStrategy')).toBeNull();
  });

  it('tracks unsaved changes and enables save/reset buttons', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.config.title')).toBeInTheDocument();
    });

    // Save and Reset buttons should be disabled initially
    const saveBtn = screen.getByText('common.save');
    const resetBtn = screen.getByText('fantasy.admin.config.reset');
    expect(saveBtn).toBeDisabled();
    expect(resetBtn).toBeDisabled();

    // Change a field value
    const budgetInput = screen.getByLabelText('fantasy.admin.config.defaultBudget');
    await user.clear(budgetInput);
    await user.type(budgetInput, '600');

    // Now buttons should be enabled
    expect(saveBtn).not.toBeDisabled();
    expect(resetBtn).not.toBeDisabled();
  });

  it('saves config via API and shows success message', async () => {
    const user = userEvent.setup();
    const updatedConfig = { ...defaultConfig, defaultBudget: 600 };
    mockFantasyApi.updateConfig.mockResolvedValue(updatedConfig);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.config.title')).toBeInTheDocument();
    });

    const budgetInput = screen.getByLabelText('fantasy.admin.config.defaultBudget');
    await user.clear(budgetInput);
    await user.type(budgetInput, '600');

    const saveBtn = screen.getByText('common.save');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockFantasyApi.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ defaultBudget: 600 })
      );
    });

    await waitFor(() => {
      const successAlert = screen.getByRole('alert');
      expect(successAlert.textContent).toBe('fantasy.admin.config.saveSuccess');
    });

    // After save, buttons should be disabled again (no unsaved changes)
    expect(saveBtn).toBeDisabled();
  });

  it('resets config to original values on reset', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.config.title')).toBeInTheDocument();
    });

    const budgetInput = screen.getByLabelText('fantasy.admin.config.defaultBudget');
    expect(budgetInput).toHaveValue(500);

    // Change value
    await user.clear(budgetInput);
    await user.type(budgetInput, '999');
    expect(budgetInput).toHaveValue(999);

    // Reset
    const resetBtn = screen.getByText('fantasy.admin.config.reset');
    await user.click(resetBtn);

    // Value restored
    expect(budgetInput).toHaveValue(500);
    // Buttons disabled again
    expect(resetBtn).toBeDisabled();
  });

  it('toggles cost fluctuation fields conditionally', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('fantasy.admin.config.title')).toBeInTheDocument();
    });

    // Cost fluctuation sub-fields hidden by default
    expect(screen.queryByLabelText('fantasy.admin.config.costChangePerWin')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('fantasy.admin.config.costChangePerLoss')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('fantasy.admin.config.costResetStrategy')).not.toBeInTheDocument();

    // Enable cost fluctuation
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    // Sub-fields should now appear
    await waitFor(() => {
      expect(screen.getByLabelText('fantasy.admin.config.costChangePerWin')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('fantasy.admin.config.costChangePerLoss')).toBeInTheDocument();
    expect(screen.getByLabelText('fantasy.admin.config.costResetStrategy')).toBeInTheDocument();

    // Total inputs now: 10 original + 2 cost change fields = 12 number inputs + 1 select
    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs.length).toBe(12);
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    // Disable again — sub-fields should hide
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.queryByLabelText('fantasy.admin.config.costChangePerWin')).not.toBeInTheDocument();
    });
  });
});
