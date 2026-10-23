"""ESP32 giả để thử Home Assistant / trang giọng nói khi Wokwi chưa chạy. Không dùng khi demo thật.

Chạy: python gia_lap_esp32.py   (Ctrl+C để dừng)
"""
import json
import random
import sys
import time
from pathlib import Path
import os

import paho.mqtt.client as mqtt

sys.stdout.reconfigure(encoding="utf-8")
security=Path(os.environ.get('IOT_SECURITY_FILE',Path(__file__).resolve().parents[1]/'node_red/data/security.json'))
if not security.exists():
    raise SystemExit('Chạy khoi_dong_node_red.bat trước để tạo tài khoản MQTT.')
config=json.loads(security.read_text(encoding='utf-8-sig'))
account=next(a for a in config['accounts'] if a['role']=='device')
BASE = config['baseTopic']
state ={"light": "OFF", "ac": "OFF"}


def publish_state(c):
    for dev in state:
        c.publish(f"{BASE}/actuator/{dev}/state", json.dumps({"state": state[dev]}), retain=True)


def on_connect(c, userdata, flags, rc, props=None):
    c.publish(f"{BASE}/status", "online", retain=True)
    c.subscribe(f"{BASE}/actuator/+/cmd")
    publish_state(c)
    print("ESP32 giả đã online", flush=True)


def on_message(c, userdata, msg):
    dev = msg.topic.split("/")[3]
    text = msg.payload.decode().upper()
    if "OFF" in text:
        state[dev] = "OFF"
    elif "ON" in text:
        state[dev] = "ON"
    print(f"Nhận lệnh {dev} -> {state[dev]}", flush=True)
    publish_state(c)


c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
c.username_pw_set(account['username'],account['password'])
c.will_set(f"{BASE}/status", "offline", retain=True)
c.on_connect = on_connect
c.on_message = on_message
c.connect("127.0.0.1", config['mqtt']['port'], 30)
c.loop_start()
try:
    while True:
        temp = round(random.uniform(27.0, 31.0), 1)
        c.publish(f"{BASE}/sensor/temp_humid", json.dumps({"temp": temp, "hum": random.randint(55, 70)}), retain=True)
        c.publish(f"{BASE}/sensor/light", json.dumps({"lux": random.randint(80, 400)}), retain=True)
        time.sleep(5)
except KeyboardInterrupt:
    c.publish(f"{BASE}/status", "offline", retain=True).wait_for_publish()
    c.loop_stop()
