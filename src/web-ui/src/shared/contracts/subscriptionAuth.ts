export const SUBSCRIPTION_PROVIDERS = ['codex', 'opencode'] as const;

export type SubscriptionProvider = typeof SUBSCRIPTION_PROVIDERS[number];
