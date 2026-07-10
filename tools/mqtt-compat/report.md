## 📊 MQTT Compatibility Report

Opifex tested against the [Eclipse Paho interoperability suite](https://github.com/eclipse-paho/paho.mqtt.testing) (the vendor-neutral broker conformance suite used by Mosquitto, EMQX, mochi-mqtt, …).

| Protocol | Compatibility | Passed | Total |
|----------|---------------|--------|-------|
| MQTT 3.1.1 | **100%** | 10 | 10 |

<details><summary>MQTT 3.1.1 — 10/10 passed</summary>

| Test | Result | Notes |
|------|--------|-------|
| `testBasic` | ✅ |  |
| `test_dollar_topics` | ✅ |  |
| `test_keepalive` | ✅ |  |
| `test_offline_message_queueing` | ✅ |  |
| `test_overlapping_subscriptions` | ✅ |  |
| `test_redelivery_on_reconnect` | ✅ |  |
| `test_retained_messages` | ✅ |  |
| `test_subscribe_failure` | ✅ |  |
| `test_unsubscribe` | ✅ |  |
| `test_zero_length_clientid` | ✅ |  |

</details>

<sub>⚠️ expected = a feature Opifex intentionally does not implement yet, counted as a failure in the raw percentage. 🎉 update gaps = an expected gap that now passes — update `EXPECTED_GAPS`.</sub>
