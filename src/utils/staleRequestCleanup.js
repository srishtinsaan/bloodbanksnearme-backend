// utils/staleRequestCleanup.js
//
// Lazy, on-access soft-delete sweep for BloodRequest / DonationRequest.
// Follows the same pattern already established for the 48hr donation
// safety-net: no cron, no scheduled job — just a cheap check that runs
// whenever a list-style endpoint is naturally hit.
//
// Only ever touches requests already in a TERMINAL state (fulfilled/
// rejected/cancelled). Never touches pending/assigned/accepted requests,
// regardless of age — an old still-active request is a red flag worth
// looking at, not something to hide.
//
// Soft delete only: sets isDeleted + deletedAt, never actually removes the
// document. Full audit history stays queryable directly in the DB if ever
// needed (e.g. by an admin script), even though normal app queries won't
// surface it.
//
// One updateMany() per call — bulk, not a per-document loop — so calling
// this at the top of every list endpoint stays cheap even as collections
// grow.

const TERMINAL_STATUSES = ["fulfilled", "rejected", "cancelled"];
const STALE_THRESHOLD_DAYS = 30;

/**
 * Soft-delete any of this Model's documents that have been sitting in a
 * terminal status for longer than the threshold.
 *
 * ASSUMPTION: uses `updatedAt` as the "how long in this terminal state"
 * clock, since neither BloodRequest nor DonationRequest has a dedicated
 * top-level resolvedAt/fulfilledAt field (only individual assignment
 * subdocuments do). This only works correctly because nothing currently
 * touches a request after it reaches a terminal status — if that ever
 * changes (e.g. an admin adds a note post-fulfillment), updatedAt would
 * reset and delay cleanup. Worth revisiting if that becomes a real pattern.
 *
 * @param {import("mongoose").Model} Model - BloodRequest or DonationRequest
 * @param {number} thresholdDays - override the 30-day default if needed
 */
export const sweepStaleTerminalRequests = async (Model, thresholdDays = STALE_THRESHOLD_DAYS) => {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  await Model.updateMany(
    {
      status: { $in: TERMINAL_STATUSES },
      isDeleted: { $ne: true }, // matches false AND missing (pre-schema-change docs)
      updatedAt: { $lt: cutoff },
    },
    {
      $set: { isDeleted: true, deletedAt: new Date() },
    }
  );
};

// Standard filter fragment to merge into any find()/countDocuments() query
// on these models, so soft-deleted requests never surface in normal reads.
// Usage: Model.find({ ...NOT_DELETED, ...otherFilters })
export const NOT_DELETED = { isDeleted: { $ne: true } };