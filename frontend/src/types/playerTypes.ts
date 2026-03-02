export interface Player {
  playerId: string;
  name: string;
  position?: string;
  team?: string;
  bio?: string; // Optional bio field with max 255 characters
}