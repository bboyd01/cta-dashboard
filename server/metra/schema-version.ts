/**
 * Split out from schedule.ts to avoid a circular import: schedule.ts imports
 * the seed fixture as its last-resort fallback, and the seed fixture needs
 * this same version number stamped on it, so neither file can own it without
 * the other importing back from a not-yet-finished module.
 */
export const SCHEMA_VERSION = 2
