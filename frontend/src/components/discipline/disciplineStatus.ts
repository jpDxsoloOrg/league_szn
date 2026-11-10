import type { DisciplineStatus } from '../../types';
import type { BadgeTone } from '../ui/Badge';

export const DISCIPLINE_STATUS_KEYS: Record<DisciplineStatus, string> = {
  clear: 'discipline.status.clear',
  warned: 'discipline.status.warned',
  'signup-blocked': 'discipline.status.signupBlocked',
  cooldown: 'discipline.status.cooldown',
  deactivated: 'discipline.status.deactivated',
};

export const DISCIPLINE_STATUS_TONES: Record<DisciplineStatus, BadgeTone> = {
  clear: 'neutral',
  warned: 'warning',
  'signup-blocked': 'loss',
  cooldown: 'warning',
  deactivated: 'loss',
};
