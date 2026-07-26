use serde::{Deserialize, Serialize};

/// Subscription account whose native credential may be selected by a model.
///
/// This DTO deliberately identifies only the provider. Secret material remains
/// in the platform credential store and is never serialized into model config.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionProvider {
    Codex,
    Opencode,
}

#[cfg(test)]
mod tests {
    use super::SubscriptionProvider;

    #[test]
    fn provider_uses_stable_snake_case_wire_values() {
        assert_eq!(
            serde_json::to_string(&SubscriptionProvider::Codex).unwrap(),
            "\"codex\""
        );
        assert_eq!(
            serde_json::from_str::<SubscriptionProvider>("\"opencode\"").unwrap(),
            SubscriptionProvider::Opencode
        );
    }
}
