import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { injuryTunablesFixture } from '../../../test/injuryTunablesFixture';

const { mockInjuriesApi, mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockInjuriesApi: { getConfig: vi.fn(), updateConfig: vi.fn() },
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api/injuries.api', () => ({ injuriesApi: mockInjuriesApi }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));

import AdminInjuryConfig from '../AdminInjuryConfig';
import { ApiError } from '../../../services/api/apiClient';
import i18n from '../../../i18n';

const SAVED = injuryTunablesFixture({ version: 2, updatedAt: '2026-11-20T10:00:00.000Z', updatedBy: 'gm' });
const HISTORY = [
  { version: 2, updatedAt: '2026-11-20T10:00:00.000Z', updatedBy: 'gm' },
  { version: 1, updatedAt: '2026-11-18T09:00:00.000Z', updatedBy: 'owner' },
];

const SAVE = { name: 'Save Injury Settings' };

describe('AdminInjuryConfig', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockUseSiteConfig.mockReturnValue({ features: { injuries: true } });
    mockInjuriesApi.getConfig.mockResolvedValue({ settings: SAVED, history: HISTORY });
  });

  it('shows the saved settings, chances as percentages, and the version history', async () => {
    render(<AdminInjuryConfig />);

    expect(await screen.findByLabelText('Max stamina')).toHaveValue(100);
    expect(screen.getByLabelText('Standard', { selector: '#injury-drain-standard' })).toHaveValue(15);
    expect(screen.getAllByLabelText('Injury chance (%)').map((input) => (input as HTMLInputElement).valueAsNumber)).toEqual([1, 3, 8, 15]);
    expect(screen.getByLabelText('League time zone')).toHaveValue('America/New York');
    const history = screen.getByTestId('injury-history');
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(within(history).getByText(/Version 1: owner/)).toBeInTheDocument();
  });

  it('confirms the next version, then saves the whole form with the loaded version', async () => {
    const user = userEvent.setup();
    const next = injuryTunablesFixture({ version: 3, updatedAt: '2026-11-24T12:00:00.000Z', updatedBy: 'admin', maxStamina: 120 });
    mockInjuriesApi.updateConfig.mockResolvedValue({ settings: next });
    render(<AdminInjuryConfig />);

    const maxStamina = await screen.findByLabelText('Max stamina');
    await user.clear(maxStamina);
    await user.type(maxStamina, '120');
    const firstChance = screen.getAllByLabelText('Injury chance (%)')[0]!;
    await user.clear(firstChance);
    await user.type(firstChance, '2.5');
    await user.click(screen.getByRole('button', SAVE));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/New rolls will use version 3/)).toBeInTheDocument();
    expect(mockInjuriesApi.updateConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Save version 3' }));

    await waitFor(() => expect(mockInjuriesApi.updateConfig).toHaveBeenCalledTimes(1));
    const [settings, expectedVersion] = mockInjuriesApi.updateConfig.mock.calls[0];
    expect(expectedVersion).toBe(2);
    expect(settings.maxStamina).toBe(120);
    expect(settings.injuryChanceBands[0]).toEqual({ minStamina: 70, chance: 0.025 });
    expect(settings).not.toHaveProperty('version');
    expect(await screen.findByText('Saved as version 3.')).toBeInTheDocument();
    expect(within(screen.getByTestId('injury-history')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows inline errors and does not save an invalid form', async () => {
    const user = userEvent.setup();
    render(<AdminInjuryConfig />);

    const minWeeks = await screen.findByLabelText('Min weeks', { selector: '#injury-severity-moderate-minWeeks' });
    await user.clear(minWeeks);
    await user.type(minWeeks, '5');
    const lastBand = screen.getAllByLabelText('Min stamina')[3]!;
    await user.clear(lastBand);
    await user.type(lastBand, '10');
    await user.click(screen.getByRole('button', SAVE));

    expect(screen.getByText('Fix the highlighted settings before saving.')).toBeInTheDocument();
    expect(screen.getByText('Max weeks can\'t be less than min weeks.')).toBeInTheDocument();
    expect(screen.getByLabelText('Max weeks', { selector: '#injury-severity-moderate-maxWeeks' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/The last band must start at 0 stamina/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockInjuriesApi.updateConfig).not.toHaveBeenCalled();
  });

  it('previews a match from the settings on the page, saved or not', async () => {
    const user = userEvent.setup();
    render(<AdminInjuryConfig />);

    const preview = await screen.findByTestId('injury-preview');
    // Standard singles from 100: 15 drain, 85 after, 1% chance, 1.85 weeks if injured.
    expect(within(preview).getByText('15')).toBeInTheDocument();
    expect(within(preview).getByText('85')).toBeInTheDocument();
    expect(within(preview).getByText('1%')).toBeInTheDocument();
    expect(within(preview).getByText('1.85')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Sim category'), 'hardcore');
    await user.selectOptions(screen.getByLabelText('Format', { selector: 'select' }), 'tag');
    const stamina = screen.getByLabelText('Starting stamina');
    await user.clear(stamina);
    await user.type(stamina, '50');
    // 25 × 0.7 = 17.5 → 18; 50 → 32; 8% × 1.5 = 12%.
    expect(within(screen.getByTestId('injury-preview')).getByText('18')).toBeInTheDocument();
    expect(within(screen.getByTestId('injury-preview')).getByText('32')).toBeInTheDocument();
    expect(within(screen.getByTestId('injury-preview')).getByText('12%')).toBeInTheDocument();

    const hardcoreDrain = screen.getByLabelText('Hardcore', { selector: '#injury-drain-hardcore' });
    await user.clear(hardcoreDrain);
    await user.type(hardcoreDrain, '40');
    // 40 × 0.7 = 28; 50 → 22; still the 8% band.
    expect(within(screen.getByTestId('injury-preview')).getByText('28')).toBeInTheDocument();
  });

  it('counts standard singles matches from full to each band', async () => {
    render(<AdminInjuryConfig />);

    const exhaustion = await screen.findByTestId('injury-exhaustion');
    const rows = within(exhaustion).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual([
      'Below 70 stamina (3% band)3 matches',
      'Below 40 stamina (8% band)5 matches',
      'Below 20 stamina (15% band)6 matches',
      'Out of stamina7 matches',
    ]);
  });

  it('offers a reload when someone else saved first', async () => {
    const user = userEvent.setup();
    mockInjuriesApi.updateConfig.mockRejectedValue(new ApiError('Injury settings changed', 409));
    render(<AdminInjuryConfig />);

    await user.click(await screen.findByRole('button', SAVE));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save version 3' }));
    expect(await screen.findByText(/Someone else saved these settings/)).toBeInTheDocument();

    mockInjuriesApi.getConfig.mockResolvedValue({
      settings: injuryTunablesFixture({ version: 3, maxStamina: 150, updatedAt: '2026-11-24T12:00:00.000Z', updatedBy: 'other' }),
      history: HISTORY,
    });
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByLabelText('Max stamina')).toHaveValue(150);
  });

  it('is read-only for Moderators, but the preview still works', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    render(<AdminInjuryConfig />);

    expect(await screen.findByLabelText('Max stamina')).toBeDisabled();
    expect(screen.getByLabelText('League time zone')).toBeDisabled();
    expect(screen.getByLabelText('Back to full')).toBeDisabled();
    expect(screen.getByText('You can view these settings. Only Admins can change them.')).toBeInTheDocument();
    expect(screen.queryByRole('button', SAVE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add band' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove format 1' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Starting stamina')).toBeEnabled();
    expect(screen.getByLabelText('Sim category')).toBeEnabled();
  });

  it('says when the injuries feature is off', async () => {
    mockUseSiteConfig.mockReturnValue({ features: { injuries: false } });
    render(<AdminInjuryConfig />);

    expect(await screen.findByText(/Injuries are turned off/)).toBeInTheDocument();
  });

  it('shows a retry when the settings fail to load', async () => {
    const user = userEvent.setup();
    mockInjuriesApi.getConfig.mockRejectedValueOnce(new Error('boom'));
    render(<AdminInjuryConfig />);

    expect(await screen.findByText('Could not load the injury settings.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Max stamina')).toHaveValue(100);
  });
});
