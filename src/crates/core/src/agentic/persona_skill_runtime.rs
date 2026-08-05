//! Trusted runtime boundary for persona-scoped Skill narrowing.
//!
//! A persona allowlist is host-resolved authority. Prompt-controlled context is
//! stripped before the trusted allowlist is projected into tool contexts.

use crate::util::errors::{VoidError, VoidResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use void_core_types::{TeamMemberSkillPolicyKind, TeamMemberSkillPolicySnapshot};

pub const PERSONA_SKILL_POLICY_VERSION: &str = "v1";
pub const PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY: &str = "persona_skill_allowed_keys";
pub const PERSONA_SKILL_POLICY_CONTEXT_KEY: &str = "persona_skill_policy_version";
pub const TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY: &str = "team_member_skill_policy_identity";
pub const PERSONA_SKILL_RESERVED_CONTEXT_KEYS: &[&str] = &[
    PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY,
    PERSONA_SKILL_POLICY_CONTEXT_KEY,
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersonaSkillFacts {
    allowed_skill_keys: Vec<String>,
    policy_version: String,
}

impl PersonaSkillFacts {
    /// Empty keeps the legacy effective Skill set unchanged.
    pub fn from_allowed_skill_keys(keys: &[String]) -> VoidResult<Option<Self>> {
        if keys.is_empty() {
            return Ok(None);
        }

        let mut normalized = Vec::with_capacity(keys.len());
        for key in keys {
            let key = key.trim();
            if key.is_empty() {
                return Err(VoidError::validation(
                    "persona Skill allowlist contains an empty key".to_string(),
                ));
            }
            normalized.push(key.to_string());
        }
        normalized.sort();
        normalized.dedup();

        Ok(Some(Self {
            allowed_skill_keys: normalized,
            policy_version: PERSONA_SKILL_POLICY_VERSION.to_string(),
        }))
    }

    pub fn allowed_skill_keys(&self) -> &[String] {
        &self.allowed_skill_keys
    }

    pub fn allows_key(&self, key: &str) -> bool {
        self.allowed_skill_keys
            .binary_search_by(|allowed| allowed.as_str().cmp(key))
            .is_ok()
    }

    pub fn cache_identity(&self) -> String {
        hex::encode(Sha256::digest(
            self.allowed_skill_keys.join("\n").as_bytes(),
        ))
    }

    pub fn validate(&self) -> VoidResult<()> {
        if self.policy_version != PERSONA_SKILL_POLICY_VERSION {
            return Err(VoidError::validation(format!(
                "unsupported persona Skill policy version: {}",
                self.policy_version
            )));
        }
        if self.allowed_skill_keys.is_empty()
            || self
                .allowed_skill_keys
                .iter()
                .any(|key| key.trim().is_empty())
        {
            return Err(VoidError::validation(
                "persona Skill allowlist must contain non-empty keys".to_string(),
            ));
        }
        let unique: HashSet<&str> = self.allowed_skill_keys.iter().map(String::as_str).collect();
        if unique.len() != self.allowed_skill_keys.len() {
            return Err(VoidError::validation(
                "persona Skill allowlist must not contain duplicate keys".to_string(),
            ));
        }
        Ok(())
    }

    pub fn write_context_vars(&self, target: &mut HashMap<String, String>) {
        target.insert(
            PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY.to_string(),
            serde_json::to_string(&self.allowed_skill_keys)
                .expect("serializing persona Skill keys cannot fail"),
        );
        target.insert(
            PERSONA_SKILL_POLICY_CONTEXT_KEY.to_string(),
            self.policy_version.clone(),
        );
    }

    pub fn from_custom_data(custom_data: &HashMap<String, Value>) -> VoidResult<Option<Self>> {
        let allowed = custom_data.get(PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY);
        let version = custom_data.get(PERSONA_SKILL_POLICY_CONTEXT_KEY);
        if allowed.is_none() && version.is_none() {
            return Ok(None);
        }

        let allowed_skill_keys: Vec<String> =
            serde_json::from_value(allowed.cloned().ok_or_else(|| {
                VoidError::validation("persona Skill context is missing its allowlist".to_string())
            })?)
            .map_err(|error| {
                VoidError::validation(format!("invalid persona Skill allowlist context: {error}"))
            })?;
        let policy_version = version
            .and_then(Value::as_str)
            .ok_or_else(|| {
                VoidError::validation(
                    "persona Skill context is missing its policy version".to_string(),
                )
            })?
            .to_string();
        let facts = Self {
            allowed_skill_keys,
            policy_version,
        };
        facts.validate()?;
        Ok(Some(facts))
    }
}

pub fn strip_persona_skill_context_vars(context: &mut HashMap<String, String>) {
    for key in PERSONA_SKILL_RESERVED_CONTEXT_KEYS {
        context.remove(*key);
    }
    context.remove(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY);
}

pub fn trusted_persona_skill_context_vars(
    source: &HashMap<String, String>,
    facts: Option<&PersonaSkillFacts>,
) -> HashMap<String, String> {
    let mut trusted = source.clone();
    strip_persona_skill_context_vars(&mut trusted);
    if let Some(facts) = facts.filter(|facts| facts.validate().is_ok()) {
        facts.write_context_vars(&mut trusted);
    }
    trusted
}

/// Project a validated Team-member policy into the same narrow Skill boundary
/// used by persona allowlists. The policy hash is also carried so prompt-cache
/// identity includes both authority and the effective key@revision set.
pub fn trusted_team_member_skill_context_vars(
    source: &HashMap<String, String>,
    policy: Option<&TeamMemberSkillPolicySnapshot>,
) -> VoidResult<HashMap<String, String>> {
    let mut trusted = source.clone();
    trusted.remove(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY);
    let Some(policy) = policy else {
        return Ok(trusted);
    };
    strip_persona_skill_context_vars(&mut trusted);
    policy
        .validate()
        .map_err(|error| VoidError::validation(error.to_string()))?;
    trusted.insert(
        TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY.to_string(),
        policy.policy_hash.clone(),
    );
    if policy.kind == TeamMemberSkillPolicyKind::Restricted {
        let facts = PersonaSkillFacts::from_allowed_skill_keys(&policy.allowed_skill_keys)?
            .ok_or_else(|| {
                VoidError::validation(
                    "restricted Team member Skill policy has no allowed keys".to_string(),
                )
            })?;
        facts.write_context_vars(&mut trusted);
    }
    Ok(trusted)
}

pub fn append_persona_skill_context_data(
    context_vars: &HashMap<String, String>,
    target: &mut HashMap<String, Value>,
) {
    if let Some(value) = context_vars.get(PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY) {
        target.insert(
            PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY.to_string(),
            serde_json::from_str(value).unwrap_or_else(|_| Value::String(value.clone())),
        );
    }
    if let Some(value) = context_vars.get(PERSONA_SKILL_POLICY_CONTEXT_KEY) {
        target.insert(
            PERSONA_SKILL_POLICY_CONTEXT_KEY.to_string(),
            Value::String(value.clone()),
        );
    }
    if let Some(value) = context_vars.get(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY) {
        target.insert(
            TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY.to_string(),
            Value::String(value.clone()),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_allowlist_preserves_legacy_behavior() {
        assert!(PersonaSkillFacts::from_allowed_skill_keys(&[])
            .expect("empty allowlist is valid")
            .is_none());
    }

    #[test]
    fn allowlist_identity_is_normalized_and_order_independent() {
        let first = PersonaSkillFacts::from_allowed_skill_keys(&[
            "skill-b".to_string(),
            " skill-a ".to_string(),
            "skill-a".to_string(),
        ])
        .unwrap()
        .unwrap();
        let second = PersonaSkillFacts::from_allowed_skill_keys(&[
            "skill-a".to_string(),
            "skill-b".to_string(),
        ])
        .unwrap()
        .unwrap();

        assert_eq!(first.allowed_skill_keys(), &["skill-a", "skill-b"]);
        assert_eq!(first.cache_identity(), second.cache_identity());
    }

    #[test]
    fn trusted_projection_removes_forged_context_and_round_trips() {
        let source = HashMap::from([
            ("ordinary".to_string(), "kept".to_string()),
            (
                PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY.to_string(),
                "[\"forged\"]".to_string(),
            ),
        ]);
        let facts = PersonaSkillFacts::from_allowed_skill_keys(&["trusted".to_string()])
            .unwrap()
            .unwrap();
        let projected = trusted_persona_skill_context_vars(&source, Some(&facts));
        let mut custom_data = HashMap::new();
        append_persona_skill_context_data(&projected, &mut custom_data);
        let restored = PersonaSkillFacts::from_custom_data(&custom_data)
            .unwrap()
            .unwrap();

        assert_eq!(projected.get("ordinary").map(String::as_str), Some("kept"));
        assert_eq!(restored.allowed_skill_keys(), &["trusted"]);
    }

    #[test]
    fn malformed_partial_context_fails_closed() {
        let custom_data = HashMap::from([(
            PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY.to_string(),
            json!(["skill-a"]),
        )]);
        assert!(PersonaSkillFacts::from_custom_data(&custom_data).is_err());
    }

    #[test]
    fn restricted_team_member_policy_projects_allowlist_and_policy_identity() {
        let policy = TeamMemberSkillPolicySnapshot::new(
            "definition".into(),
            "revision".into(),
            "instance".into(),
            "member".into(),
            "agent".into(),
            vec!["void:skill-a".into()],
        )
        .unwrap();
        let source = HashMap::from([(
            PERSONA_SKILL_ALLOWLIST_CONTEXT_KEY.to_string(),
            "[\"forged\"]".to_string(),
        )]);
        let projected = trusted_team_member_skill_context_vars(&source, Some(&policy)).unwrap();
        let mut custom_data = HashMap::new();
        append_persona_skill_context_data(&projected, &mut custom_data);
        let facts = PersonaSkillFacts::from_custom_data(&custom_data)
            .unwrap()
            .unwrap();

        assert_eq!(facts.allowed_skill_keys(), &["void:skill-a"]);
        assert_eq!(
            custom_data
                .get(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY)
                .and_then(Value::as_str),
            Some(policy.policy_hash.as_str())
        );
    }

    #[test]
    fn no_policy_team_member_keeps_effective_skills_but_partitions_cache() {
        let policy = TeamMemberSkillPolicySnapshot::new(
            "definition".into(),
            "revision".into(),
            "instance".into(),
            "member".into(),
            "agent".into(),
            vec![],
        )
        .unwrap();
        let projected =
            trusted_team_member_skill_context_vars(&HashMap::new(), Some(&policy)).unwrap();
        let mut custom_data = HashMap::new();
        append_persona_skill_context_data(&projected, &mut custom_data);

        assert!(PersonaSkillFacts::from_custom_data(&custom_data)
            .unwrap()
            .is_none());
        assert_eq!(
            custom_data
                .get(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY)
                .and_then(Value::as_str),
            Some(policy.policy_hash.as_str())
        );
    }
}
