use crate::api::AppState;
use chrono::{DateTime, Days, NaiveDate, Utc};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use tauri::State;
use void_core::service::token_usage::TokenUsageRecord;

const ACTIVITY_DAYS: u64 = 365;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyTokenUsage {
    pub date: NaiveDate,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountUsageOverview {
    pub source: &'static str,
    pub generated_at: DateTime<Utc>,
    pub record_count: usize,
    pub first_recorded_at: Option<DateTime<Utc>>,
    pub last_recorded_at: Option<DateTime<Utc>>,
    pub total_tokens: u64,
    pub peak_daily_tokens: u64,
    pub active_days: u32,
    pub current_streak_days: u32,
    pub longest_streak_days: u32,
    pub daily: Vec<DailyTokenUsage>,
}

#[tauri::command]
pub async fn get_account_usage_overview(
    app_state: State<'_, AppState>,
) -> Result<AccountUsageOverview, String> {
    let now = Utc::now();
    let end_date = now.date_naive();
    let start_date = end_date
        .checked_sub_days(Days::new(ACTIVITY_DAYS - 1))
        .unwrap_or(end_date);
    let records = app_state
        .token_usage_service
        .query_all_persisted_records(true)
        .await
        .map_err(|error| format!("Failed to load account usage records: {error}"))?;

    Ok(build_account_usage_overview(
        records, start_date, end_date, now,
    ))
}

fn build_account_usage_overview(
    records: Vec<TokenUsageRecord>,
    start_date: NaiveDate,
    end_date: NaiveDate,
    generated_at: DateTime<Utc>,
) -> AccountUsageOverview {
    let mut totals_by_day = BTreeMap::<NaiveDate, u64>::new();
    let record_count = records.len();
    let first_recorded_at = records.first().map(|record| record.timestamp);
    let last_recorded_at = records.last().map(|record| record.timestamp);
    let total_tokens = records
        .iter()
        .map(|record| record.total_tokens as u64)
        .sum();
    for record in &records {
        *totals_by_day
            .entry(record.timestamp.date_naive())
            .or_default() += record.total_tokens as u64;
    }

    let active_dates = totals_by_day
        .iter()
        .filter_map(|(date, tokens)| (*tokens > 0).then_some(*date))
        .collect::<HashSet<_>>();
    let daily = build_daily_series(&totals_by_day, start_date, end_date);
    let peak_daily_tokens = totals_by_day
        .iter()
        .map(|(_, tokens)| *tokens)
        .max()
        .unwrap_or_default();
    let (current_streak_days, longest_streak_days) = calculate_streaks(&active_dates, end_date);

    AccountUsageOverview {
        source: "device_token_usage_records",
        generated_at,
        record_count,
        first_recorded_at,
        last_recorded_at,
        total_tokens,
        peak_daily_tokens,
        active_days: active_dates.len() as u32,
        current_streak_days,
        longest_streak_days,
        daily,
    }
}

fn build_daily_series(
    totals_by_day: &BTreeMap<NaiveDate, u64>,
    start_date: NaiveDate,
    end_date: NaiveDate,
) -> Vec<DailyTokenUsage> {
    let mut daily = Vec::new();
    let mut date = start_date;
    while date <= end_date {
        daily.push(DailyTokenUsage {
            date,
            total_tokens: totals_by_day.get(&date).copied().unwrap_or_default(),
        });
        let Some(next) = date.succ_opt() else {
            break;
        };
        date = next;
    }
    daily
}

fn calculate_streaks(active_dates: &HashSet<NaiveDate>, end_date: NaiveDate) -> (u32, u32) {
    let mut longest = 0u32;
    let mut running = 0u32;
    let mut previous: Option<NaiveDate> = None;
    let mut ordered_dates = active_dates.iter().copied().collect::<Vec<_>>();
    ordered_dates.sort_unstable();
    for date in ordered_dates {
        running = if previous.and_then(|value| value.succ_opt()) == Some(date) {
            running + 1
        } else {
            1
        };
        longest = longest.max(running);
        previous = Some(date);
    }

    let current_anchor = if active_dates.contains(&end_date) {
        end_date
    } else {
        end_date.pred_opt().unwrap_or(end_date)
    };
    let mut current = 0u32;
    let mut cursor = current_anchor;
    while active_dates.contains(&cursor) {
        current += 1;
        let Some(previous) = cursor.pred_opt() else {
            break;
        };
        cursor = previous;
    }

    (current, longest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn record(date: &str, total_tokens: u32) -> TokenUsageRecord {
        TokenUsageRecord {
            model_id: "test-model".to_string(),
            session_id: "session".to_string(),
            turn_id: date.to_string(),
            timestamp: Utc.from_utc_datetime(
                &NaiveDate::parse_from_str(date, "%Y-%m-%d")
                    .unwrap()
                    .and_hms_opt(12, 0, 0)
                    .unwrap(),
            ),
            input_tokens: total_tokens,
            output_tokens: 0,
            cached_tokens: 0,
            cached_tokens_available: false,
            cache_write_tokens: 0,
            total_tokens,
            token_details: None,
            is_subagent: false,
        }
    }

    #[test]
    fn builds_dense_daily_series_and_streaks_from_real_records() {
        let start = NaiveDate::from_ymd_opt(2026, 7, 19).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 7, 23).unwrap();
        let generated_at = Utc.with_ymd_and_hms(2026, 7, 23, 13, 0, 0).unwrap();
        let overview = build_account_usage_overview(
            vec![
                record("2026-07-19", 10),
                record("2026-07-21", 20),
                record("2026-07-22", 30),
            ],
            start,
            end,
            generated_at,
        );

        assert_eq!(overview.source, "device_token_usage_records");
        assert_eq!(overview.record_count, 3);
        assert_eq!(overview.total_tokens, 60);
        assert_eq!(overview.peak_daily_tokens, 30);
        assert_eq!(overview.active_days, 3);
        assert_eq!(overview.current_streak_days, 2);
        assert_eq!(overview.longest_streak_days, 2);
        assert_eq!(overview.daily.len(), 5);
        assert_eq!(overview.daily[1].total_tokens, 0);
    }
}
