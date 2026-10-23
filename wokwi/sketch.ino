#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>

// Đổi thành mã nhóm thật, phải trùng với configuration.yaml của Home Assistant
#define GROUP "nhom26"
#define BASE GROUP "/room1"

const char *WIFI_SSID = "Wokwi-GUEST";
const char *MQTT_HOST = "host.wokwi.internal";
uint16_t mqttPort = 1883;
String mqttUsername, mqttPassword, provisionNonce, serialLine;
unsigned long lastProvisionRequestMs = 0;

const int PIN_DHT = 4;
const int PIN_LDR = 34;
const int PIN_PIR = 27;
const int PIN_RELAY_LIGHT = 25;
const int PIN_RELAY_AC = 26;

const char *T_TEMP_HUMID = BASE "/sensor/temp_humid";
const char *T_LIGHT = BASE "/sensor/light";
const char *T_MOTION = BASE "/sensor/motion";
const char *T_LIGHT_STATE = BASE "/actuator/light/state";
const char *T_AC_STATE = BASE "/actuator/ac/state";
const char *T_LIGHT_CMD = BASE "/actuator/light/cmd";
const char *T_AC_CMD = BASE "/actuator/ac/cmd";
const char *T_STATUS = BASE "/status";
const char *T_MODE = BASE "/controller/mode";
const char *T_ENV_CMD = BASE "/environment/cmd";
const char *T_ENV_STATE = BASE "/environment/state";

WiFiClient net;
PubSubClient mqtt(net);
DHT dht(PIN_DHT, DHT22);
LiquidCrystal_I2C lcd(0x27, 16, 2);

bool lightOn = false;
bool acOn = false;
int lastPresence = -1;
float lastTemp = NAN;
float lastHum = NAN;
unsigned long lastSensorMs = 0;
unsigned long lastMqttTryMs = 0;
bool wasConnected = false;
String clientId;
String controlMode = "--";
int acTarget = 25;
bool environmentEnabled = false;
float environmentTemp = 30, environmentHumidity = 60;
int environmentPresence = 1;
unsigned long environmentSeq = 0, lastEnvironmentMs = 0;
void readAndPublishSensors();

int currentPresence() {
  return environmentEnabled ? environmentPresence : digitalRead(PIN_PIR);
}

void publishEnvironment() {
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"protocol\":1,\"enabled\":%s,\"seq\":%lu}",
           environmentEnabled ? "true" : "false", environmentSeq);
  mqtt.publish(T_ENV_STATE, buf, true);
}

float readLux() {
  // Công thức quy đổi của module quang trở Wokwi, điều chỉnh cho ADC 12-bit, nguồn 3.3V
  const float GAMMA = 0.7, RL10 = 50, VCC = 3.3;
  float voltage = analogRead(PIN_LDR) / 4095.0 * VCC;
  if (voltage >= VCC - 0.01) voltage = VCC - 0.01;
  if (voltage < 0.001) voltage = 0.001;
  // The module has a 10k fixed resistor; use the actual 3.3V supply.
  float resistance = 10000.0 * voltage / (VCC - voltage);
  return pow(RL10 * 1e3 * pow(10, GAMMA) / resistance, 1 / GAMMA);
}

void publishState() {
  mqtt.publish(T_LIGHT_STATE, lightOn ? "{\"state\":\"ON\"}" : "{\"state\":\"OFF\"}", true);
  mqtt.publish(T_AC_STATE, acOn ? "{\"state\":\"ON\"}" : "{\"state\":\"OFF\"}", true);
}

void updateLcd() {
  lcd.setCursor(0, 0);
  if (isnan(lastTemp)) {
    lcd.print("T:--.-C H:--%   ");
  } else {
    char line[17];
    snprintf(line, sizeof(line), "T:%4.1f S:%2d H:%2.0f", lastTemp, acTarget, lastHum);
    lcd.print(line);
  }
  lcd.setCursor(0, 1);
  char line2[17];
  snprintf(line2, sizeof(line2), "D%d A%d %-6s%s", lightOn ? 1 : 0, acOn ? 1 : 0, controlMode.c_str(),
           mqtt.connected() ? "OK" : "--");
  lcd.print(line2);
  for (size_t i = strlen(line2); i < 16; i++) lcd.print(' ');
  // Last cell identifies data from the automatic room model.
  if (environmentEnabled) { lcd.setCursor(15, 1); lcd.print('S'); }
}

void applyOutputs() {
  digitalWrite(PIN_RELAY_LIGHT, lightOn ? HIGH : LOW);
  digitalWrite(PIN_RELAY_AC, acOn ? HIGH : LOW);
  updateLcd();
}

// Nhận cả {"cmd":"ON"} lẫn ON trơn
bool parseOn(const String &msg, bool current) {
  String compact = msg;
  compact.replace(" ", "");
  compact.replace("\n", "");
  compact.replace("\r", "");
  compact.replace("\t", "");
  if (compact == "ON" || compact.indexOf("\"CMD\":\"ON\"") >= 0) return true;
  if (compact == "OFF" || compact.indexOf("\"CMD\":\"OFF\"") >= 0) return false;
  return current;
}

void onMessage(char *topic, byte *payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  msg.toUpperCase();
  Serial.printf("<- %s %s\n", topic, msg.c_str());

  if (strcmp(topic, T_ENV_CMD) == 0) {
    if (msg == "SENSOR") {
      environmentEnabled = false;
      environmentSeq = 0;
    } else {
      unsigned long seq;
      float temp, humidity;
      int presence;
      char trailing;
      if (sscanf(msg.c_str(), "SIM %lu %f %f %d %c", &seq, &temp, &humidity, &presence, &trailing) != 4 ||
          !isfinite(temp) || !isfinite(humidity) || temp < 16 || temp > 40 ||
          humidity < 30 || humidity > 80 || (presence != 0 && presence != 1)) {
        Serial.println("Invalid environment frame, ignored");
        return;
      }
      environmentEnabled = true;
      environmentSeq = seq;
      environmentTemp = temp;
      environmentHumidity = humidity;
      environmentPresence = presence;
      lastEnvironmentMs = millis();
    }
    publishEnvironment();
    readAndPublishSensors();
    return;
  }

  if (strcmp(topic, T_MODE) == 0) {
    int targetKey = msg.indexOf("\"TARGETTEMP\"");
    if (targetKey >= 0) {
      int colon = msg.indexOf(':', targetKey);
      int requested = colon >= 0 ? msg.substring(colon + 1).toInt() : 0;
      if (requested >= 16 && requested <= 31) acTarget = requested;
    }
    msg.replace(" ", "");
    msg.replace("\n", "");
    msg.replace("\r", "");
    msg.replace("\t", "");
    if (msg.indexOf("\"MODE\":\"MANUAL\"") >= 0) controlMode = "MANUAL";
    else if (msg.indexOf("\"MODE\":\"SLEEP\"") >= 0) controlMode = "SLEEP";
    else if (msg.indexOf("\"MODE\":\"AUTO\"") >= 0) controlMode = "AUTO";
    updateLcd();
    return;
  }

  if (strcmp(topic, T_LIGHT_CMD) == 0) lightOn = parseOn(msg, lightOn);
  else if (strcmp(topic, T_AC_CMD) == 0) acOn = parseOn(msg, acOn);
  else return;

  applyOutputs();
  publishState();
}

void connectMqtt() {
  Serial.printf("MQTT connecting as %s... ", clientId.c_str());
  // LWT: broker tự báo offline khi ESP32 mất kết nối
  if (mqtt.connect(clientId.c_str(), mqttUsername.c_str(), mqttPassword.c_str(), T_STATUS, 1, true, "offline")) {
    Serial.println("OK");
    wasConnected = true;
    mqtt.publish(T_STATUS, "online", true);
    mqtt.subscribe(T_LIGHT_CMD);
    mqtt.subscribe(T_AC_CMD);
    mqtt.subscribe(T_MODE);
    mqtt.subscribe(T_ENV_CMD);
    publishState();
    publishEnvironment();
    lastPresence = -1;
  } else {
    Serial.printf("failed rc=%d\n", mqtt.state());
  }
  updateLcd();
}

void readAndPublishSensors() {
  float t = environmentEnabled ? environmentTemp : dht.readTemperature();
  float h = environmentEnabled ? environmentHumidity : dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    lastTemp = t;
    lastHum = h;
    char buf[100];
    snprintf(buf, sizeof(buf), "{\"temp\":%.1f,\"hum\":%.0f,\"source\":\"%s\"}", lastTemp, lastHum,
             environmentEnabled ? "model" : "wokwi");
    mqtt.publish(T_TEMP_HUMID, buf, true);
  } else {
    Serial.println("DHT22 read error, skipped");
  }

  char buf[32];
  snprintf(buf, sizeof(buf), "{\"lux\":%.0f}", readLux());
  mqtt.publish(T_LIGHT, buf, true);
  // Heartbeats let Node-RED distinguish a running simulation from retained data.
  lastPresence = currentPresence();
  mqtt.publish(T_MOTION, lastPresence ? "{\"presence\":1}" : "{\"presence\":0}", true);
  mqtt.publish(T_STATUS, "online", true);
  publishEnvironment();
  updateLcd();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_RELAY_LIGHT, OUTPUT);
  pinMode(PIN_RELAY_AC, OUTPUT);
  analogReadResolution(12);
  dht.begin();

  lcd.init();
  lcd.backlight();
  lcd.print("Smart Home #1");
  lcd.setCursor(0, 1);
  lcd.print("WiFi...");

  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, "", 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(" WiFi OK");
  lcd.clear();

  // Wokwi luôn dùng cùng MAC và dãy số ngẫu nhiên có thể lặp lại giữa các lần chạy,
  // nên trộn thêm thời gian kết nối Wi-Fi (khác nhau mỗi lần) để 2 mô phỏng không trùng client id
  clientId = String(GROUP "-esp32-") + String((esp_random() ^ micros()) & 0xFFFFFF, HEX);

  provisionNonce = String(esp_random(), HEX);
  while (provisionNonce.length() < 8) provisionNonce = "0" + provisionNonce;
  mqtt.setServer(MQTT_HOST, mqttPort);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
  mqtt.setCallback(onMessage);
  applyOutputs();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      char nonce[17], username[41], password[65], extra;
      unsigned int port;
      if (sscanf(serialLine.c_str(), "N26_AUTH %16s %u %40s %64s %c", nonce, &port, username, password, &extra) == 4 &&
          provisionNonce == nonce && port > 0 && port <= 65535) {
        mqttUsername = username; mqttPassword = password; mqttPort = port;
        mqtt.setServer(MQTT_HOST, mqttPort);
        Serial.println("Da nhan tai khoan MQTT qua serial cuc bo");
      }
      serialLine = "";
    } else if (c != '\r') {
      if (serialLine.length() < 190) serialLine += c;
      else serialLine = "";
    }
  }
  if (mqttUsername.length() == 0) {
    if (millis() - lastProvisionRequestMs > 2000) {
      lastProvisionRequestMs = millis();
      Serial.printf("N26_PROVISION %s\n", provisionNonce.c_str());
    }
    return;
  }
  if (!mqtt.connected()) {
    if (wasConnected) {
      wasConnected = false;
      Serial.printf("MQTT lost, state=%d\n", mqtt.state());
    }
    if (millis() - lastMqttTryMs > 3000) {
      lastMqttTryMs = millis();
      connectMqtt();
    }
    return;
  }
  mqtt.loop();

  if (environmentEnabled && millis() - lastEnvironmentMs > 15000) {
    environmentEnabled = false;
    environmentSeq = 0;
    Serial.println("Environment timeout: returning to Wokwi sensors");
    publishEnvironment();
    readAndPublishSensors();
  }
  int presence = currentPresence();
  if (presence != lastPresence) {
    lastPresence = presence;
    mqtt.publish(T_MOTION, presence ? "{\"presence\":1}" : "{\"presence\":0}", true);
  }

  if (millis() - lastSensorMs > 5000) {
    lastSensorMs = millis();
    readAndPublishSensors();
  }
}
