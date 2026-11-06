import type { BadgeTone } from '../ui/Badge';
import type { EventStatus, EventType, MatchDesignation } from '../../types/event';

/** Badge tone for each event type. Calendar chips use the matching CSS modifier. */
export const EVENT_TYPE_TONES: Record<EventType, BadgeTone> = {
  ppv: 'pink',
  weekly: 'primary',
  special: 'violet',
  house: 'neutral',
};

export const EVENT_STATUS_TONES: Record<EventStatus, BadgeTone> = {
  upcoming: 'primary',
  'in-progress': 'live',
  completed: 'neutral',
  cancelled: 'loss',
};

export const DESIGNATION_LABEL_KEYS: Record<MatchDesignation, string> = {
  'pre-show': 'events.designations.preShow',
  opener: 'events.designations.opener',
  midcard: 'events.designations.midcard',
  'co-main': 'events.designations.coMain',
  'main-event': 'events.designations.mainEvent',
};
