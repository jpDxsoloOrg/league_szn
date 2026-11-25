import type { BuildRules } from '../services/api/builds.api';

/**
 * `GET /builds/rules` as the backend returns it today
 * (backend/lib/builds/buildRulesView.ts over lib/policies/buildRules.ts).
 * Shared by the build editor tests (BLD-12).
 */
export function buildRulesFixture(): BuildRules {
  return {
    rulesVersion: 1,
    stats: {
      coreStats: ['strikes', 'grapple', 'agility', 'endurance'],
      base: 40,
      cap: 100,
      costBands: [
        { from: 41, to: 75, costPerPoint: 1 },
        { from: 76, to: 90, costPerPoint: 2 },
        { from: 91, to: 100, costPerPoint: 3 },
      ],
    },
    moves: { minLevel: 1, maxLevel: 5, signatureLevelCost: 5, finisherLevelCost: 8 },
    budgets: { tiers: { '1': 160, '2': 130 }, defaultTier: 100, developmental: 80, noDivision: 80 },
    styles: [
      { id: 'powerhouse', statBonuses: { grapple: 8 }, beats: 'highFlyer', beatenBy: 'striker', specialties: ['hardcore', 'cage'], specialtyBonus: 0.06 },
      { id: 'technician', statBonuses: { grapple: 4, endurance: 4 }, beats: 'brawler', beatenBy: 'highFlyer', specialties: ['technical', 'endurance'], specialtyBonus: 0.06 },
      { id: 'highFlyer', statBonuses: { agility: 8 }, beats: 'technician', beatenBy: 'powerhouse', specialties: ['highRisk', 'cage'], specialtyBonus: 0.06 },
      { id: 'brawler', statBonuses: { strikes: 4, endurance: 4 }, beats: 'striker', beatenBy: 'technician', specialties: ['hardcore', 'endurance'], specialtyBonus: 0.06 },
      { id: 'striker', statBonuses: { strikes: 8 }, beats: 'powerhouse', beatenBy: 'brawler', specialties: ['hardcore', 'endurance'], specialtyBonus: 0.06 },
      {
        id: 'allRounder',
        statBonuses: { strikes: 2, grapple: 2, agility: 2, endurance: 2 },
        beats: null,
        beatenBy: null,
        specialties: ['highRisk', 'technical', 'endurance', 'hardcore', 'cage'],
        specialtyBonus: 0.03,
      },
    ],
    styleBeats: { powerhouse: 'highFlyer', highFlyer: 'technician', technician: 'brawler', brawler: 'striker', striker: 'powerhouse' },
    styleEdge: 0.05,
    simCategories: [
      { id: 'standard', label: 'Standard', examples: ['Singles', 'Tag team', 'Triple threat'] },
      { id: 'highRisk', label: 'High risk', examples: ['Ladder', 'TLC', 'Scaffold'] },
      { id: 'technical', label: 'Technical', examples: ['Submission', 'I Quit', '2 out of 3 falls'] },
      { id: 'endurance', label: 'Endurance', examples: ['Iron Man', 'Last Man Standing'] },
      { id: 'hardcore', label: 'Hardcore', examples: ['Street Fight', 'Extreme Rules', 'Tables', 'Falls Count Anywhere'] },
      { id: 'cage', label: 'Cage', examples: ['Steel Cage', 'Hell in a Cell'] },
    ],
    specialtyCategories: ['highRisk', 'technical', 'endurance', 'hardcore', 'cage'],
    styleSpecialties: {
      powerhouse: ['hardcore', 'cage'],
      highFlyer: ['highRisk', 'cage'],
      technician: ['technical', 'endurance'],
      brawler: ['hardcore', 'endurance'],
      striker: ['hardcore', 'endurance'],
      allRounder: ['highRisk', 'technical', 'endurance', 'hardcore', 'cage'],
    },
    specialtyBonus: 0.06,
    allRounderSpecialtyBonus: 0.03,
  };
}
