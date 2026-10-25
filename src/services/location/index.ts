import { GoogleService } from "./GoogleService";
import { OpenSourceService } from "./OpenSourceService";

export * from "./types";

export const USE_GOOGLE_MAPS = false;

export const LocationService = USE_GOOGLE_MAPS
  ? new GoogleService()
  : new OpenSourceService();
