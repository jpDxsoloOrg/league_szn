import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { factionsApi, playersApi } from '../../../services/api';
import type { PlayerDirectoryEntry } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import type { Player } from '../../../types';
import type { StableInvitationWithDetails } from '../../../types/stable';
import { canManageFaction } from '../factionAccess';
import type { FactionDetailContext } from '../FactionDetail';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Skeleton from '../../ui/Skeleton';
import Modal from '../../ui/Modal';
import Select from '../../ui/Select';
import { useToast } from '../../ui/toastContext';
import FactionImageUploader from '../FactionImageUploader';
import RemoveMemberModal from '../RemoveMemberModal';
import '../groupUi.css';
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
  const { showToast } = useToast();

  const isAdmin = Boolean(auth.isAdminOrModerator);
  const canAccess = canManageFaction(auth.playerId, isAdmin, faction);

  // ─── State ────────────────────────────────────────────────────────
  const [name, setName] = useState(faction.name);
  const [imageUrl, setImageUrl] = useState<string | undefined>(faction.imageUrl);
  const [imageUrlInput, setImageUrlInput] = useState(faction.imageUrl ?? '');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [invitations, setInvitations] = useState<StableInvitationWithDetails[]>([]);
  const [eligiblePlayers, setEligiblePlayers] = useState<Player[]>([]);
  const [directory, setDirectory] = useState<PlayerDirectoryEntry[]>([]);
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

    const ignoreAbort = (message: string) => (err: unknown) => {
      if (err instanceof Error && err.name !== 'AbortError') logger.error(message);
    };

    const loadRoster = async () => {
      const [inv, allPlayers, directoryList, audit] = await Promise.all([
        factionsApi.getInvitations(faction.stableId, ac.signal).catch((err: unknown) => {
          ignoreAbort('Manage tab: getInvitations failed')(err);
          return [] as StableInvitationWithDetails[];
        }),
        playersApi.getAll(ac.signal).catch((err: unknown) => {
          ignoreAbort('Manage tab: playersApi.getAll failed')(err);
          return [] as Player[];
        }),
        playersApi.getDirectory(ac.signal).catch((err: unknown) => {
          ignoreAbort('Manage tab: playersApi.getDirectory failed')(err);
          return [] as PlayerDirectoryEntry[];
        }),
        loadAuditFromChannel(faction.stableId).catch((err: unknown) => {
          ignoreAbort('Manage tab: audit derivation failed')(err);
          return [] as AuditEntry[];
        }),
      ]);
      if (ac.signal.aborted) return;
      setInvitations(inv.filter((invitation) => invitation.status === 'pending'));
      // Eligible: not a member, not already invited, and not in another faction.
      const memberSet = new Set(faction.memberIds);
      const invitedSet = new Set(inv.map((invitation) => invitation.invitedPlayerId));
      setEligiblePlayers(
        allPlayers.filter(
          (player) => !memberSet.has(player.playerId) && !invitedSet.has(player.playerId) && !player.stableId,
        ),
      );
      setDirectory(directoryList);
      setAuditEntries(audit);
    };

    loadRoster();
    return () => ac.abort();
  }, [faction.stableId, faction.memberIds, rosterReloadKey, canAccess]);

  const reloadRoster = useCallback(() => setRosterReloadKey((k) => k + 1), []);

  const nameById = useMemo(
    () => new Map(directory.map((entry) => [entry.playerId, entry.currentWrestler ?? entry.name])),
    [directory],
  );

  // ─── Gating (after hooks per Rules of Hooks) ─────────────────────
  if (auth.isLoading) return <Skeleton variant="block" count={3} />;

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
    try {
      await factionsApi.update(faction.stableId, {
        name: trimmedName,
        imageUrl: imageUrl?.trim() || undefined,
      });
      showToast(t('factions.manage.savedToast', 'Faction identity saved.'), 'success');
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
  const closeDisband = () => {
    if (disbanding) return;
    setShowDisbandConfirm(false);
    setDisbandError(null);
  };

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
    <div className="group-page">
      <p className="faction-manage__banner" role="status">
        {t('factions.manage.leaderBanner', 'LEADER VIEW · Only you and admins can see this tab.')}
      </p>

      <div className="faction-manage__columns">
        <section className="group-section" aria-labelledby="manage-identity">
          <h2 id="manage-identity" className="group-heading">
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

          <label className="group-field">
            <span className="group-field__label">{t('factions.manage.imageUrlLabel', 'Or paste an image URL')}</span>
            <input
              type="url"
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              onBlur={handleUrlInputBlur}
              placeholder="https://…"
            />
          </label>

          <label className="group-field">
            <span className="group-field__label">{t('factions.manage.nameLabel', 'Faction Name')}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </label>

          {identityError && <p className="group-error" role="alert">{identityError}</p>}

          <div>
            <Button onClick={handleSaveIdentity} disabled={!identityDirty || !identityValid} loading={identitySaving}>
              {identitySaving ? t('common.saving', 'Saving…') : t('factions.manage.saveIdentity', 'Save')}
            </Button>
          </div>
        </section>

        <section className="group-section" aria-labelledby="manage-roster">
          <h2 id="manage-roster" className="group-heading">
            {t('factions.manage.rosterTitle', 'Roster Management')}
          </h2>

          <h3 className="group-subheading">
            {t('factions.manage.activeMembers', 'Active members ({{count}})', { count: faction.members.length })}
          </h3>
          <ul className="group-list">
            {faction.members.map((member) => {
              const isLeaderRow = member.playerId === faction.leaderId;
              return (
                <li key={member.playerId} className="faction-manage__row">
                  <span className="group-person">
                    <Avatar src={member.imageUrl} name={member.wrestlerName} size="sm" />
                    <span className="group-person__name">{member.wrestlerName}</span>
                    {isLeaderRow && <Badge tone="pink">{t('factions.members.roleLeader', 'LEADER')}</Badge>}
                  </span>
                  {!isLeaderRow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('factions.manage.removeAria', 'Remove {{name}} from the faction', {
                        name: member.wrestlerName,
                      })}
                      onClick={() => setMemberToRemove({ playerId: member.playerId, playerName: member.wrestlerName })}
                    >
                      {t('factions.my.removeMember', 'Remove')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          <h3 className="group-subheading">
            {t('factions.manage.pendingInvitations', 'Pending invitations ({{count}})', { count: invitations.length })}
          </h3>
          {invitations.length === 0 ? (
            <p className="group-empty">{t('factions.manage.noInvitations', 'No pending invitations.')}</p>
          ) : (
            <ul className="group-list">
              {invitations.map((invitation) => (
                <li key={invitation.invitationId} className="faction-manage__row">
                  <span className="group-person__name">
                    {invitation.invitedPlayerName
                      ?? nameById.get(invitation.invitedPlayerId)
                      ?? t('factions.redesign.unknownPlayer', 'Unknown player')}
                  </span>
                  <span className="group-muted">
                    {t('factions.manage.invitedOn', 'Invited {{date}}', {
                      date: new Date(invitation.createdAt).toLocaleDateString(),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="group-subheading">{t('factions.manage.inviteNewTitle', 'Invite new member')}</h3>
          <div className="group-form">
            <div className="group-field">
              <span className="group-field__label">{t('factions.manage.invitePlayerLabel', 'Player')}</span>
              <Select
                label={t('factions.manage.invitePlayerLabel', 'Player')}
                placeholder={t('factions.manage.invitePlayerPlaceholder', 'Select a wrestler…')}
                value={invitePlayerId}
                onValueChange={setInvitePlayerId}
                options={eligiblePlayers.map((player) => ({
                  value: player.playerId,
                  label: `${player.currentWrestler} (${player.name})`,
                }))}
              />
            </div>
            <label className="group-field">
              <span className="group-field__label">
                {t('factions.manage.inviteMessageLabel', 'Personal message (optional)')}
              </span>
              <textarea
                value={inviteMessage}
                onChange={(event) => setInviteMessage(event.target.value)}
                rows={2}
                placeholder={t('factions.manage.inviteMessagePlaceholder', 'Join us…')}
              />
            </label>
            {inviteError && <p className="group-error" role="alert">{inviteError}</p>}
            <div>
              <Button variant="secondary" onClick={handleInvite} disabled={!invitePlayerId} loading={inviteSubmitting}>
                {inviteSubmitting ? t('common.sending', 'Sending…') : t('factions.manage.sendInvite', 'Send invite')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="group-section" aria-labelledby="manage-audit">
        <h2 id="manage-audit" className="group-heading">
          {t('factions.manage.auditTitle', 'Audit log (last 10 actions)')}
        </h2>
        {auditEntries.length === 0 ? (
          <p className="group-empty">{t('factions.manage.auditEmpty', 'No recent admin actions.')}</p>
        ) : (
          <ol className="group-list">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="faction-manage__row">
                <span>{entry.summary}</span>
                <time className="group-muted" dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="group-section faction-manage__danger" aria-labelledby="manage-danger">
        <h2 id="manage-danger" className="group-heading faction-manage__danger-heading">
          {t('factions.manage.dangerTitle', 'Danger Zone')}
        </h2>
        <h3 className="group-subheading">{t('factions.manage.disbandHeading', 'Disband faction')}</h3>
        <p className="group-empty">
          {t(
            'factions.manage.disbandCopy',
            "Permanently removes the faction and clears every member's faction reference. This cannot be undone.",
          )}
        </p>
        <div>
          <Button
            variant="danger"
            aria-label={t('factions.manage.disbandAria', 'Disband {{name}}', { name: faction.name })}
            onClick={() => setShowDisbandConfirm(true)}
          >
            {t('factions.manage.disbandButton', 'Disband faction')}
          </Button>
        </div>
      </section>

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

      <Modal
        open={showDisbandConfirm}
        size="sm"
        title={t('factions.manage.disbandConfirmTitle', 'Disband {{factionName}}?', { factionName: faction.name })}
        onClose={closeDisband}
        footer={(
          <>
            <Button variant="secondary" onClick={closeDisband} disabled={disbanding}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDisband} loading={disbanding}>
              {disbanding ? t('factions.my.disbanding', 'Disbanding…') : t('factions.manage.disbandButton', 'Disband faction')}
            </Button>
          </>
        )}
      >
        <div className="group-form">
          <p className="group-empty">
            {t('factions.manage.disbandConfirmBody', "This will clear every member's faction reference and cannot be undone.")}
          </p>
          {disbandError && <p className="group-error" role="alert">{disbandError}</p>}
        </div>
      </Modal>
    </div>
  );
}
