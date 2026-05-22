import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { rivalriesApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import type { Player } from '../../../types';
import type {
  HydratedRivalry,
  RivalryNote,
  RivalryNoteType,
  RivalryNoteVisibility,
} from '../../../types/rivalry';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

interface Drafts {
  storyline: NoteDraft;
  plan: NoteDraft;
}

interface NoteDraft {
  content: string;
  visibility: RivalryNoteVisibility;
  scheduledFor: string;
  linkedMatchId: string;
  linkedEventId: string;
}

const EMPTY_DRAFT: NoteDraft = {
  content: '',
  visibility: 'admins',
  scheduledFor: '',
  linkedMatchId: '',
  linkedEventId: '',
};

/**
 * Notes & Plans tab (RIV-11). Defense-in-depth: even though the
 * server's listNotes handler already strips notes the caller
 * shouldn't see, we re-apply the same role filter client-side and
 * log a warning if anything slips through.
 */
export default function NotesPlansTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const { isAdminOrModerator, playerId } = useAuth();
  const isGm = isAdminOrModerator;
  const rivalryId = hydrated.rivalry.rivalryId;
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  const [notes, setNotes] = useState<RivalryNote[]>(hydrated.notes);
  const [drafts, setDrafts] = useState<Drafts>({
    storyline: { ...EMPTY_DRAFT, visibility: isGm ? 'participants' : 'admins' },
    plan: { ...EMPTY_DRAFT, visibility: 'admins' },
  });
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

  // Refetch from listNotes on mount — the hydrated payload caps notes
  // for the overview view; this tab wants the full list.
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    rivalriesApi.notes
      .list(rivalryId, {}, controller.signal)
      .then((res) => mounted && setNotes(res.notes))
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [rivalryId]);

  const visible = useMemo(() => filterClientSide(notes, { isGm, playerId }), [notes, isGm, playerId]);

  const storylineNotes = visible.filter((n) => n.noteType === 'storyline');
  const planNotes = visible.filter((n) => n.noteType === 'plan');

  async function submit(noteType: RivalryNoteType) {
    const draft = drafts[noteType];
    if (!draft.content.trim()) return;
    setSubmitting(true);
    try {
      const res = await rivalriesApi.notes.upsert(rivalryId, {
        noteType,
        content: draft.content.trim(),
        visibility: draft.visibility,
        scheduledFor: draft.scheduledFor || undefined,
        linkedMatchId: draft.linkedMatchId || undefined,
        linkedEventId: draft.linkedEventId || undefined,
      });
      setNotes((prev) => [...prev, res.note]);
      setDrafts((prev) => ({
        ...prev,
        [noteType]: { ...EMPTY_DRAFT, visibility: noteType === 'plan' ? 'admins' : (isGm ? 'participants' : 'admins') },
      }));
    } finally {
      setSubmitting(false);
    }
  }

  function canEdit(note: RivalryNote): boolean {
    if (isGm) return true;
    // A wrestler may edit their own admins-only suggestion.
    return note.authorPlayerId === playerId && note.visibility === 'admins';
  }

  async function saveEdit(note: RivalryNote) {
    if (!editDraft.trim()) return;
    const res = await rivalriesApi.notes.upsert(rivalryId, {
      noteId: note.noteId,
      noteType: note.noteType,
      content: editDraft.trim(),
      visibility: note.visibility,
    });
    setNotes((prev) => prev.map((n) => (n.noteId === note.noteId ? res.note : n)));
    setEditingId(null);
  }

  return (
    <div className="rivalry-tab rivalry-tab__grid">
      <div className="rivalry-tab">
        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.notes.heading')}</h3>

          <DraftForm
            kind="storyline"
            draft={drafts.storyline}
            onChange={(d) => setDrafts({ ...drafts, storyline: d })}
            onSubmit={() => submit('storyline')}
            submitting={submitting}
            isGm={isGm}
          />
          {!isGm && (
            <p className="rivalry-detail__hint">
              {t('rivalries.notes.suggestionHint', {
                defaultValue: 'GMs will be notified of your suggestion.',
              })}
            </p>
          )}

          {storylineNotes.length === 0 ? (
            <p className="rivalry-tab__empty">{t('rivalries.notes.empty')}</p>
          ) : (
            <ul className="rivalry-detail-notes">
              {storylineNotes.map((n) => (
                <NoteRow
                  key={n.noteId}
                  note={n}
                  authorName={lookup.get(n.authorPlayerId)?.currentWrestler ?? n.authorPlayerId}
                  isEditing={editingId === n.noteId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  onEdit={() => {
                    setEditingId(n.noteId);
                    setEditDraft(n.body);
                  }}
                  onSave={() => saveEdit(n)}
                  onCancel={() => setEditingId(null)}
                  canEdit={canEdit(n)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="rivalry-tab">
        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.notes.noteTypePlan')}</h3>

          {isGm && (
            <DraftForm
              kind="plan"
              draft={drafts.plan}
              onChange={(d) => setDrafts({ ...drafts, plan: d })}
              onSubmit={() => submit('plan')}
              submitting={submitting}
              isGm={isGm}
            />
          )}

          {planNotes.length === 0 ? (
            <p className="rivalry-tab__empty">{t('rivalries.notes.empty')}</p>
          ) : (
            <ol className="rivalry-detail-plans">
              {planNotes.map((n) => (
                <PlanRow
                  key={n.noteId}
                  note={n}
                  authorName={lookup.get(n.authorPlayerId)?.currentWrestler ?? n.authorPlayerId}
                  isEditing={editingId === n.noteId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  onEdit={() => {
                    setEditingId(n.noteId);
                    setEditDraft(n.body);
                  }}
                  onSave={() => saveEdit(n)}
                  onCancel={() => setEditingId(null)}
                  canEdit={canEdit(n)}
                />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

interface DraftFormProps {
  kind: RivalryNoteType;
  draft: NoteDraft;
  onChange: (d: NoteDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
  isGm: boolean;
}

function DraftForm({ kind, draft, onChange, onSubmit, submitting, isGm }: DraftFormProps) {
  const { t } = useTranslation();
  return (
    <form
      className="rivalry-detail-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        rows={3}
        value={draft.content}
        placeholder={t('rivalries.notes.newNote')}
        onChange={(e) => onChange({ ...draft, content: e.target.value })}
      />
      {isGm && (
        <div className="rivalry-detail-form__row">
          <label>
            <span>{t('rivalries.notes.visibilityAll')}</span>
            <select
              value={draft.visibility}
              onChange={(e) => onChange({ ...draft, visibility: e.target.value as RivalryNoteVisibility })}
            >
              <option value="admins">{t('rivalries.notes.visibilityAdmins')}</option>
              <option value="participants">{t('rivalries.notes.visibilityParticipants')}</option>
              <option value="all">{t('rivalries.notes.visibilityAll')}</option>
            </select>
          </label>
        </div>
      )}
      {kind === 'plan' && isGm && (
        <div className="rivalry-detail-form__row">
          <input
            type="date"
            value={draft.scheduledFor}
            onChange={(e) => onChange({ ...draft, scheduledFor: e.target.value })}
          />
          <input
            type="text"
            placeholder="linkedMatchId"
            value={draft.linkedMatchId}
            onChange={(e) => onChange({ ...draft, linkedMatchId: e.target.value })}
          />
          <input
            type="text"
            placeholder="linkedEventId"
            value={draft.linkedEventId}
            onChange={(e) => onChange({ ...draft, linkedEventId: e.target.value })}
          />
        </div>
      )}
      <button type="submit" disabled={submitting || !draft.content.trim()}>
        {t('rivalries.notes.save')}
      </button>
    </form>
  );
}

interface NoteRowProps {
  note: RivalryNote;
  authorName: string;
  isEditing: boolean;
  editDraft: string;
  setEditDraft: (s: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  canEdit: boolean;
}

function NoteRow({
  note,
  authorName,
  isEditing,
  editDraft,
  setEditDraft,
  onEdit,
  onSave,
  onCancel,
  canEdit,
}: NoteRowProps) {
  const { t } = useTranslation();
  return (
    <li>
      <header className="rivalry-detail-notes__meta">
        <strong>{authorName}</strong>
        <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
        {note.visibility === 'admins' && (
          <span className="rivalry-detail-notes__badge">{t('rivalries.notes.visibilityAdmins')}</span>
        )}
      </header>
      {isEditing ? (
        <>
          <textarea
            value={editDraft}
            rows={3}
            onChange={(e) => setEditDraft(e.target.value)}
          />
          <button type="button" onClick={onSave}>
            {t('rivalries.notes.save')}
          </button>
          <button type="button" onClick={onCancel}>
            {t('rivalries.request.cancel')}
          </button>
        </>
      ) : (
        <>
          <p>{note.body}</p>
          {canEdit && (
            <button type="button" className="rivalry-detail-link" onClick={onEdit}>
              {t('rivalries.notes.edit')}
            </button>
          )}
        </>
      )}
    </li>
  );
}

function PlanRow(props: NoteRowProps) {
  const { note } = props;
  return (
    <li>
      {note.scheduledFor && (
        <span className="rivalry-detail-plans__when">
          {new Date(note.scheduledFor).toLocaleDateString()}
        </span>
      )}
      <NoteRow {...props} />
      <PlanLinks linkedMatchId={note.linkedMatchId} linkedEventId={note.linkedEventId} />
    </li>
  );
}

function PlanLinks({ linkedMatchId, linkedEventId }: { linkedMatchId?: string; linkedEventId?: string }) {
  if (!linkedMatchId && !linkedEventId) return null;
  return (
    <div className="rivalry-detail-plans__links">
      {linkedMatchId && (
        <Link to={`/matches/${linkedMatchId}`} className="rivalry-detail-link">
          match
        </Link>
      )}
      {linkedEventId && (
        <Link to={`/events/${linkedEventId}`} className="rivalry-detail-link">
          event
        </Link>
      )}
    </div>
  );
}

function filterClientSide(
  all: RivalryNote[],
  args: { isGm: boolean; playerId: string | null },
): RivalryNote[] {
  return all.filter((n) => {
    if (args.isGm) return true;
    if (args.playerId && n.authorPlayerId === args.playerId) return true;
    if (n.visibility === 'admins') return false;
    if (n.noteType === 'plan' && n.visibility !== 'participants' && n.visibility !== 'all') return false;
    return true;
  });
}
