import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CommentaryMatch, CommentaryParticipant, EventCommentary } from '../../../types/event';

const { mockGetCommentary } = vi.hoisted(() => ({ mockGetCommentary: vi.fn() }));

vi.mock('../../../services/api', () => ({
  eventsApi: { getCommentary: mockGetCommentary },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'events.commentary.matchOf') return `Match ${opts?.n} of ${opts?.total}`;
      if (key === 'events.commentary.playedBy') return `played by ${opts?.name}`;
      if (key === 'events.commentary.team') return `Team ${opts?.n}`;
      if (key === 'events.commentary.lastMetWinner') return `Last met ${opts?.date} (${opts?.winner} won)`;
      return key;
    },
  }),
}));

vi.mock('../CommentaryView.css', () => ({}));
vi.mock('../CommentaryWrestlerCard.css', () => ({}));
vi.mock('../HeadToHeadStrip.css', () => ({}));
vi.mock('../../profile/MoveList.css', () => ({}));

import CommentaryView from '../CommentaryView';
import { defaultMatchIndex } from '../../../utils/commentary';

function participant(id: string, extra: Partial<CommentaryParticipant> = {}): CommentaryParticipant {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    wrestlerName: `Wrestler ${id}`,
    signatures: [],
    finishers: [],
    seasonRecord: { wins: 1, losses: 0, draws: 0 },
    allTimeRecord: { wins: 2, losses: 1, draws: 0 },
    multiManRecord: { wins: 0, losses: 0, draws: 0 },
    ...extra,
  };
}

function pairs(ids: string[]) {
  const out: CommentaryMatch['headToHead'] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({ player1Id: ids[i], player2Id: ids[j], player1Wins: 0, player2Wins: 0, draws: 0 });
    }
  }
  return out;
}

function match(id: string, ids: string[], extra: Partial<CommentaryMatch> = {}): CommentaryMatch {
  return {
    matchId: id,
    position: 1,
    designation: 'opener',
    matchFormat: 'singles',
    isChampionship: false,
    status: 'scheduled',
    participants: ids.map((i) => participant(i)),
    headToHead: pairs(ids),
    ...extra,
  };
}

function renderView(data: EventCommentary) {
  mockGetCommentary.mockResolvedValue(data);
  return render(
    <MemoryRouter initialEntries={[`/events/${data.eventId}/commentary`]}>
      <Routes>
        <Route path="/events/:eventId/commentary" element={<CommentaryView />} />
      </Routes>
    </MemoryRouter>,
  );
}

const base: EventCommentary = { eventId: 'e1', name: 'Fallout', date: '2030-01-01T00:00:00Z', matches: [] };

beforeEach(() => vi.clearAllMocks());

describe('defaultMatchIndex', () => {
  it('picks the first match that is not completed or cancelled', () => {
    const list = [
      match('a', ['1', '2'], { status: 'completed' }),
      match('b', ['1', '2'], { status: 'cancelled' }),
      match('c', ['1', '2']),
      match('d', ['1', '2']),
    ];
    expect(defaultMatchIndex(list)).toBe(2);
  });

  it('falls back to the last match when everything is done', () => {
    const list = [match('a', ['1', '2'], { status: 'completed' }), match('b', ['1', '2'], { status: 'completed' })];
    expect(defaultMatchIndex(list)).toBe(1);
    expect(defaultMatchIndex([])).toBe(0);
  });
});

describe('CommentaryView', () => {
  it('opens on the next uncompleted match with the UP NEXT pill and navigates with Prev/Next', async () => {
    renderView({
      ...base,
      matches: [
        match('done', ['1', '2'], { status: 'completed' }),
        match('next', ['3', '4']),
        match('later', ['5', '6']),
      ],
    });

    expect(await screen.findByText('Match 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('events.commentary.upNext')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wrestler 3' })).toBeInTheDocument();

    const prev = screen.getByRole('button', { name: 'events.commentary.prevMatch' });
    const next = screen.getByRole('button', { name: 'events.commentary.nextMatch' });
    expect(prev).toBeEnabled();
    expect(next).toBeEnabled();

    await userEvent.click(next);
    expect(screen.getByText('Match 3 of 3')).toBeInTheDocument();
    expect(next).toBeDisabled();
    // Not the default match and not completed → LIVE pill instead of UP NEXT.
    expect(screen.getByText('events.commentary.live')).toBeInTheDocument();

    await userEvent.click(prev);
    await userEvent.click(prev);
    expect(screen.getByText('Match 1 of 3')).toBeInTheDocument();
    expect(prev).toBeDisabled();
    expect(screen.getByText('events.commentary.completed')).toBeInTheDocument();
  });

  it('arrow keys change the match', async () => {
    renderView({ ...base, matches: [match('a', ['1', '2']), match('b', ['3', '4'])] });
    await screen.findByText('Match 1 of 2');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Match 2 of 2')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Match 1 of 2')).toBeInTheDocument();
  });

  it('renders a two-wrestler head-to-head line with the last meeting', async () => {
    const m = match('a', ['1', '2']);
    m.headToHead = [
      { player1Id: '1', player2Id: '2', player1Wins: 3, player2Wins: 2, draws: 0, lastMatchDate: '2029-08-29T00:00:00Z', lastWinnerId: '1' },
    ];
    renderView({ ...base, matches: [m] });

    const strip = await screen.findByRole('region', { name: 'events.commentary.headToHead' });
    expect(within(strip).getByText('3 — 2')).toBeInTheDocument();
    expect(within(strip).getByText(/Last met .* \(Wrestler 1 won\)/)).toBeInTheDocument();
  });

  it('renders a 3×3 grid for a triple threat with the row-vs-column record', async () => {
    const m = match('tt', ['1', '2', '3'], { matchFormat: 'triple-threat' });
    m.headToHead = [
      { player1Id: '1', player2Id: '2', player1Wins: 2, player2Wins: 1, draws: 0 },
      { player1Id: '1', player2Id: '3', player1Wins: 0, player2Wins: 0, draws: 0 },
      { player1Id: '2', player2Id: '3', player1Wins: 0, player2Wins: 4, draws: 1 },
    ];
    renderView({ ...base, matches: [m] });

    expect(await screen.findByText('Triple Threat')).toBeInTheDocument();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3
    const row1 = within(rows[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(row1).toEqual(['—', '2–1', '0–0']);
    const row3 = within(rows[3]).getAllByRole('cell').map((c) => c.textContent);
    // Wrestler 3 vs Wrestler 2 is the mirror of (2 vs 3): 4–0 with 1 draw.
    expect(row3).toEqual(['0–0', '4–0–1', '—']);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('renders six compact cards and a 6×6 grid for a six-man', async () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    renderView({ ...base, matches: [match('six', ids, { matchFormat: '6-man' })] });

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(6);
    cards.forEach((c) => expect(c.className).toContain('commentary-card--compact'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getAllByRole('cell')).toHaveLength(36);
  });

  it('groups cards by team with a vs divider for a 3-on-3', async () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    renderView({
      ...base,
      matches: [match('tag', ids, { matchFormat: 'tag', teams: [['1', '2', '3'], ['4', '5', '6']] })],
    });

    await screen.findAllByRole('article');
    expect(screen.getByText('events.commentary.vs')).toBeInTheDocument();
    expect(screen.getAllByText('Team 1')).toHaveLength(3);
    expect(screen.getAllByText('Team 2')).toHaveLength(3);
    const cards = screen.getAllByRole('article');
    expect(cards.filter((c) => c.className.includes('commentary-card--team-0'))).toHaveLength(3);
    expect(cards.filter((c) => c.className.includes('commentary-card--team-1'))).toHaveLength(3);
  });

  it('shows the empty state when the card has no matches and the error state on failure', async () => {
    renderView({ ...base, matches: [] });
    expect(await screen.findByText('events.commentary.noMatches')).toBeInTheDocument();

    mockGetCommentary.mockRejectedValueOnce(new Error('boom'));
    render(
      <MemoryRouter initialEntries={['/events/e2/commentary']}>
        <Routes>
          <Route path="/events/:eventId/commentary" element={<CommentaryView />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
  });
});
