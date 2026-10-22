"""ESP32 giả để thử Home Assistant / trang giọng nói khi Wokwi chưa chạy. Không dùng khi demo thật.

Chạy: python gia_lap_esp32.py   (Ctrl+C để dừng)
"""
import json
import random
import sys
import time

import paho.mqtt.client as mqtt

sys.stdout.reconfigure(encoding="utf-8")
BASE = "nhom26/room1"
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
c.will_set(f"{BASE}/status", "offline", retain=True)
c.on_connect = on_connect
c.on_message = on_message
c.connect("broker.hivemq.com", 1883, 30)
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
