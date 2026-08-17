use std::time::Duration;

use tokio::sync::watch;
use tokio::time::{sleep_until, Instant};

const RETRY_DELAYS_SECS: [u64; 5] = [5, 10, 20, 40, 60];

/// Capped exponential retry policy for long-running bot polling loops.
///
/// The delay stays capped at the final entry until a successful response
/// explicitly resets the policy.
#[derive(Debug, Default)]
pub(super) struct RetryBackoff {
    next_delay_index: usize,
}

impl RetryBackoff {
    pub(super) fn next_delay(&mut self) -> Duration {
        let index = self
            .next_delay_index
            .min(RETRY_DELAYS_SECS.len().saturating_sub(1));
        self.next_delay_index = self.next_delay_index.saturating_add(1);
        Duration::from_secs(RETRY_DELAYS_SECS[index])
    }

    pub(super) fn reset(&mut self) {
        self.next_delay_index = 0;
    }
}

/// Convert an absolute millisecond deadline into one remaining sleep.
pub(super) fn remaining_until_ms(deadline_ms: i64, now_ms: i64) -> Option<Duration> {
    let remaining_ms = deadline_ms.saturating_sub(now_ms);
    (remaining_ms > 0).then(|| Duration::from_millis(remaining_ms as u64))
}

/// Sleep until `duration` elapses or the stop channel requests shutdown.
///
/// Returns `true` when shutdown was requested or every sender was dropped.
/// The current value and closed state are checked before parking, and the
/// absolute deadline is retained across irrelevant `false` updates so a
/// notification cannot shorten the requested delay.
pub(super) async fn sleep_or_stop(stop_rx: &mut watch::Receiver<bool>, duration: Duration) -> bool {
    let deadline = Instant::now() + duration;

    loop {
        if *stop_rx.borrow() || stop_rx.has_changed().is_err() {
            return true;
        }

        tokio::select! {
            biased;
            changed = stop_rx.changed() => {
                match changed {
                    Ok(()) if *stop_rx.borrow() => return true,
                    Ok(()) => continue,
                    Err(_) => return true,
                }
            }
            _ = sleep_until(deadline) => {
                return *stop_rx.borrow() || stop_rx.has_changed().is_err();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_backoff_grows_caps_and_resets() {
        let mut backoff = RetryBackoff::default();
        let delays: Vec<_> = (0..7).map(|_| backoff.next_delay()).collect();

        assert_eq!(delays, [5, 10, 20, 40, 60, 60, 60].map(Duration::from_secs));

        backoff.reset();
        assert_eq!(backoff.next_delay(), Duration::from_secs(5));
    }

    #[test]
    fn pause_deadline_becomes_one_remaining_duration() {
        assert_eq!(
            remaining_until_ms(61_000, 1_000),
            Some(Duration::from_secs(60))
        );
        assert_eq!(remaining_until_ms(1_000, 1_000), None);
        assert_eq!(remaining_until_ms(999, 1_000), None);
    }

    #[tokio::test]
    async fn sleep_or_stop_returns_for_preexisting_stop() {
        let (stop_tx, mut stop_rx) = watch::channel(false);
        stop_tx.send(true).unwrap();

        let stopped = tokio::time::timeout(
            Duration::from_millis(100),
            sleep_or_stop(&mut stop_rx, Duration::from_secs(60)),
        )
        .await
        .expect("preexisting stop must not sleep");

        assert!(stopped);
    }

    #[tokio::test]
    async fn sleep_or_stop_interrupts_an_active_wait() {
        let (stop_tx, mut stop_rx) = watch::channel(false);
        let waiter =
            tokio::spawn(async move { sleep_or_stop(&mut stop_rx, Duration::from_secs(60)).await });
        tokio::task::yield_now().await;
        stop_tx.send(true).unwrap();

        let stopped = tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("stop must interrupt retry or pause wait")
            .expect("wait task must complete");

        assert!(stopped);
    }

    #[tokio::test]
    async fn sleep_or_stop_treats_a_closed_channel_as_stop() {
        let (stop_tx, mut stop_rx) = watch::channel(false);
        drop(stop_tx);

        assert!(sleep_or_stop(&mut stop_rx, Duration::from_secs(60)).await);
    }

    #[tokio::test]
    async fn false_updates_do_not_end_the_wait() {
        let (stop_tx, mut stop_rx) = watch::channel(false);
        let mut waiter = Box::pin(sleep_or_stop(&mut stop_rx, Duration::from_secs(60)));

        stop_tx.send(false).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(25), &mut waiter)
                .await
                .is_err(),
            "an irrelevant false update must preserve the original deadline"
        );

        stop_tx.send(true).unwrap();
        assert!(tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("stop must still interrupt after a false update"));
    }

    #[tokio::test]
    async fn sleep_or_stop_reports_elapsed_wait() {
        let (_stop_tx, mut stop_rx) = watch::channel(false);

        assert!(!sleep_or_stop(&mut stop_rx, Duration::from_millis(1)).await);
    }
}
