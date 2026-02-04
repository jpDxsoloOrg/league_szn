/**
 * Centralized CSS selectors for E2E tests
 * Using Playwright's text and role-based selectors for reliability
 */
export const selectors = {
  // Navigation
  nav: {
    standings: 'a[href="/"]',
    championships: 'a[href="/championships"]',
    matches: 'a[href="/matches"]',
    tournaments: 'a[href="/tournaments"]',
    admin: 'a[href="/admin"]',
    guide: 'a[href="/guide"]',
  },

  // Login Page
  login: {
    container: 'main',
    heading: 'h2:has-text("Admin Login")',
    username: 'input[type="text"], input:near(:text("Username"))',
    password: 'input[type="password"], input:near(:text("Password"))',
    submitButton: 'button:has-text("Login")',
    errorMessage: 'text=/error|invalid|failed/i',
  },

  // Admin Panel
  admin: {
    panel: 'main:has(h2:has-text("Admin Panel"))',
    title: 'h2:has-text("Admin Panel")',
    logoutButton: 'button:has-text("Logout")',
    // Tab buttons by text
    tabPlayers: 'button:has-text("Manage Players")',
    tabDivisions: 'button:has-text("Divisions")',
    tabSchedule: 'button:has-text("Schedule Match")',
    tabResults: 'button:has-text("Record Results")',
    tabChampionships: 'button:has-text("Championships")',
    tabTournaments: 'button:has-text("Tournaments")',
    tabSeasons: 'button:has-text("Seasons")',
    tabHelp: 'button:has-text("Help")',
    tabDangerZone: 'button:has-text("Danger Zone")',
  },

  // Manage Players
  players: {
    heading: 'h2:has-text("Manage Players")',
    addButton: 'button:has-text("Add New Player"), button:has-text("Add Player")',
    nameInput: 'input:near(:text("Player Name")), input[placeholder*="name" i]',
    wrestlerInput: 'input:near(:text("Wrestler")), input[placeholder*="wrestler" i]',
    divisionSelect: 'select:near(:text("Division"))',
    submitButton: 'button:has-text("Add Player"), button:has-text("Save"), button:has-text("Create")',
    cancelButton: 'button:has-text("Cancel")',
    playerCard: 'div:has(h4):has(button:has-text("Edit"))',
    editButton: 'button:has-text("Edit")',
    deleteButton: 'button:has-text("Delete")',
    successMessage: 'text=/success|created|saved/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Manage Divisions
  divisions: {
    heading: 'h2:has-text("Manage Divisions")',
    createHeading: 'h3:has-text("Create New Division")',
    addButton: 'button:has-text("Create New Division"), button:has-text("Add Division")',
    nameInput: 'input:near(:text("Division Name")), input[placeholder*="Raw" i]',
    descriptionInput: 'input:near(:text("Description")), textarea:near(:text("Description"))',
    submitButton: 'button:has-text("Create Division"), button:has-text("Save")',
    cancelButton: 'button:has-text("Cancel")',
    divisionCard: 'div:has(h4):has(button:has-text("Delete"))',
    editButton: 'button:has-text("Edit")',
    deleteButton: 'button:has-text("Delete")',
    successMessage: 'text=/success|created/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Schedule Match
  scheduleMatch: {
    heading: 'h2:has-text("Schedule Match"), h2:has-text("Schedule")',
    dateInput: 'input[type="datetime-local"], input[type="date"]',
    matchTypeSelect: 'select:near(:text("Match Type"))',
    stipulationSelect: 'select:near(:text("Stipulation"))',
    participantCheckbox: 'input[type="checkbox"]',
    submitButton: 'button:has-text("Schedule"), button:has-text("Create")',
    successMessage: 'text=/success|scheduled/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Record Results
  recordResults: {
    heading: 'h2:has-text("Record Results"), h2:has-text("Record")',
    matchCard: 'div:has(button:has-text("Record"))',
    recordButton: 'button:has-text("Record Result"), button:has-text("Record")',
    winnerSelect: 'select:near(:text("Winner"))',
    successMessage: 'text=/success|recorded/i',
  },

  // Manage Championships
  championships: {
    heading: 'h2:has-text("Manage Championships"), h2:has-text("Championships")',
    addButton: 'button:has-text("Create"), button:has-text("Add")',
    nameInput: 'input:near(:text("Championship Name")), input[placeholder*="name" i]',
    typeSelect: 'select:near(:text("Type"))',
    submitButton: 'button:has-text("Create"), button:has-text("Save")',
    championshipCard: 'div:has(h4):has(button:has-text("Delete")), div:has(h3):has(button:has-text("Delete"))',
    deleteButton: 'button:has-text("Delete")',
    successMessage: 'text=/success|created/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Create Tournament
  tournaments: {
    heading: 'h2:has-text("Tournament"), h2:has-text("Create Tournament")',
    addButton: 'button:has-text("Create")',
    nameInput: 'input:near(:text("Tournament Name")), input[placeholder*="name" i]',
    typeSelect: 'select:near(:text("Type")), select:near(:text("Format"))',
    submitButton: 'button:has-text("Create"), button:has-text("Save")',
    tournamentCard: 'div:has(h4):has(button)',
    successMessage: 'text=/success|created/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Manage Seasons
  seasons: {
    heading: 'h2:has-text("Manage Seasons")',
    addButton: 'button:has-text("Create New Season"), button:has-text("Create")',
    showFormButton: 'button:has-text("Create New Season")',
    nameInput: 'input:near(:text("Season Name")), input[placeholder*="Season" i]',
    startDateInput: 'input[type="date"]:near(:text("Start"))',
    endDateInput: 'input[type="date"]:near(:text("End"))',
    submitButton: 'button[type="submit"]:has-text("Create Season"), button:has-text("Create Season")',
    seasonCard: 'div:has(h4):has(button:has-text("Delete"))',
    endButton: 'button:has-text("End Season")',
    deleteButton: 'button:has-text("Delete")',
    activeBanner: 'div:has-text("Active Season"):has(button:has-text("End"))',
    activeSeasonBadge: 'text=/Active/i',
    successMessage: 'text=/success|created|ended/i',
    errorMessage: 'text=/error|failed/i',
  },

  // Danger Zone
  dangerZone: {
    heading: 'h2:has-text("Danger Zone")',
    clearAllButton: 'button:has-text("Clear All")',
    seedDataButton: 'button:has-text("Seed")',
    confirmInput: 'input[placeholder*="DELETE"]',
    confirmButton: 'button:has-text("Confirm")',
  },

  // Public Pages - Standings
  standings: {
    container: 'main',
    heading: 'h2:has-text("Standings")',
    table: 'table',
    seasonSelect: 'select:near(:text("Season"))',
    divisionFilter: 'div:has(button:has-text("All"))',
    filterButton: 'button',
    playerRow: 'table tbody tr',
  },

  // Public Pages - Championships
  publicChampionships: {
    container: 'main',
    heading: 'h2:has-text("Championships")',
    championshipCard: 'div:has(h3)',
    historySection: 'div:has-text("History")',
  },

  // Public Pages - Matches
  matches: {
    container: 'main',
    heading: 'h2:has-text("Matches")',
    filterButtons: 'button:has-text("All"), button:has-text("Scheduled"), button:has-text("Completed")',
    matchList: 'div:has(h3)',
    matchCard: 'div:has(h3)',
  },

  // Public Pages - Tournaments
  publicTournaments: {
    container: 'main',
    heading: 'h2:has-text("Tournaments")',
    tournamentCard: 'div:has(h3)',
    bracket: 'div:has-text("Bracket")',
  },

  // Common
  common: {
    loading: 'text=/loading/i',
    error: 'text=/error/i',
    emptyState: 'text=/no.*found|empty|none/i',
    main: 'main',
  },
};
