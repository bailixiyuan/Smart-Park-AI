import { ParkingLocation } from "../types";

const STORAGE_KEY = 'smart_park_data';

// Helper to ensure we always work with an array
const parseStorage = (data: string | null): ParkingLocation[] => {
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Migrate old single object to array
      return [parsed];
    }
    return [];
  } catch (e) {
    console.error("Failed to parse local storage", e);
    return [];
  }
};

export const saveParkingRecords = (records: ParkingLocation[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};

export const addOrUpdateParkingRecord = (record: ParkingLocation): ParkingLocation[] => {
  const current = getParkingRecords();
  const index = current.findIndex(r => r.id === record.id);
  
  let newRecords;
  if (index >= 0) {
    // Update existing
    newRecords = [...current];
    newRecords[index] = record;
  } else {
    // Add new
    newRecords = [record, ...current];
  }
  
  saveParkingRecords(newRecords);
  return newRecords;
};

export const getParkingRecords = (): ParkingLocation[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return parseStorage(data);
  } catch (e) {
    console.error("Failed to read from local storage", e);
    return [];
  }
};

// Deprecated: kept for compatibility if needed, but we use getParkingRecords now
export const getParkingRecord = (): ParkingLocation | null => {
  const records = getParkingRecords();
  return records.length > 0 ? records[0] : null;
};

// Deprecated: kept for compatibility, replaced by saveParkingRecords
export const saveParkingRecord = (record: ParkingLocation): void => {
  addOrUpdateParkingRecord(record);
};

export const deleteParkingRecord = (id: string): ParkingLocation[] => {
  try {
    const current = getParkingRecords();
    const newRecords = current.filter(r => r.id !== id);
    saveParkingRecords(newRecords);
    return newRecords;
  } catch (e) {
    console.error("Failed to delete from local storage", e);
    return [];
  }
};

export const clearParkingRecord = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear local storage", e);
  }
};