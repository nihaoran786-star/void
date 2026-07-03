use std::collections::HashSet;

pub(crate) fn value_or_placeholder(
    value: Option<&str>,
    placeholder: Option<&str>,
) -> Option<String> {
    value
        .or(placeholder)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AxTraversalRootKind {
    AppRoot,
    FocusedWindowRoot,
    Child,
}

pub(crate) fn child_attributes_for_node(root_kind: AxTraversalRootKind) -> Vec<&'static str> {
    if root_kind == AxTraversalRootKind::AppRoot {
        vec!["AXChildren", "AXWindows"]
    } else {
        vec!["AXChildren"]
    }
}

pub(crate) fn dedupe_child_pointers(children: Vec<usize>) -> Vec<usize> {
    let mut seen = HashSet::new();
    children
        .into_iter()
        .filter(|ptr| seen.insert(*ptr))
        .collect()
}

#[allow(dead_code)]
pub(crate) fn should_enqueue_child_pointer(ptr: usize, seen: &mut HashSet<usize>) -> bool {
    seen.insert(ptr)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) enum AxEnablementAttempt {
    ModernEnabled,
    ModernUnsupported,
    ModernTransientError,
    LegacyEnabled,
    LegacyUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AxEnablementPlan {
    SettleAndCache,
    TryLegacy,
    NoSettle,
    SkipAlreadyEnabled,
}

#[derive(Debug, Default)]
pub(crate) struct ChromiumAxEnablementCache {
    enabled_pids: HashSet<i32>,
}

pub(crate) fn plan_chromium_ax_enablement(
    pid: i32,
    attempt: AxEnablementAttempt,
    cache: &mut ChromiumAxEnablementCache,
) -> AxEnablementPlan {
    if cache.enabled_pids.contains(&pid) {
        return AxEnablementPlan::SkipAlreadyEnabled;
    }

    match attempt {
        AxEnablementAttempt::ModernEnabled | AxEnablementAttempt::LegacyEnabled => {
            cache.enabled_pids.insert(pid);
            AxEnablementPlan::SettleAndCache
        }
        AxEnablementAttempt::ModernUnsupported => AxEnablementPlan::TryLegacy,
        AxEnablementAttempt::ModernTransientError | AxEnablementAttempt::LegacyUnavailable => {
            AxEnablementPlan::NoSettle
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_ax_snapshot_plan_uses_placeholder_when_value_is_missing() {
        assert_eq!(
            value_or_placeholder(None, Some("Search")),
            Some("Search".to_string())
        );
        assert_eq!(
            value_or_placeholder(Some("Typed"), Some("Search")),
            Some("Typed".to_string())
        );
    }

    #[test]
    fn macos_ax_snapshot_plan_reads_windows_only_at_root() {
        assert_eq!(
            child_attributes_for_node(AxTraversalRootKind::AppRoot),
            vec!["AXChildren", "AXWindows"]
        );
        assert_eq!(
            child_attributes_for_node(AxTraversalRootKind::FocusedWindowRoot),
            vec!["AXChildren"]
        );
        assert_eq!(
            child_attributes_for_node(AxTraversalRootKind::Child),
            vec!["AXChildren"]
        );
    }

    #[test]
    fn macos_ax_snapshot_plan_dedupes_child_pointers_in_order() {
        assert_eq!(
            dedupe_child_pointers(vec![10, 20, 10, 30, 20]),
            vec![10, 20, 30]
        );
    }

    #[test]
    fn macos_ax_snapshot_plan_settles_only_after_first_successful_enablement() {
        let mut cache = ChromiumAxEnablementCache::default();
        assert_eq!(
            plan_chromium_ax_enablement(42, AxEnablementAttempt::ModernEnabled, &mut cache),
            AxEnablementPlan::SettleAndCache
        );
        assert_eq!(
            plan_chromium_ax_enablement(42, AxEnablementAttempt::ModernEnabled, &mut cache),
            AxEnablementPlan::SkipAlreadyEnabled
        );
    }

    #[test]
    fn macos_ax_snapshot_plan_uses_legacy_only_after_unsupported_modern_attribute() {
        let mut cache = ChromiumAxEnablementCache::default();
        assert_eq!(
            plan_chromium_ax_enablement(7, AxEnablementAttempt::ModernUnsupported, &mut cache),
            AxEnablementPlan::TryLegacy
        );
        assert_eq!(
            plan_chromium_ax_enablement(7, AxEnablementAttempt::ModernTransientError, &mut cache),
            AxEnablementPlan::NoSettle
        );
    }
}
