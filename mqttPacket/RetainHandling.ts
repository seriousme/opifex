/**
 *RetainHandling
 0 = Send retained messages at the time of the subscribe
 1 = Send retained messages at subscribe only if the subscription does not currently exist
 2 = Do not send retained messages at the time of the subscribe
 */
export const RetainHandling = {
  sendRetained: 0,
  ifSubscriptionNotExists: 1,
  noRetain: 2,
} as const;
