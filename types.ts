export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface ParkingLocation {
  id: string;
  timestamp: number;
  coords?: GeoLocation;
  locationName?: string;
  photoBase64?: string;
  notes?: string;
  floor?: string;
  spotNumber?: string;
  aiAnalysis?: string;
  durationMinutes?: number;
}

export enum AppState {
  IDLE = 'IDLE',
  LOCATING = 'LOCATING',
  ANALYZING = 'ANALYZING',
  PARKED = 'PARKED',
  ERROR = 'ERROR'
}

export interface AiAnalysisResult {
  floor: string | null;
  spotNumber: string | null;
  description: string | null;
}