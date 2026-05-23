import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rivalriesApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import type { Player } from '../../../types';
import type {
  HydratedRivalry,
  RivalryNote,
  RivalryNoteType,
} from '../../../types/rivalry';
import { resolvePlayerFullLabel } from '../rivalryUtils';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

interface NoteDraft {
  content: string;
  scheduledFor: string;
}

const EMPTY_DRAFT: NoteDraft = { content: '', scheduledFor: '' };

/**
 * Notes & Plans tab. Visibility is fixed to 'participants' for every
 * note created via this UI — there's no audience picker because
 * notes & plans are scoped to the rivalry's participants and GMs only.
 * Server-side `upsertNote` enforces this for wrestler authors too.
 *
 * Defense-in-depth: we still re-apply the role filter client-side so
 * legacy 'admins' notes from the seed data don't leak to wrestlers
 * even on a stale fetch.
 */
export default function NotesPlansTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const { isAdminOrModerator, playerId } = useAuth();
  const isGm = isAdminOrModerator;
  const rivalryId = hydrated.rivalry.rivalryId;
  const lookup = useMemo(() => new Map(players.map((p) => [p.playerId, p] as const)), [players]);

  const [notes, setNotes] = useState<RivalryNote[]>(hydrated.notes);
  const [storylineDraft, setStorylineDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [planDraft, setPlanDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

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

  const visible = useMemo(
    () => filterClientSide(notes, { isGm, playerId }),
    [notes, isGm, playerId],
  );

  const storylineNotes = visible.filter((n) => n.noteType === 'storyline');
  const planNotes = visible.filter((n) => n.noteType === 'plan');

  async function submit(noteType: RivalryNoteType) {
    const draft = noteType === 'plan' ? planDraft : storylineDraft;
    if (!draft.content.trim()) return;
    setSubmitting(true);
    try {
      const res = await rivalriesApi.notes.upsert(rivalryId, {
        noteType,
        content: draft.content.trim(),
        visibility: 'participants',
        scheduledFor: draft.scheduledFor || undefined,
      });
      setNotes((prev) => [...prev, res.note]);
      if (noteType === 'plan') setPlanDraft(EMPTY_DRAFT);
      else setStorylineDraft(EMPTY_DRAFT);
    } finally {
      setSubmitting(false);
    }
  }

  function canEdit(note: RivalryNote): boolean {
    if (isGm) return true;
    return note.authorPlayerId === playerId;
  }

  async function saveEdit(note: RivalryNote) {
    if (!editDraft.trim()) return;
    const res = await rivalriesApi.notes.upsert(rivalryId, {
      noteId: note.noteId,
      noteType: note.noteType,
      content: editDraft.trim(),
      visibility: 'participants',
    });
    setNotes((prev) => prev.map((n) => (n.noteId === note.noteId ? res.note : n)));
    setEditingId(null);
  }

  async function deleteNote(note: RivalryNote) {
    await rivalriesApi.notes.delete(rivalryId, note.noteId);
    setNotes((prev) => prev.filter((n) => n.noteId !== note.noteId));
  }

  return (
    <div className="rivalry-tab rivalry-tab__grid">
      <div className="rivalry-tab">
        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.notes.heading')}</h3>

          <DraftForm
            kind="storyline"
            draft={storylineDraft}
            onChange={setStorylineDraft}
            onSubmit={() => submit('storyline')}
            submitting={submitting}
            isGm={isGm}
          />
          {!isGm && (
            <p className="rivalry-detail__hint">
              {t('rivalries.notes.suggestionHint', {
                defaultValue: 'Notes are visible to your opponent and the GMs.',
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
                  authorName={resolvePlayerFullLabel(lookup.get(n.authorPlayerId), n.authorPlayerId)}
                  isEditing={editingId === n.noteId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  onEdit={() => {
                    setEditingId(n.noteId);
                    setEditDraft(n.body);
                  }}
                  onSave={() => saveEdit(n)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => deleteNote(n)}
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
              draft={planDraft}
              onChange={setPlanDraft}
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
                <li key={n.noteId}>
                  {n.scheduledFor && (
                    <span className="rivalry-detail-plans__when">
                      {new Date(n.scheduledFor).toLocaleDateString()}
                    </span>
                  )}
                  <NoteRow
                    note={n}
                    authorName={resolvePlayerFullLabel(lookup.get(n.authorPlayerId), n.authorPlayerId)}
                    isEditing={editingId === n.noteId}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onEdit={() => {
                      setEditingId(n.noteId);
                      setEditDraft(n.body);
                    }}
                    onSave={() => saveEdit(n)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteNote(n)}
                    canEdit={canEdit(n)}
                  />
                </li>
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
      {kind === 'plan' && isGm && (
        <div className="rivalry-detail-form__row">
          <input
            type="date"
            value={draft.scheduledFor}
            onChange={(e) => onChange({ ...draft, scheduledFor: e.target.value })}
            aria-label={t('rivalries.notes.scheduledFor')}
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
  onDelete: () => void;
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
  onDelete,
  canEdit,
}: NoteRowProps) {
  const { t } = useTranslation();
  return (
    <div className="rivalry-detail-notes__row">
      <header className="rivalry-detail-notes__meta">
        <strong>{authorName}</strong>
        <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
        {canEdit && !isEditing && (
          <span className="rivalry-detail-notes__actions">
            <button
              type="button"
              className="rivalry-detail-notes__icon"
              onClick={onEdit}
              aria-label={t('rivalries.notes.edit')}
              title={t('rivalries.notes.edit')}
            >
              ✎
            </button>
            <button
              type="button"
              className="rivalry-detail-notes__icon rivalry-detail-notes__icon--danger"
              onClick={onDelete}
              aria-label={t('rivalries.notes.delete')}
              title={t('rivalries.notes.delete')}
            >
              ✕
            </button>
          </span>
        )}
      </header>
      {isEditing ? (
        <>
          <textarea
            value={editDraft}
            rows={3}
            onChange={(e) => setEditDraft(e.target.value)}
          />
          <div className="rivalry-detail-notes__edit-actions">
            <button type="button" onClick={onSave}>
              {t('rivalries.notes.save')}
            </button>
            <button type="button" onClick={onCancel}>
              {t('rivalries.request.cancel')}
            </button>
          </div>
        </>
      ) : (
        <p>{note.body}</p>
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
    // Anything explicitly admins-only stays hidden from non-GM non-authors.
    if (n.visibility === 'admins') return false;
    return true;
  });
}
