"""Run the actual Node-RED flow with an MQTT device emulator on a unique test prefix.

Requires paho-mqtt and the installed node_red dependencies. Never publishes test
sensor data or actuator commands to nhom26/room1. Test logs are kept separately.
"""
import csv
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import socket

import paho.mqtt.client as mqtt

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
NR = ROOT / "node_red"
DATA = NR / "data"
DATA.mkdir(exist_ok=True)
BASE = "nhom26/test-" + uuid.uuid4().hex[:12]
PORT = 1881
URL = f"http://127.0.0.1:{PORT}"
CHECKS = []
process = None
client = None
operator = None
SECURITY = DATA / ("test-security-" + BASE.split("/")[-1] + ".json")
DB_FILE = DATA / ("test-database-" + BASE.split("/")[-1] + ".sqlite")
MQTT_PORT = 1885
WS_PORT = 1886
server_log = None
stopping = threading.Event()
lock = threading.Lock()
values = {"temp": 25, "hum": 60, "lux": 1000, "motion": 0}
device_states = {"light": "OFF", "ac": "OFF"}
commands = []
heartbeat_enabled = True
model_enabled = False
model_seq = 0
environment_commands_enabled = True


def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers={"Content-Type":"application/json"}
    if SECURITY.exists():
        headers["Authorization"]="Bearer "+json.loads(SECURITY.read_text())["serviceToken"]
    req = Request(URL + path, data=data, headers=headers)
    with urlopen(req, timeout=5) as response:
        content = response.read().decode("utf-8-sig")
        return json.loads(content) if "json" in response.headers.get("Content-Type", "") else content


def state():
    return request("/api/status")


def control(kind, value):
    return request("/api/control", {"kind": kind, "value": value})


def wait_for(predicate, description, timeout=15):
    until = time.monotonic() + timeout
    last = None
    while time.monotonic() < until:
        try:
            last = state()
            if predicate(last):
                return last
        except (URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(0.3)
    raise AssertionError(f"Timeout: {description}. Last state: {last}")


def check(description, condition=True):
    assert condition, description
    CHECKS.append(description)
    print("PASS:", description, flush=True)


def start_server():
    global process, server_log
    env = os.environ.copy()
    env.update(IOT_MQTT_BASE=BASE, IOT_LOG_FILE=str(DATA / (BASE.split('/')[-1]+'.csv')), PORT=str(PORT),
               IOT_PREFERENCES_DIR=str(DATA / ('test-preferences-' + BASE.split('/')[-1])),
               IOT_SECURITY_FILE=str(SECURITY),IOT_DB_FILE=str(DB_FILE),IOT_MQTT_TCP_PORT=str(MQTT_PORT),IOT_MQTT_WS_PORT=str(WS_PORT),IOT_DISABLE_PROVISIONER='1')
    node = shutil.which("node")
    assert node, "Node.js is required"
    server_log = (DATA / "test-e2e-node-red.log").open("a", encoding="utf-8")
    process = subprocess.Popen(
        [node,"--max-old-space-size=384",str(NR / "node-red-service.cjs")],
        cwd=NR, env=env, stdout=server_log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    until = time.monotonic() + 60
    while time.monotonic() < until:
        if process.poll() is not None:
            raise RuntimeError('Node-RED exited during startup; see test-e2e-node-red.log')
        try:
            request('/healthz')
            runtime = request('/flows/state')
            if runtime.get('state') != 'start':
                request('/flows/state', {'state': 'start'})
            break
        except (URLError, TimeoutError, ConnectionError):
            time.sleep(0.5)
    result = wait_for(lambda s: s.get("baseTopic") == BASE, "Node-RED starts with isolated MQTT prefix", 70)
    assert result["baseTopic"] == BASE
    wait_for(lambda s: s["brokerOnline"], "Node-RED authenticates with local MQTT", 45)


def stop_server():
    global process, server_log
    if process and process.poll() is None:
        try:
            request("/flows/state", {"state": "stop"})
        except Exception:
            pass
        process.terminate()
        process.wait(timeout=10)
    if server_log:
        server_log.close()
    process = server_log = None


def connect_emulator():
    global client, operator
    config=json.loads(SECURITY.read_text())
    device_account=next(a for a in config["accounts"] if a["role"]=="device")
    operator_account=next(a for a in config["accounts"] if a["role"]=="operator")
    operator=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id="n26-operator-"+uuid.uuid4().hex[:10])
    operator.username_pw_set(operator_account["username"],operator_account["password"])
    operator.connect("127.0.0.1",MQTT_PORT,30);operator.loop_start()
    addresses = ["127.0.0.1"]
    for address in addresses:
        connected = threading.Event()
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="n26-test-" + uuid.uuid4().hex[:10])
        c.username_pw_set(device_account["username"],device_account["password"])
        c.will_set(BASE + "/status", "offline", 1, True)

        def on_connect(conn, user, flags, reason, props):
            if not reason.is_failure:
                conn.subscribe(BASE + "/actuator/+/cmd", qos=1)
                conn.subscribe(BASE + "/environment/cmd", qos=1)
                connected.set()

        def on_message(conn, user, message):
            global model_enabled, model_seq
            if message.topic.endswith('/environment/cmd'):
                if not environment_commands_enabled:
                    return
                frame = message.payload.decode().split()
                with lock:
                    model_enabled = frame[0] == 'SIM'
                    if model_enabled:
                        model_seq = int(frame[1])
                        values.update(temp=float(frame[2]), hum=float(frame[3]), motion=int(frame[4]))
                conn.publish(BASE + '/environment/state', json.dumps({'protocol':1,'enabled':model_enabled,'seq':model_seq}), qos=1)
                return
            payload = json.loads(message.payload.decode())
            device = message.topic.split("/")[-2]
            with lock:
                device_states[device] = payload["cmd"]
                commands.append((time.monotonic(), device, payload["cmd"]))
            conn.publish(BASE + f"/actuator/{device}/state", json.dumps({"state": payload["cmd"]}), qos=1, retain=True)

        c.on_connect, c.on_message = on_connect, on_message
        try:
            c.connect(address, MQTT_PORT, 30)
            c.loop_start()
            if connected.wait(8):
                client = c
                print("MQTT emulator connected to", address, "under", BASE, flush=True)
                for device in device_states:
                    c.publish(BASE + f"/actuator/{device}/state", json.dumps({"state": "OFF"}), qos=1, retain=True)
                return
        except OSError:
            pass
        c.disconnect()
        c.loop_stop()
    raise RuntimeError("Local authenticated broker did not return a CONNACK")


def heartbeat():
    while not stopping.is_set():
        with lock:
            current = dict(values)
            enabled = heartbeat_enabled
            simulated, sequence = model_enabled, model_seq
        if enabled:
            for suffix, payload in [
                ("status", "online"),
                ("sensor/temp_humid", json.dumps({"temp": current["temp"], "hum": current["hum"], "source":"model" if simulated else "wokwi"})),
                ("sensor/light", json.dumps({"lux": current["lux"]})),
                ("sensor/motion", json.dumps({"presence": current["motion"]})),
                ("environment/state", json.dumps({'protocol':1,'enabled':simulated,'seq':sequence})),
            ]:
                client.publish(BASE + "/" + suffix, payload, qos=1, retain=True)
        stopping.wait(1)


def sensors(**changes):
    with lock:
        values.update(changes)


def device_connection(online):
    global heartbeat_enabled
    with lock:
        heartbeat_enabled = online
    client.publish(BASE + '/status', 'online' if online else 'offline', qos=1, retain=True).wait_for_publish(timeout=3)


def environment_delivery(enabled):
    global environment_commands_enabled
    environment_commands_enabled = enabled


try:
    print("Starting isolated Node-RED E2E run:", BASE, flush=True)
    start_server()
    from security_e2e import verify_security, verify_database
    saved_cookie=verify_security(URL,json.loads(SECURITY.read_text()),check)
    check("Actual Node-RED starts and authenticates with its private broker")
    connect_emulator()
    threading.Thread(target=heartbeat, daemon=True).start()
    wait_for(lambda s: s["status"] == "online", "fresh sensor heartbeat")
    control("clock", "day")
    check("HTTP API receives live MQTT telemetry", state()["temp"] == 25)

    sensors(motion=1)
    wait_for(lambda s: s["motion"] == 1, "PIR high")
    time.sleep(1)
    wait_for(lambda s: s['light']=='ON', 'presence switches on light even in a bright room')
    check("Presence switches light on regardless of brightness")
    sensors(lux=100, temp=29)
    wait_for(lambda s: s["light"] == "ON" and s["ac"] == "ON", "automatic ON commands and acknowledgements")
    check("Occupied warm room turns on light and AC through actual MQTT")
    check("Automatic command feedback does not switch to MANUAL", state()["mode"] == "AUTO")

    sensors(temp=27)
    wait_for(lambda s: s["temp"] == 27, "27C")
    check("AC stays enabled while cooling toward 25C", state()["ac"] == "ON")
    sensors(temp=25)
    wait_for(lambda s: s['temp']==25, 'target temperature')
    check("AC stays enabled at target 25C", state()['ac']=='ON')
    sensors(temp=24.5)
    wait_for(lambda s: s["ac"] == "OFF", "AC stops below target at 24.5C")
    check("AC pauses below 24.5C instead of cooling indefinitely")
    sensors(temp=29)
    wait_for(lambda s: s["ac"] == "ON", "AC turns on again")

    operator.publish(BASE + "/controller/actuator/light/cmd", '{"cmd":"OFF","source":"voice"}', qos=1)
    wait_for(lambda s: s["mode"] == "MANUAL" and s["light"] == "OFF", "voice command is prioritised")
    time.sleep(3)
    check("Voice/HA request enters MANUAL and is not overwritten", state()["light"] == "OFF")
    control("demo", True)
    control("mode", "AUTO")
    wait_for(lambda s: s["light"] == "ON", "resume AUTO")

    sensors(motion=0)
    wait_for(lambda s: s["motion"] == 0, "PIR low")
    wait_for(lambda s: s["light"] == "OFF" and s["ac"] == "ON", "immediate light OFF", 5)
    check("Absence switches light off immediately; AC keeps its grace period")
    wait_for(lambda s: s["ac"] == "OFF", "demo AC timeout", 20)
    check("Demo AC timeout is 15 seconds")
    control('light','ON')
    wait_for(lambda s: s['mode']=='MANUAL' and s['light']=='ON' and s['motion']==0, 'turn light on before arriving home')
    time.sleep(16)
    check('Manual light ON works in an empty room and survives the old demo expiry', state()['mode']=='MANUAL' and state()['light']=='ON' and state()['manualRemaining'] is None)
    control('mode','AUTO')
    wait_for(lambda s: s['mode']=='AUTO' and s['light']=='OFF', 'explicitly return to automatic absence lighting')

    sensors(motion=1, temp=29)
    wait_for(lambda s: s["motion"] == 1 and s["temp"] == 29, "new motion and 29C")
    control("clock", "night")
    wait_for(lambda s: s["mode"] == "SLEEP" and s["light"] == "ON" and s["ac"] == "ON", "night rule")
    check("23:00 SLEEP retains presence lighting and the 25C AC setpoint")
    control("light", "OFF")
    wait_for(lambda s: s["mode"] == "MANUAL" and s["light"] == "OFF", "manual night override")
    time.sleep(16)
    check('MANUAL stays selected at night until the user changes it', state()['mode']=='MANUAL' and state()['light']=='OFF')
    control('mode','AUTO')
    wait_for(lambda s: s['mode']=='SLEEP' and s['light']=='ON', 'explicitly return to the night schedule')
    check('Explicit AUTO returns to scheduled SLEEP and resumes automation')

    control('autoTemperature', 28)
    control('manualTemperature', 20)
    wait_for(lambda s: s['mode']=='SLEEP' and s['acTarget']==28 and s['acSettings']['manual']==20, 'save independent targets without changing SLEEP')
    operator.publish(BASE + '/controller/temperature/cmd', json.dumps({'profile':'manual','temperature':21,'source':'voice'}), qos=1).wait_for_publish()
    wait_for(lambda s: s['acSettings']['manual']==21 and s['mode']=='SLEEP', 'voice target MQTT request')
    check('HTTP and MQTT temperature requests save independent profiles without changing mode')
    try:
        control('autoTemperature', 15)
        raise AssertionError('Out-of-range temperature must be rejected')
    except HTTPError as error:
        check('Temperature below 16C is rejected with HTTP 400', error.code==400 and state()['acSettings']['auto']==28)
    time.sleep(2)  # Allow the file-backed preferences store to flush before restart.

    with lock:
        heartbeat_enabled = False
    client.publish(BASE + "/status", "offline", qos=1, retain=True).wait_for_publish()
    wait_for(lambda s: s["status"] == "offline", "offline LWT/status")
    try:
        control("light", "ON")
        raise AssertionError("Offline command should have been rejected")
    except HTTPError as error:
        check("Offline control is rejected with HTTP 400", error.code == 400)

    # Retained numbers must not make a restarted controller pretend the device is live.
    client.publish(BASE + "/status", "online", qos=1, retain=True).wait_for_publish()
    stop_server()
    count_before = len(commands)
    start_server()
    wait_for(lambda s: s["status"] == "stale", "retained data is stale after restart")
    check("Restart does not automate from retained telemetry", len(commands) == count_before)
    check('Both temperature profiles survive a controller restart', state()['acSettings']=={'auto':28,'manual':21})
    control('autoTemperature',25)
    control('manualTemperature',25)
    with lock:
        heartbeat_enabled = True
    wait_for(lambda s: s["status"] == "online", "recover after fresh heartbeat")
    check("Controller recovers when fresh telemetry resumes")
    verify_database(URL,request,saved_cookie,check)

    download = request("/api/log.csv")
    rows = list(csv.DictReader(io.StringIO(download)))
    assert rows and {"timestamp", "event", "mode", "temp", "humidity", "lux", "motion", "light", "ac", "detail"}.issubset(rows[0])
    check("CSV log records sensors, mode changes and control commands", any(r["event"].startswith("command:") for r in rows) and any(r["mode"] == "SLEEP" for r in rows))
    history = request("/api/history")
    check("SQLite history survives controller restart and is served by API", len(history) > 5)
    check("Dashboard and integrated voice page are served", 'app' in request('/dashboard/room') and 'rec.continuous = true' in request('/voice/voice.html'))
    if '--browser' in sys.argv:
        from dashboard_browser import verify_dashboard
        verify_dashboard(URL, state, wait_for, control, DATA, check, device_connection, environment_delivery, json.loads(SECURITY.read_text())["web"])
    report = {"baseTopic": BASE, "productionTopicUsed": False, "checks": CHECKS, "passed": len(CHECKS), "csvRows": len(rows)}
    (DATA / "test-e2e-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("E2E PASS:", len(CHECKS), "checks;", len(rows), "CSV rows", flush=True)
finally:
    stopping.set()
    stop_server()
    if client:
        client.disconnect()
        client.loop_stop()

    if operator:
        operator.disconnect()
        operator.loop_stop()
