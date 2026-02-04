/**
 * Centralized CSS selectors for E2E tests
 * Using a selector registry makes tests more maintainable
 */
export const selectors = {
  // Navigation
  nav: {
    standings: 'nav a[href="/"]',
    championships: 'nav a[href="/championships"]',
    matches: 'nav a[href="/matches"]',
    tournaments: 'nav a[href="/tournaments"]',
    admin: 'nav a[href="/admin"]',
    guide: 'nav a[href="/guide"]',
  },

  // Login Page
  login: {
    form: '.login-container form',
    username: '#username',
    password: '#password',
    submitButton: 'button[type="submit"]',
    errorMessage: '.error-message',
  },

  // Admin Panel
  admin: {
    panel: '.admin-panel',
    title: '.admin-panel h2',
    logoutButton: '.logout-btn',
    tabs: '.admin-tabs',
    tabButton: '.admin-tabs .tab',
    activeTab: '.admin-tabs .tab.active',
  },

  // Manage Players
  players: {
    container: '.manage-players',
    addButton: '.add-player-btn, button:has-text("Add Player")',
    form: '.player-form',
    nameInput: '#name, input[placeholder*="name"]',
    wrestlerInput: '#wrestler, #currentWrestler, input[placeholder*="wrestler"]',
    divisionSelect: '#division, select[name="division"]',
    submitButton: '.player-form button[type="submit"]',
    playerList: '.players-list, .player-list',
    playerCard: '.player-card',
    editButton: '.edit-btn, button:has-text("Edit")',
    deleteButton: '.delete-btn, button:has-text("Delete")',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Manage Divisions
  divisions: {
    container: '.manage-divisions',
    addButton: 'button:has-text("Create"), button:has-text("Add")',
    form: '.division-form',
    nameInput: '#name, input[placeholder*="name"]',
    descriptionInput: '#description, textarea[placeholder*="description"]',
    submitButton: 'button[type="submit"]',
    divisionList: '.divisions-list',
    divisionCard: '.division-card',
    deleteButton: '.delete-btn, button:has-text("Delete")',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Schedule Match
  scheduleMatch: {
    container: '.schedule-match',
    form: '.match-form',
    dateInput: '#date, input[type="datetime-local"]',
    matchTypeSelect: '#matchType, select[name="matchType"]',
    stipulationSelect: '#stipulation, select[name="stipulation"]',
    participantSelect: '.participant-select, select[name="participants"]',
    championshipSelect: '#championship, select[name="championship"]',
    tournamentSelect: '#tournament, select[name="tournament"]',
    seasonSelect: '#season, select[name="season"]',
    submitButton: 'button[type="submit"]',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Record Results
  recordResults: {
    container: '.record-result',
    matchList: '.pending-matches',
    matchCard: '.match-card',
    winnerSelect: '.winner-select, select[name="winner"]',
    loserSelect: '.loser-select, select[name="loser"]',
    recordButton: 'button:has-text("Record")',
    successMessage: '.success-message',
  },

  // Manage Championships
  championships: {
    container: '.manage-championships, .championships-container',
    addButton: 'button:has-text("Create"), button:has-text("Add")',
    form: '.championship-form',
    nameInput: '#name, input[placeholder*="name"]',
    typeSelect: '#type, select[name="type"]',
    championSelect: '#currentChampion, select[name="currentChampion"]',
    submitButton: 'button[type="submit"]',
    championshipGrid: '.championships-grid',
    championshipCard: '.championship-card',
    deleteButton: '.delete-btn, button:has-text("Delete")',
    historyButton: 'button:has-text("History")',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Create Tournament
  tournaments: {
    container: '.create-tournament, .tournaments-container',
    addButton: 'button:has-text("Create")',
    form: '.tournament-form',
    nameInput: '#name, input[placeholder*="name"]',
    typeSelect: '#type, select[name="type"]',
    participantSelect: '.participant-select',
    submitButton: 'button[type="submit"]',
    tournamentList: '.tournaments-list',
    tournamentCard: '.tournament-card',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Manage Seasons
  seasons: {
    container: '.manage-seasons',
    addButton: 'button:has-text("Create"), button:has-text("New")',
    form: '.season-form',
    nameInput: '#name, input[placeholder*="name"]',
    startDateInput: '#startDate, input[name="startDate"]',
    endDateInput: '#endDate, input[name="endDate"]',
    submitButton: 'button[type="submit"]',
    seasonList: '.seasons-list, .seasons-grid',
    seasonCard: '.season-card',
    endButton: '.end-season-btn, button:has-text("End")',
    deleteButton: '.delete-season-btn, button:has-text("Delete")',
    activeBanner: '.active-season-banner',
    successMessage: '.success-message',
    errorMessage: '.error-message',
  },

  // Danger Zone
  dangerZone: {
    container: '.danger-zone, .clear-all-data',
    clearAllButton: 'button:has-text("Clear All")',
    seedDataButton: 'button:has-text("Seed")',
    confirmInput: 'input[placeholder*="DELETE"]',
    confirmButton: 'button:has-text("Confirm")',
  },

  // Public Pages
  standings: {
    container: '.standings-container',
    table: '.standings-table',
    seasonSelect: '#season-select',
    divisionFilter: '.division-filter',
    filterButton: '.filter-btn',
    playerRow: '.standings-table tbody tr',
  },

  publicChampionships: {
    container: '.championships-container',
    championshipCard: '.championship-card',
    historySection: '.championship-history',
  },

  matches: {
    container: '.matches-container',
    filterButtons: '.match-filters button, .filter-buttons button',
    matchList: '.matches-list',
    matchCard: '.match-card',
  },

  publicTournaments: {
    container: '.tournaments-container',
    tournamentCard: '.tournament-card',
    bracket: '.bracket',
    standings: '.tournament-standings',
  },

  // Common
  common: {
    loading: '.loading',
    error: '.error',
    emptyState: '.empty-state',
    modal: '.modal',
    modalClose: '.modal-close',
  },
};
