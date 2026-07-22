import unittest
from unittest.mock import patch

import daemon


class ConfigTests(unittest.TestCase):
    def test_rejects_placeholder_identity_and_key(self):
        cfg = daemon.Config({
            "llm": {
                "base_url": "https://example.com/v1",
                "api_key": "在此填入你的 API Key",
                "model": "example-model",
            },
            "own_name": "在此填入你的微信昵称",
        })

        errors = cfg.validation_errors()

        self.assertTrue(any("own_name" in error for error in errors))
        self.assertTrue(any("api_key" in error for error in errors))

    def test_normalizes_delay_and_polling_bounds(self):
        cfg = daemon.Config({
            "rules": {"reply_delay_ms": [1200, 400]},
            "poll_interval": 0,
        })

        self.assertEqual(cfg.reply_delay_ms, (400, 1200))
        self.assertEqual(cfg.poll_interval, 0.5)
        with patch("daemon.random.uniform", return_value=800) as uniform:
            self.assertEqual(cfg.reply_delay_seconds(), 0.8)
        uniform.assert_called_once_with(400, 1200)


class SeenStateTests(unittest.TestCase):
    def test_normalize_seen_preserves_recent_order(self):
        raw = ["old", "duplicate", "duplicate", "new"]

        self.assertEqual(daemon.normalize_seen(raw), ["old", "duplicate", "new"])

    def test_remember_seen_evicts_oldest_entry(self):
        order = [f"message-{index}" for index in range(daemon.MAX_SEEN_MESSAGES)]
        seen = set(order)

        daemon.remember_seen(order, seen, "latest")

        self.assertEqual(len(order), daemon.MAX_SEEN_MESSAGES)
        self.assertNotIn("message-0", seen)
        self.assertEqual(order[-1], "latest")


class MessageClassificationTests(unittest.TestCase):
    def test_maps_own_message_to_stable_role(self):
        self.assertEqual(daemon.classify_sender("号主", "号主：已经处理"), "我")

    def test_maps_contact_message_to_user_role(self):
        self.assertEqual(daemon.classify_sender("号主", "客户：还在吗"), "对方")


if __name__ == "__main__":
    unittest.main()
