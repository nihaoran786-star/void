use crate::agentic::coordination::{ConversationCoordinator, SubagentExecutionRequest};
use crate::agentic::tools::pipeline::SubagentParentInfo;
use async_trait::async_trait;
use futures::stream::{FuturesUnordered, StreamExt};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use void_runtime_ports::{
    DelegationPolicy, MultitaskBranch, MultitaskBranchResult, MultitaskBranchResultStatus,
    MultitaskPlan, MultitaskRejectionReason, MultitaskSchedulerAction, MultitaskSchedulerDecision,
    MultitaskSchedulerDryRun, SubagentContextMode,
};

#[derive(Debug, Clone)]
pub struct MultitaskSchedulerOptions {
    pub forced_execution_enabled: bool,
    pub concurrency_limit: usize,
    pub completed_branch_ids: HashSet<String>,
}

impl Default for MultitaskSchedulerOptions {
    fn default() -> Self {
        Self {
            forced_execution_enabled: false,
            concurrency_limit: 3,
            completed_branch_ids: HashSet::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct MultitaskScheduler {
    options: MultitaskSchedulerOptions,
}

impl MultitaskScheduler {
    pub fn new(options: MultitaskSchedulerOptions) -> Self {
        Self { options }
    }

    pub fn dry_run(&self, plan: &MultitaskPlan) -> MultitaskSchedulerDryRun {
        let mut planned_branch_ids = Vec::new();
        let mut rejected_branch_ids = Vec::new();
        let mut rejection_reasons = Vec::new();
        let conflicts = write_scope_conflicts(plan);

        for branch in &plan.branches {
            let dependency_unfinished = branch
                .dependencies
                .iter()
                .any(|dependency| !self.options.completed_branch_ids.contains(dependency));
            let write_conflict = conflicts.contains(&branch.id);

            if dependency_unfinished {
                rejected_branch_ids.push(branch.id.clone());
                push_unique(
                    &mut rejection_reasons,
                    MultitaskRejectionReason::DependencyUnfinished,
                );
            } else if write_conflict {
                rejected_branch_ids.push(branch.id.clone());
                push_unique(
                    &mut rejection_reasons,
                    MultitaskRejectionReason::WriteScopeConflict,
                );
            } else {
                planned_branch_ids.push(branch.id.clone());
            }
        }

        if planned_branch_ids.len() < 2 {
            push_unique(
                &mut rejection_reasons,
                MultitaskRejectionReason::NoIndependentBranches,
            );
        }

        if self.options.concurrency_limit == 0 {
            push_unique(
                &mut rejection_reasons,
                MultitaskRejectionReason::ConcurrencyLimitUnavailable,
            );
        }

        MultitaskSchedulerDryRun {
            plan_id: plan.id.clone(),
            estimated_parallelism: planned_branch_ids
                .len()
                .min(self.options.concurrency_limit.max(1)),
            planned_branch_ids,
            rejected_branch_ids,
            rejection_reasons,
        }
    }

    pub fn decide(&self, plan: &MultitaskPlan) -> MultitaskSchedulerDecision {
        let mut dry_run = self.dry_run(plan);
        if !self.options.forced_execution_enabled {
            push_unique(
                &mut dry_run.rejection_reasons,
                MultitaskRejectionReason::ForcedExecutionDisabled,
            );
        }

        let action = if self.options.forced_execution_enabled
            && dry_run.rejection_reasons.is_empty()
            && dry_run.planned_branch_ids.len() >= 2
        {
            MultitaskSchedulerAction::ExecuteParallel
        } else {
            MultitaskSchedulerAction::FallbackToPromptGuided
        };

        MultitaskSchedulerDecision {
            plan_id: plan.id.clone(),
            action,
            dry_run,
        }
    }

    pub async fn launch_approved_branches<L>(
        &self,
        plan: &MultitaskPlan,
        decision: &MultitaskSchedulerDecision,
        launcher: Arc<L>,
        cancellation_token: CancellationToken,
    ) -> Vec<MultitaskBranchResult>
    where
        L: MultitaskBranchLauncher + 'static,
    {
        if decision.action != MultitaskSchedulerAction::ExecuteParallel {
            return decision
                .dry_run
                .planned_branch_ids
                .iter()
                .map(|branch_id| MultitaskBranchResult {
                    branch_id: branch_id.clone(),
                    status: MultitaskBranchResultStatus::Cancelled,
                    background_task_id: None,
                    output: None,
                    error: Some("multitask_parallel_execution_not_approved".to_string()),
                })
                .collect();
        }

        let branches_by_id: HashMap<&str, &MultitaskBranch> = plan
            .branches
            .iter()
            .map(|branch| (branch.id.as_str(), branch))
            .collect();
        let semaphore = Arc::new(Semaphore::new(self.options.concurrency_limit.max(1)));
        let mut futures = FuturesUnordered::new();

        for branch_id in &decision.dry_run.planned_branch_ids {
            let Some(branch) = branches_by_id.get(branch_id.as_str()) else {
                continue;
            };
            let branch = (*branch).clone();
            let launcher = launcher.clone();
            let semaphore = semaphore.clone();
            let cancellation_token = cancellation_token.clone();

            futures.push(async move {
                let permit = match semaphore.acquire_owned().await {
                    Ok(permit) => permit,
                    Err(error) => {
                        return MultitaskBranchResult {
                            branch_id: branch.id,
                            status: MultitaskBranchResultStatus::Failed,
                            background_task_id: None,
                            output: None,
                            error: Some(format!("failed_to_acquire_scheduler_permit: {error}")),
                        };
                    }
                };
                let _permit = permit;

                if cancellation_token.is_cancelled() {
                    return MultitaskBranchResult {
                        branch_id: branch.id,
                        status: MultitaskBranchResultStatus::Cancelled,
                        background_task_id: None,
                        output: None,
                        error: Some("multitask_schedule_cancelled".to_string()),
                    };
                }

                match launcher.launch_branch(&branch, &cancellation_token).await {
                    Ok(background_task_id) => MultitaskBranchResult {
                        branch_id: branch.id,
                        status: MultitaskBranchResultStatus::Completed,
                        background_task_id: Some(background_task_id),
                        output: None,
                        error: None,
                    },
                    Err(error) => MultitaskBranchResult {
                        branch_id: branch.id,
                        status: MultitaskBranchResultStatus::Failed,
                        background_task_id: None,
                        output: None,
                        error: Some(error),
                    },
                }
            });
        }

        let mut results = Vec::new();
        while let Some(result) = futures.next().await {
            results.push(result);
        }
        results
    }
}

#[async_trait]
pub trait MultitaskBranchLauncher: Send + Sync {
    async fn launch_branch(
        &self,
        branch: &MultitaskBranch,
        cancellation_token: &CancellationToken,
    ) -> Result<String, String>;
}

#[derive(Clone)]
pub struct MultitaskCoordinatorLauncher {
    coordinator: Arc<ConversationCoordinator>,
    parent_info: SubagentParentInfo,
    workspace_path: Option<String>,
    model_id: Option<String>,
    timeout_seconds: Option<u64>,
}

impl MultitaskCoordinatorLauncher {
    pub fn new(
        coordinator: Arc<ConversationCoordinator>,
        parent_info: SubagentParentInfo,
        workspace_path: Option<String>,
        model_id: Option<String>,
        timeout_seconds: Option<u64>,
    ) -> Self {
        Self {
            coordinator,
            parent_info,
            workspace_path,
            model_id,
            timeout_seconds,
        }
    }
}

#[async_trait]
impl MultitaskBranchLauncher for MultitaskCoordinatorLauncher {
    async fn launch_branch(
        &self,
        branch: &MultitaskBranch,
        cancellation_token: &CancellationToken,
    ) -> Result<String, String> {
        if cancellation_token.is_cancelled() {
            return Err("multitask_schedule_cancelled".to_string());
        }
        let mut context = HashMap::new();
        context.insert("multitaskBranchId".to_string(), branch.id.clone());
        context.insert("multitaskBranchGoal".to_string(), branch.goal.clone());

        let result = self
            .coordinator
            .start_background_subagent(
                SubagentExecutionRequest {
                    task_description: branch.goal.clone(),
                    context_mode: SubagentContextMode::Fresh,
                    subagent_type: branch
                        .subagent_type
                        .clone()
                        .or_else(|| Some("GeneralPurpose".to_string())),
                    workspace_path: self.workspace_path.clone(),
                    model_id: self.model_id.clone(),
                    subagent_parent_info: self.parent_info.clone(),
                    context,
                    delegation_policy: DelegationPolicy::top_level().spawn_child(),
                },
                self.timeout_seconds,
            )
            .await
            .map_err(|error| error.to_string())?;

        Ok(result.background_task_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MultitaskResumeSummary {
    pub completed_count: usize,
    pub failed_count: usize,
    pub cancelled_count: usize,
    pub guidance: String,
}

pub fn aggregate_branch_results(
    results: &[MultitaskBranchResult],
    goal_usage_limited: bool,
) -> MultitaskResumeSummary {
    let completed_count = results
        .iter()
        .filter(|result| result.status == MultitaskBranchResultStatus::Completed)
        .count();
    let failed_count = results
        .iter()
        .filter(|result| result.status == MultitaskBranchResultStatus::Failed)
        .count();
    let cancelled_count = results
        .iter()
        .filter(|result| result.status == MultitaskBranchResultStatus::Cancelled)
        .count();

    let guidance = if goal_usage_limited {
        "Goal token budget is usage-limited; do not start continuation work until the goal is resumed with budget."
            .to_string()
    } else if failed_count > 0 || cancelled_count > 0 {
        format!(
            "Multitask branches completed with partial failure: completed={}, failed={}, cancelled={}. Summarize successful branches and ask before retrying failed work.",
            completed_count, failed_count, cancelled_count
        )
    } else {
        format!(
            "All multitask branches completed successfully: completed={}. Merge results at the next safe turn boundary.",
            completed_count
        )
    };

    MultitaskResumeSummary {
        completed_count,
        failed_count,
        cancelled_count,
        guidance,
    }
}

fn write_scope_conflicts(plan: &MultitaskPlan) -> HashSet<String> {
    let mut owner_by_scope: HashMap<&str, &str> = HashMap::new();
    let mut conflicts = HashSet::new();

    for branch in &plan.branches {
        for scope in &branch.write_scopes {
            let normalized = scope.trim();
            if normalized.is_empty() {
                continue;
            }
            if let Some(existing_branch_id) = owner_by_scope.insert(normalized, &branch.id) {
                conflicts.insert(existing_branch_id.to_string());
                conflicts.insert(branch.id.clone());
            }
        }
    }

    conflicts
}

fn push_unique<T>(items: &mut Vec<T>, value: T)
where
    T: PartialEq,
{
    if !items.contains(&value) {
        items.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use void_runtime_ports::MultitaskBranchRisk;

    fn branch(id: &str, write_scopes: &[&str], dependencies: &[&str]) -> MultitaskBranch {
        MultitaskBranch {
            id: id.to_string(),
            goal: format!("work on {id}"),
            inputs: vec![],
            write_scopes: write_scopes.iter().map(|scope| scope.to_string()).collect(),
            dependencies: dependencies
                .iter()
                .map(|dependency| dependency.to_string())
                .collect(),
            risk: MultitaskBranchRisk::Low,
            subagent_type: Some("GeneralPurpose".to_string()),
        }
    }

    fn plan(branches: Vec<MultitaskBranch>) -> MultitaskPlan {
        MultitaskPlan {
            id: "plan-1".to_string(),
            branches,
        }
    }

    #[test]
    fn dry_run_accepts_independent_non_conflicting_branches() {
        let scheduler = MultitaskScheduler::new(MultitaskSchedulerOptions {
            forced_execution_enabled: true,
            concurrency_limit: 2,
            completed_branch_ids: HashSet::new(),
        });

        let dry_run = scheduler.dry_run(&plan(vec![
            branch("backend", &["src/crates/core"], &[]),
            branch("frontend", &["src/web-ui"], &[]),
        ]));

        assert_eq!(dry_run.planned_branch_ids, vec!["backend", "frontend"]);
        assert!(dry_run.rejection_reasons.is_empty());
        assert_eq!(dry_run.estimated_parallelism, 2);
    }

    #[test]
    fn dry_run_rejects_unfinished_dependencies_and_write_scope_conflicts() {
        let scheduler = MultitaskScheduler::new(MultitaskSchedulerOptions {
            forced_execution_enabled: true,
            concurrency_limit: 2,
            completed_branch_ids: HashSet::new(),
        });

        let dry_run = scheduler.dry_run(&plan(vec![
            branch("backend-a", &["src/crates/core"], &[]),
            branch("backend-b", &["src/crates/core"], &[]),
            branch("docs", &["docs"], &["backend-a"]),
        ]));

        assert!(dry_run
            .rejection_reasons
            .contains(&MultitaskRejectionReason::WriteScopeConflict));
        assert!(dry_run
            .rejection_reasons
            .contains(&MultitaskRejectionReason::DependencyUnfinished));
        assert_eq!(
            dry_run.rejected_branch_ids,
            vec!["backend-a", "backend-b", "docs"]
        );
    }

    #[test]
    fn decision_falls_back_when_forced_execution_is_disabled() {
        let scheduler = MultitaskScheduler::new(MultitaskSchedulerOptions {
            forced_execution_enabled: false,
            concurrency_limit: 2,
            completed_branch_ids: HashSet::new(),
        });

        let decision = scheduler.decide(&plan(vec![
            branch("backend", &["src/crates/core"], &[]),
            branch("frontend", &["src/web-ui"], &[]),
        ]));

        assert_eq!(
            decision.action,
            MultitaskSchedulerAction::FallbackToPromptGuided
        );
        assert!(decision
            .dry_run
            .rejection_reasons
            .contains(&MultitaskRejectionReason::ForcedExecutionDisabled));
    }

    #[tokio::test]
    async fn launch_approved_branches_uses_launcher_and_records_failures() {
        struct FakeLauncher {
            calls: AtomicUsize,
        }

        #[async_trait]
        impl MultitaskBranchLauncher for FakeLauncher {
            async fn launch_branch(
                &self,
                branch: &MultitaskBranch,
                _cancellation_token: &CancellationToken,
            ) -> Result<String, String> {
                self.calls.fetch_add(1, Ordering::SeqCst);
                if branch.id == "frontend" {
                    Err("frontend failed".to_string())
                } else {
                    Ok(format!("bg-{}", branch.id))
                }
            }
        }

        let scheduler = MultitaskScheduler::new(MultitaskSchedulerOptions {
            forced_execution_enabled: true,
            concurrency_limit: 2,
            completed_branch_ids: HashSet::new(),
        });
        let plan = plan(vec![
            branch("backend", &["src/crates/core"], &[]),
            branch("frontend", &["src/web-ui"], &[]),
        ]);
        let decision = scheduler.decide(&plan);

        let results = scheduler
            .launch_approved_branches(
                &plan,
                &decision,
                Arc::new(FakeLauncher {
                    calls: AtomicUsize::new(0),
                }),
                CancellationToken::new(),
            )
            .await;

        assert_eq!(results.len(), 2);
        assert!(results
            .iter()
            .any(|result| result.status == MultitaskBranchResultStatus::Completed));
        assert!(results
            .iter()
            .any(|result| result.status == MultitaskBranchResultStatus::Failed));
    }

    #[test]
    fn aggregation_respects_goal_usage_limited_state() {
        let summary = aggregate_branch_results(
            &[MultitaskBranchResult {
                branch_id: "backend".to_string(),
                status: MultitaskBranchResultStatus::Completed,
                background_task_id: Some("bg-backend".to_string()),
                output: None,
                error: None,
            }],
            true,
        );

        assert_eq!(summary.completed_count, 1);
        assert!(summary.guidance.contains("usage-limited"));
    }

    #[test]
    fn aggregation_reports_all_success() {
        let summary = aggregate_branch_results(
            &[
                MultitaskBranchResult {
                    branch_id: "backend".to_string(),
                    status: MultitaskBranchResultStatus::Completed,
                    background_task_id: Some("bg-backend".to_string()),
                    output: Some("backend done".to_string()),
                    error: None,
                },
                MultitaskBranchResult {
                    branch_id: "frontend".to_string(),
                    status: MultitaskBranchResultStatus::Completed,
                    background_task_id: Some("bg-frontend".to_string()),
                    output: Some("frontend done".to_string()),
                    error: None,
                },
            ],
            false,
        );

        assert_eq!(summary.completed_count, 2);
        assert_eq!(summary.failed_count, 0);
        assert_eq!(summary.cancelled_count, 0);
        assert!(summary
            .guidance
            .contains("All multitask branches completed successfully"));
    }

    #[test]
    fn aggregation_reports_partial_failure_and_cancellation() {
        let summary = aggregate_branch_results(
            &[
                MultitaskBranchResult {
                    branch_id: "backend".to_string(),
                    status: MultitaskBranchResultStatus::Completed,
                    background_task_id: Some("bg-backend".to_string()),
                    output: Some("backend done".to_string()),
                    error: None,
                },
                MultitaskBranchResult {
                    branch_id: "frontend".to_string(),
                    status: MultitaskBranchResultStatus::Failed,
                    background_task_id: None,
                    output: None,
                    error: Some("frontend failed".to_string()),
                },
                MultitaskBranchResult {
                    branch_id: "docs".to_string(),
                    status: MultitaskBranchResultStatus::Cancelled,
                    background_task_id: None,
                    output: None,
                    error: Some("cancelled".to_string()),
                },
            ],
            false,
        );

        assert_eq!(summary.completed_count, 1);
        assert_eq!(summary.failed_count, 1);
        assert_eq!(summary.cancelled_count, 1);
        assert!(summary.guidance.contains("partial failure"));
    }
}
