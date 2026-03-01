export interface Player {
  id: string;
  name: string;
  position?: string;
  teamId?: string;
  jerseyNumber?: number;
  imageUrl?: string;
  bio?: string; // Added bio field with max length of 255 characters
}