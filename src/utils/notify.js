// utils/notify.js
import { Notification } from "../models/notification.model.js";

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

/**
 * Creates a notification and pushes it in real time if possible.
 * DB write always happens first — if the realtime push fails (server down,
 * network issue), the notification is still safely there for the user to
 * see next time they open the app.
 *
 * @param {Object} params
 * @param {string} params.recipient   - userId to notify
 * @param {string} params.type        - one of the enum values in notification.model.js
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.relatedRequest]
 * @param {string} [params.relatedRequestModel] - "BloodRequest" | "DonationRequest"
 */
export const sendNotification = async ({
  recipient,
  type,
  title,
  message,
  relatedRequest,
  relatedRequestModel,
}) => {
  // Step 1: persist — this must succeed, it's the source of truth.
  const notification = await Notification.create({
    recipient,
    type,
    title,
    message,
    relatedRequest,
    relatedRequestModel,
  });

  // Step 2: best-effort real-time push. Never let this throw and break
  // the calling controller's flow (e.g. accepting a request should still
  // succeed even if the realtime server is temporarily unreachable).
  if (REALTIME_SERVER_URL) {
    try {
      // `recipient` MUST be top-level here, not nested in `payload` — the
      // realtime server's /internal/emit reads req.body.recipient directly
      // to pick the target room (`user_${recipient}`) and 400s without it.
      await fetch(`${REALTIME_SERVER_URL}/internal/emit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({
          event: "notification:new",
          recipient: recipient.toString(),
          payload: {
            notificationId: notification._id,
            type,
            title,
            message,
            createdAt: notification.createdAt,
          },
        }),
      });
    } catch (err) {
      console.error(
        `[notify] Realtime push failed for user ${recipient} (notification still saved in DB):`,
        err.message
      );
    }
  }

  return notification;
};

export default sendNotification;