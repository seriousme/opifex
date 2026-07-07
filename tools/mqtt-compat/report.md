## 📊 MQTT Compatibility Report

Opifex tested against the
[Eclipse Paho interoperability suite](https://github.com/eclipse-paho/paho.mqtt.testing)
(the vendor-neutral broker conformance suite used by Mosquitto, EMQX,
mochi-mqtt, …).

| Protocol   | Compatibility | Passed | Total |
| ---------- | ------------- | ------ | ----- |
| MQTT 5.0   | **0%**        | 0      | 26    |
| MQTT 3.1.1 | **80%**       | 8      | 10    |

<details><summary>MQTT 5.0 — 0/26 passed (4 expected gaps)</summary>

| Test                             | Result         | Notes                                                                                                                                                                                                                                                                                |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test_assigned_clientid`         | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_basic`                     | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_client_topic_alias`        | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_dollar_topics`             | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_flow_control1`             | 💥 ⚠️ expected | receiveMaximum is advertised but not yet enforced outbound                                                                                                                                                                                                                           |
| `test_flow_control2`             | ⏭️             | not evaluable under per-test isolation (reuses the persistent client id / background receiver the Paho suite only sets up in its single-process mode); the Paho reference broker also hangs it here. The receiveMaximum behaviour it probes is still measured by test_flow_control1. |
| `test_keepalive`                 | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_maximum_packet_size`       | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_offline_message_queueing`  | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_overlapping_subscriptions` | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_payload_format`            | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_publication_expiry`        | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_redelivery_on_reconnect`   | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_request_response`          | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_retained_message`          | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_server_keep_alive`         | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_server_topic_alias`        | 💥 ⚠️ expected | broker-assigned topic aliases are not implemented;spec-optional/MAY                                                                                                                                                                                                                  |
| `test_session_expiry`            | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_shared_subscriptions`      | 💥 ⚠️ expected | Opifex advertises sharedSubscriptionAvailable=false (deferred for now)                                                                                                                                                                                                               |
| `test_subscribe_failure`         | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_subscribe_identifiers`     | 💥 ⚠️ expected | a delivery matching multiple overlapping subscriptions echoes only one Subscription Identifier ( [MQTT-3.3.4-4])                                                                                                                                                                     |
| `test_subscribe_options`         | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_unsubscribe`               | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_user_properties`           | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_will_delay`                | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_will_message`              | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |
| `test_zero_length_clientid`      | 💥             | mqtt.formats.MQTTV5.MQTTV5.MQTTException: connect failed - socket closed, no connack                                                                                                                                                                                                 |

</details>

<details><summary>MQTT 3.1.1 — 8/10 passed</summary>

| Test                             | Result | Notes                         |
| -------------------------------- | ------ | ----------------------------- |
| `testBasic`                      | ✅     |                               |
| `test_dollar_topics`             | ❌     | AssertionError: False != True |
| `test_keepalive`                 | ✅     |                               |
| `test_offline_message_queueing`  | ✅     |                               |
| `test_overlapping_subscriptions` | ✅     |                               |
| `test_redelivery_on_reconnect`   | ✅     |                               |
| `test_retained_messages`         | ❌     | AssertionError: False != True |
| `test_subscribe_failure`         | ✅     |                               |
| `test_unsubscribe`               | ✅     |                               |
| `test_zero_length_clientid`      | ✅     |                               |

</details>

<sub>⚠️ expected = a feature Opifex intentionally does not implement yet,
counted as a failure in the raw percentage. 🎉 update gaps = an expected gap
that now passes — update `EXPECTED_GAPS`.</sub>
