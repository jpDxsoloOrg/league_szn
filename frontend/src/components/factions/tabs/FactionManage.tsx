import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { factionsApi, playersApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../../constants/imageFallbacks';
import type { Player } from '../../../types';
import type { StableInvitationWithDetails } from '../../../types/stable';
import type { FactionDetailContext } from '../FactionDetail';
import FactionImageUploader from '../FactionImageUploader';
import RemoveMemberModal from '../RemoveMemberModal';
import './FactionManage.css';

const AUDIT_LIMIT = 10;

interface AuditEntry {
  id: string;
  timestamp: string;
  summary: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function loadAuditFromChannel(factionId: string): Promise<AuditEntry[]> {
  // The dedicated GET /factions/{id}/audit endpoint isn't shipped yet —
  // derive the audit feed from the channel's system messages instead.
  // System messages are emitted by backend handlers for joins/removals/etc.
  const page = await factionsApi.messages.list(factionId, { limit: 50 });
  return page.items
    .filter((m) => m.messageType === 'system')
    .slice(0, AUDIT_LIMIT)
    .map((m) => ({
      id: m.messageId,
      timestamp: m.createdAt,
      summary: m.body,
    }));
}

// ─── Component ──────────────────────────────────────────────────────

export default function FactionManage() {
  const { t } = useTranslation();
  const { faction } = useOutletContext<FactionDetailContext>();
  const auth = useAuth();
  const navigate = useNavigate();

  const isLeader = auth.playerId !== null && auth.playerId === faction.leaderId;
  const isAdmin = Boolean(auth.isAdminOrModerator);
  const canAccess = isLeader || isAdmin;

  // ─── State ────────────────────────────────────────────────────────
  const [name, setName] = useState(faction.name);
  const [imageUrl, setImageUrl] = useState<string | undefined>(faction.imageUrl);
  const [imageUrlInput, setImageUrlInput] = useState(faction.imageUrl ?? '');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityToast, setIdentityToast] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<StableInvitationWithDetails[]>([]);
  const [eligiblePlayers, setEligiblePlayers] = useState<Player[]>([]);
  const [invitePlayerId, setInvitePlayerId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [rosterReloadKey, setRosterReloadKey] = useState(0);

  const [memberToRemove, setMemberToRemove] = useState<{
    playerId: string;
    playerName: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [showDisbandConfirm, setShowDisbandConfirm] = useState(false);
  const [disbanding, setDisbanding] = useState(false);
  const [disbandError, setDisbandError] = useState<string | null>(null);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  // ─── Roster + audit load (and reload on action) ──────────────────
  // Effects run unconditionally to satisfy Rules of Hooks; the gate
  // below short-circuits the render when the caller lacks access.
  useEffect(() => {
    if (!canAccess) return;
    const ac = new AbortController();

    Promise.all([
      factionsApi.getInvitations(faction.stableId, ac.signal).catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Manage tab: getInvitations failed');
        }
        return [] as StableInvitationWithDetails[];
      }),
      playersApi.getAll(ac.signal).catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Manage tab: playersApi.getAll failed');
        }
        return [] as Player[];
      }),
      loadAuditFromChannel(faction.stableId).catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn('Manage tab: audit derivation failed');
        }
        return [] as AuditEntry[];
      }),
    ]).then(([inv, allPlayers, audit]) => {
      if (ac.signal.aborted) return;
      // Pending only — backend filters happen-on-respond but we belt-and-
      // braces filter to "pending" here too.
      setInvitations(inv.filter((i) => i.status === 'pending'));
      // Eligible: not already in the faction, not already invited, not
      // already in another stable.
      const memberSet = new Set(faction.memberIds);
      const invitedSet = new Set(inv.map((i) => i.invitedPlayerId));
      setEligiblePlayers(
        allPlayers.filter(
          (p) => !memberSet.has(p.playerId) && !invitedSet.has(p.playerId) && !p.stableId,
        ),
      );
      setAuditEntries(audit);
    });

    return () => ac.abort();
  }, [faction.stableId, faction.memberIds, rosterReloadKey, canAccess]);

  const reloadRoster = useCallback(() => setRosterReloadKey((k) => k + 1), []);

  // ─── Gating (after hooks per Rules of Hooks) ─────────────────────
  if (!canAccess) {
    return (
      <Navigate
        to={`/factions/${faction.stableId}`}
        replace
        state={{
          toast: t(
            'factions.manage.notAllowed',
            'Only the leader and admins can access Manage.',
          ),
        }}
      />
    );
  }

  // ─── Identity save ────────────────────────────────────────────────
  const trimmedName = name.trim();
  const identityDirty =
    trimmedName !== faction.name.trim() || (imageUrl ?? '') !== (faction.imageUrl ?? '');
  const identityValid = trimmedName.length > 0;

  const handleSaveIdentity = async () => {
    if (!identityDirty || !identityValid) return;
    setIdentitySaving(true);
    setIdentityError(null);
    setIdentityToast(null);
    try {
      await factionsApi.update(faction.stableId, {
        name: trimmedName,
        imageUrl: imageUrl?.trim() || undefined,
      });
      setIdentityToast(t('factions.manage.savedToast', 'Faction identity saved.'));
      setTimeout(() => setIdentityToast(null), 3000);
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : t('common.error', 'Failed'));
    } finally {
      setIdentitySaving(false);
    }
  };

  const handleUrlInputBlur = () => {
    const trimmed = imageUrlInput.trim();
    setImageUrl(trimmed.length > 0 ? trimmed : undefined);
  };

  // ─── Remove member ────────────────────────────────────────────────
  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = (await factionsApi.removeMember(
        faction.stableId,
        memberToRemove.playerId,
      )) as unknown as { status?: string };

      const wasDisbanded = result?.status === 'disbanded';
      setMemberToRemove(null);

      if (wasDisbanded) {
        navigate('/factions', {
          state: {
            toast: t(
              'factions.my.removeMemberDisbanded',
              'Faction disbanded — only the leader remained.',
            ),
          },
        });
        return;
      }
      reloadRoster();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : t('common.error', 'Failed'));
    } finally {
      setRemoving(false);
    }
  };

  const willDisband =
    memberToRemove !== null && (faction.memberIds?.length ?? faction.members.length) <= 2;

  // ─── Invite ───────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!invitePlayerId || inviteSubmitting) return;
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      await factionsApi.invite(faction.stableId, {
        playerId: invitePlayerId,
        message: inviteMessage.trim() || undefined,
      });
      setInvitePlayerId('');
      setInviteMessage('');
      reloadRoster();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('common.error', 'Failed'));
    } finally {
      setInviteSubmitting(false);
    }
  };

  // ─── Disband ─────────────────────────────────────────────────────
  const handleConfirmDisband = async () => {
    if (disbanding) return;
    setDisbanding(true);
    setDisbandError(null);
    try {
      await factionsApi.disband(faction.stableId);
      navigate('/factions', {
        state: {
          toast: t('factions.manage.disbandedToast', '{{factionName}} has been disbanded.', {
            factionName: faction.name,
          }),
        },
      });
    } catch (err) {
      setDisbandError(err instanceof Error ? err.message : t('common.error', 'Failed'));
      setDisbanding(false);
    }
  };

  return (
    <div className="faction-manage">
      <div className="faction-manage__banner" role="status">
        {t(
          'factions.manage.leaderBanner',
          'LEADER VIEW · Only you and admins can see this tab.',
        )}
      </div>

      <div className="faction-manage__columns">
        {/* ─── Identity ─── */}
        <section className="faction-manage__card" aria-labelledby="manage-identity">
          <h2 id="manage-identity" className="faction-manage__card-title">
            {t('factions.manage.identityTitle', 'Faction Identity')}
          </h2>

          <FactionImageUploader
            stableId={faction.stableId}
            currentImageUrl={imageUrl}
            factionName={faction.name}
            onUploaded={(newUrl) => {
              setImageUrl(newUrl);
              setImageUrlInput(newUrl);
            }}
          />

          <label className="faction-manage__field">
            <span className="faction-manage__field-label">
              {t('factions.manage.imageUrlLabel', 'Or paste an image URL')}
            </span>
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              onBlur={handleUrlInputBlur}
              placeholder="https://…"
            />
          </label>

          <label className="faction-manage__field">
            <span className="faction-manage__field-label">
              {t('factions.manage.nameLabel', 'Faction Name')}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </label>

          {/* tagline + visibility are documented as future-facing in the
           * ticket; backend doesn't carry these fields yet. Hidden in v1
           * to keep the UI honest. */}

          {identityToast && (
            <p className="faction-manage__toast" role="status">
              {identityToast}
            </p>
          )}
          {identityError && (
            <p className="faction-manage__error" role="alert">
              {identityError}
            </p>
          )}

          <button
            type="button"
            className="faction-manage__save"
            onClick={handleSaveIdentity}
            disabled={!identityDirty || !identityValid || identitySaving}
          >
            {identitySaving
              ? t('common.saving', 'Saving…')
              : t('factions.manage.saveIdentity', 'Save')}
          </button>
        </section>

        {/* ─── Roster ─── */}
        <section className="faction-manage__card" aria-labelledby="manage-roster">
          <h2 id="manage-roster" className="faction-manage__card-title">
            {t('factions.manage.rosterTitle', 'Roster Management')}
          </h2>

          <h3 className="faction-manage__subheading">
            {t('factions.manage.activeMembers', 'Active members ({{count}})', {
              count: faction.members.length,
            })}
          </h3>
          <ul className="faction-manage__list">
            {faction.members.map((member) => {
              const isLeaderRow = member.playerId === faction.leaderId;
              return (
                <li key={member.playerId} className="faction-manage__list-row">
                  <img
                    src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(e) => applyImageFallback(e, DEFAULT_WRESTLER_IMAGE)}
                    alt=""
                    className="faction-manage__avatar"
                  />
                  <span className="faction-manage__row-name">
                    {member.wrestlerName}
                  </span>
                  <span
                    className={`faction-manage__role-pill ${
                      isLeaderRow ? 'faction-manage__role-pill--leader' : ''
                    }`}
                  >
                    {isLeaderRow
                      ? t('factions.members.roleLeader', 'LEADER')
                      : t('factions.members.roleMember', 'MEMBER')}
                  </span>
                  {!isLeaderRow && (
                    <button
                      type="button"
                      className="faction-manage__row-remove"
                      aria-label={t(
                        'factions.manage.removeAria',
                        'Remove {{name}} from the faction',
                        { name: member.wrestlerName },
                      )}
                      onClick={() =>
                        setMemberToRemove({
                          playerId: member.playerId,
                          playerName: member.wrestlerName,
                        })
                      }
                    >
                      {t('factions.my.removeMember', 'Remove')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <h3 className="faction-manage__subheading">
            {t('factions.manage.pendingInvitations', 'Pending invitations ({{count}})', {
              count: invitations.length,
            })}
          </h3>
          {invitations.length === 0 ? (
            <p className="faction-manage__empty">
              {t('factions.manage.noInvitations', 'No pending invitations.')}
            </p>
          ) : (
            <ul className="faction-manage__list">
              {invitations.map((inv) => (
                <li key={inv.invitationId} className="faction-manage__invite-row">
                  <span className="faction-manage__row-name">
                    {inv.invitedPlayerName ?? inv.invitedPlayerId}
                  </span>
                  <span className="faction-manage__invite-meta">
                    {t('factions.manage.invitedOn', 'Invited {{date}}', {
                      date: new Date(inv.createdAt).toLocaleDateString(),
                    })}
                  </span>
                  {/* Resend + Revoke require backend handlers that don't
                   * exist yet. Hidden in v1 — captured as a follow-up. */}
                </li>
              ))}
            </ul>
          )}

          <h3 className="faction-manage__subheading">
            {t('factions.manage.inviteNewTitle', 'Invite new member')}
          </h3>
          <div className="faction-manage__invite-form">
            <label className="faction-manage__field">
              <span className="faction-manage__field-label">
                {t('factions.manage.invitePlayerLabel', 'Player')}
              </span>
              <select
                value={invitePlayerId}
                onChange={(e) => setInvitePlayerId(e.target.value)}
              >
                <option value="">
                  {t('factions.manage.invitePlayerPlaceholder', 'Select a wrestler…')}
                </option>
                {eligiblePlayers.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.currentWrestler} ({p.name})
                  </option>
                ))}
              </select>
            </label>
            <label className="faction-manage__field">
              <span className="faction-manage__field-label">
                {t('factions.manage.inviteMessageLabel', 'Personal message (optional)')}
              </span>
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                rows={2}
                placeholder={t(
                  'factions.manage.inviteMessagePlaceholder',
                  'Join us…',
                )}
              />
            </label>
            {inviteError && (
              <p className="faction-manage__error" role="alert">
                {inviteError}
              </p>
            )}
            <button
              type="button"
              className="faction-manage__send-invite"
              onClick={handleInvite}
              disabled={!invitePlayerId || inviteSubmitting}
            >
              {inviteSubmitting
                ? t('common.sending', 'Sending…')
                : t('factions.manage.sendInvite', 'Send invite')}
            </button>
          </div>
        </section>

        {/* ─── Danger zone ─── */}
        <section
          className="faction-manage__card faction-manage__card--danger"
          aria-labelledby="manage-danger"
        >
          <h2 id="manage-danger" className="faction-manage__card-title">
            {t('factions.manage.dangerTitle', 'Danger Zone')}
          </h2>

          {/* Transfer leadership: backend handler missing — gated until
           * it exists. Kept as a documentation seam so wiring it in
           * later is a one-line UI change. */}
          <p className="faction-manage__danger-note">
            {t(
              'factions.manage.transferComingSoon',
              'Transfer leadership: coming soon.',
            )}
          </p>

          <h3 className="faction-manage__danger-heading">
            {t('factions.manage.disbandHeading', 'Disband faction')}
          </h3>
          <p className="faction-manage__danger-copy">
            {t(
              'factions.manage.disbandCopy',
              'Permanently removes the faction and clears every member\'s faction reference. This cannot be undone.',
            )}
          </p>
          <button
            type="button"
            className="faction-manage__disband"
            aria-label={t('factions.manage.disbandAria', 'Disband {{name}}', {
              name: faction.name,
            })}
            onClick={() => setShowDisbandConfirm(true)}
          >
            {t('factions.manage.disbandButton', 'Disband faction')}
          </button>
        </section>
      </div>

      {/* ─── Audit log ─── */}
      <section
        className="faction-manage__audit"
        aria-labelledby="manage-audit"
      >
        <h2 id="manage-audit" className="faction-manage__card-title">
          {t('factions.manage.auditTitle', 'Audit log (last 10 actions)')}
        </h2>
        {auditEntries.length === 0 ? (
          <p className="faction-manage__empty">
            {t('factions.manage.auditEmpty', 'No recent admin actions.')}
          </p>
        ) : (
          <ol className="faction-manage__audit-list">
            {auditEntries.map((entry, i) => (
              <li
                key={entry.id}
                className={`faction-manage__audit-row ${
                  i === 0 ? 'faction-manage__audit-row--latest' : ''
                }`}
              >
                <div className="faction-manage__audit-body">
                  <span className="faction-manage__audit-summary">{entry.summary}</span>
                  <time
                    className="faction-manage__audit-time"
                    dateTime={entry.timestamp}
                  >
                    {new Date(entry.timestamp).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ─── Modals ─── */}
      {memberToRemove && (
        <RemoveMemberModal
          factionName={faction.name}
          playerName={memberToRemove.playerName}
          willDisband={willDisband}
          error={removeError}
          busy={removing}
          onCancel={() => {
            setMemberToRemove(null);
            setRemoveError(null);
          }}
          onConfirm={handleConfirmRemove}
        />
      )}

      {showDisbandConfirm && (
        <div
          className="faction-manage__disband-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disband-title"
        >
          <div className="faction-manage__disband-modal">
            <h2 id="disband-title" className="faction-manage__disband-title">
              {t('factions.manage.disbandConfirmTitle', 'Disband {{factionName}}?', {
                factionName: faction.name,
              })}
            </h2>
            <p className="faction-manage__disband-copy">
              {t(
                'factions.manage.disbandConfirmBody',
                'This will clear every member\'s faction reference and cannot be undone.',
              )}
            </p>
            {disbandError && (
              <p className="faction-manage__error" role="alert">
                {disbandError}
              </p>
            )}
            <div className="faction-manage__disband-actions">
              <button
                type="button"
                className="faction-manage__disband-cancel"
                onClick={() => {
                  setShowDisbandConfirm(false);
                  setDisbandError(null);
                }}
                disabled={disbanding}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="faction-manage__disband-confirm"
                onClick={handleConfirmDisband}
                disabled={disbanding}
              >
                {disbanding
                  ? t('factions.my.disbanding', 'Disbanding…')
                  : t('factions.manage.disbandButton', 'Disband faction')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
