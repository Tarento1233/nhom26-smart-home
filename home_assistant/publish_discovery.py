"""Khai báo 6 thiết bị của đề tài cho Home Assistant qua MQTT Discovery.

Chạy: python publish_discovery.py            (tạo/cập nhật thiết bị)
      python publish_discovery.py --remove   (xoá thiết bị khỏi Home Assistant)
Yêu cầu: pip install paho-mqtt
"""
import json
import sys
import time
from pathlib import Path
import os

import paho.mqtt.client as mqtt

SECURITY=Path(os.environ.get('IOT_SECURITY_FILE',Path(__file__).resolve().parents[1]/'node_red/data/security.json'))
if not SECURITY.exists():
    raise SystemExit('Chạy khoi_dong_node_red.bat trước để tạo tài khoản MQTT trên máy này.')
SETTINGS=json.loads(SECURITY.read_text(encoding='utf-8-sig'))
ACCOUNT=next(a for a in SETTINGS['accounts'] if a['role']=='integration')
BASE=SETTINGS['baseTopic']
GROUP=BASE.split('/')[0]
BROKER = "127.0.0.1"
# Home Assistant phải đặt Discovery prefix trùng giá trị này.
DISCOVERY_PREFIX = f"{GROUP}/ha"

AVAIL = {
    "availability_topic": f"{BASE}/status",
    "payload_available": "online",
    "payload_not_available": "offline",
}
uid = GROUP.lower()

ENTITIES = [
    ("light", f"{uid}_room1_light", {
        "name": "Den phong",
        "command_topic": f"{BASE}/controller/actuator/light/cmd",
        "payload_on": '{"cmd":"ON"}',
        "payload_off": '{"cmd":"OFF"}',
        "state_topic": f"{BASE}/actuator/light/state",
        # light so trạng thái với payload_on/payload_off nên phải đổi "ON" thành đúng chuỗi lệnh
        "state_value_template": "{{ '{\"cmd\":\"ON\"}' if value_json.state == 'ON' else '{\"cmd\":\"OFF\"}' }}",
        **AVAIL,
    }),
    ("switch", f"{uid}_room1_ac", {
        "name": "May lanh",
        "command_topic": f"{BASE}/controller/actuator/ac/cmd",
        "payload_on": '{"cmd":"ON"}',
        "payload_off": '{"cmd":"OFF"}',
        "state_topic": f"{BASE}/actuator/ac/state",
        "value_template": "{{ value_json.state }}",
        "state_on": "ON",
        "state_off": "OFF",
        **AVAIL,
    }),
    ("sensor", f"{uid}_room1_temp", {
        "name": "Nhiet do phong",
        "state_topic": f"{BASE}/sensor/temp_humid",
        "value_template": "{{ value_json.temp }}",
        "unit_of_measurement": "°C",
        "device_class": "temperature",
        "state_class": "measurement",
    }),
    ("sensor", f"{uid}_room1_hum", {
        "name": "Do am phong",
        "state_topic": f"{BASE}/sensor/temp_humid",
        "value_template": "{{ value_json.hum }}",
        "unit_of_measurement": "%",
        "device_class": "humidity",
        "state_class": "measurement",
    }),
    ("sensor", f"{uid}_room1_lux", {
        "name": "Anh sang phong",
        "state_topic": f"{BASE}/sensor/light",
        "value_template": "{{ value_json.lux }}",
        "unit_of_measurement": "lx",
        "device_class": "illuminance",
        "state_class": "measurement",
    }),
    ("binary_sensor", f"{uid}_room1_motion", {
        "name": "Co nguoi",
        "state_topic": f"{BASE}/sensor/motion",
        "value_template": "{{ value_json.presence }}",
        "payload_on": "1",
        "payload_off": "0",
        "device_class": "occupancy",
    }),
]


def main():
    remove = "--remove" in sys.argv
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set(ACCOUNT['username'],ACCOUNT['password'])
    client.connect(BROKER, SETTINGS['mqtt']['port'], 30)
    client.loop_start()
    for component, object_id, config in ENTITIES:
        topic = f"{DISCOVERY_PREFIX}/{component}/{object_id}/config"
        payload = "" if remove else json.dumps({"unique_id": object_id, **config}, ensure_ascii=False)
        client.publish(topic, payload, qos=1, retain=True).wait_for_publish()
        print(("removed " if remove else "published ") + topic)
    time.sleep(1)
    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
