#include <Adafruit_Sensor.h>
#include <Adafruit_AHTX0.h>
#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <dummy.h>
#include <Servo.h>
#include <Wire.h>
#include "secrets.h"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool firebaseStatus = false;
unsigned long lastTime_SendDataFirebase = 0;
unsigned long timeRange_SendDataFirebase = 10000;

Adafruit_AHTX0 myHumidity;
sensors_event_t tempAHT, humidAHT;
float temp, humid;
bool myHumidityConnectionStatus = false;
unsigned long lastTime_Humidity = 0;
unsigned long timeRange_Humidity = 2000;

Servo myServo1; //5 mở , 100 đóng
Servo myServo2; //0 mở , 100 đóng
const int servo1Pin = D6; bool servo1State = false;
const int servo2Pin = D7; bool servo2State = false;

const int fanPin = D5; bool fanState = false;
unsigned long lastTime_Fan = 0;
unsigned long timeRange_Fan = 1800000; //tản nhiệt 30p

const int mosfetPin = D3; bool mosfetState = false;
unsigned long lastTime_Mosfet = 0;
unsigned long timeRange_Mosfet = 5400000; //sấy 1.5h

unsigned long lastTime_Dehumidification = 0;
unsigned long timeRange_Dehumidification = 7200000; //hút ẩm 2h

int remainingTime = 0;
bool changeFlag = true;
int boxState = 1;
/*1. Trạng thái sẵn sàng hút ẩm
  2. Trạng thái sấy tấm hút ẩm
  3. Trạng thái tản nhiệt khoang hút ẩm*/

void updateValue();
void sendDataFirebase();
void useDehumidification();
int useMosfet();
int useFan();

void setup() {
	Serial.begin(115200);
	Serial.println();
	analogWriteFreq(25000);

	myServo1.attach(servo1Pin, 500, 2400);
	myServo2.attach(servo2Pin, 500, 2400);

	pinMode(mosfetPin, OUTPUT);
	pinMode(fanPin, OUTPUT);

	digitalWrite(fanPin, LOW);
	digitalWrite(mosfetPin, LOW);
	myServo1.write(100);
	myServo2.write(100);

	if (!myHumidity.begin()) {
		Serial.println("Can not find AHT20");
		myHumidityConnectionStatus = false;
	}
	Serial.println("Connected to AHT20");
	myHumidityConnectionStatus = true; //true là đã kết nối cho biết rằng hộp có thẻ hoạt động (mang lên dashboard)

	WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
	Serial.println("Connecting to Wifi");
	int wifiTimeout = 0;
	while (WiFi.status() != WL_CONNECTED && wifiTimeout < 50) {
		Serial.print(".");
		delay(300);
		wifiTimeout++;
	}
	if (WiFi.status() == WL_CONNECTED) {
		Serial.println("\nConnected with IP: " + WiFi.localIP().toString());
		config.database_url = DATABASE_URL;
		config.signer.tokens.legacy_token = DATABASE_SECRET;

		Firebase.begin(&config, &auth);
		Firebase.reconnectWiFi(true);
		firebaseStatus = true;
		Serial.println("Connected to Firebase");
	}
	else {
		firebaseStatus = false;
		Serial.println("Failed to connect to Wifi. Running OFFLINE !!!");
	}
}

void loop() {
	updateValue();
	if (WiFi.status() == WL_CONNECTED) {
		sendDataFirebase();
	}
	if (boxState == 1) {
		useDehumidification();
		remainingTime = 0;
	}
	if (boxState == 2) {
		if (servo1State == false && servo2State == false) {
			myServo2.write(0);
			servo2State = true; changeFlag = true;
		}
		if (useMosfet() == 0) {
			boxState = 3; changeFlag = true;
		}
		remainingTime = (timeRange_Mosfet - (millis() - lastTime_Mosfet)) / 1000;
	}
	if (boxState == 3) {
		if (useFan() == 0) {
			boxState = 1; changeFlag = true;
			myServo2.write(100);
			servo2State = false; changeFlag = true;
		}
		remainingTime = (timeRange_Fan - (millis() - lastTime_Fan)) / 1000;
	}
	if (remainingTime < 0) {
		remainingTime = 0;
	}
	if (changeFlag == true) {
		FirebaseJson jsonChange;
		jsonChange.set("Devices/VachNganTrong", servo1State);
		jsonChange.set("Devices/VachNganNgoai", servo2State);
		jsonChange.set("Devices/TamHutAm", mosfetState);
		jsonChange.set("Devices/Quat", fanState);
		Firebase.updateNode(fbdo, "/DryBox", jsonChange);
		changeFlag = false;
	}
}

void updateValue() {
	unsigned long currentTime_Humidity = millis();
	if (currentTime_Humidity - lastTime_Humidity >= timeRange_Humidity) {
		lastTime_Humidity = currentTime_Humidity;
		if (myHumidity.getEvent(&humidAHT, &tempAHT)) {
			humid = humidAHT.relative_humidity;
			temp = tempAHT.temperature;
			Serial.printf_P(PSTR("NHIỆT ĐỘ: %.2f C\n"), temp);
			Serial.printf_P(PSTR("ĐỘ ẨM: %.2f %%\n"), humid);
			myHumidityConnectionStatus = true;
		}
		else {
			myHumidityConnectionStatus = false;
		}
	}
}

void sendDataFirebase() {
	unsigned long currentTime_SendDataFirebase = millis();
	if (currentTime_SendDataFirebase - lastTime_SendDataFirebase >= timeRange_SendDataFirebase) {
		lastTime_SendDataFirebase = currentTime_SendDataFirebase;
		FirebaseJson json10s;
		json10s.set("NhietDo", temp);
		json10s.set("DoAm", humid);
		json10s.set("System/ThoiGianConLai", remainingTime);
		json10s.set("System/LastSync/.sv", "timestamp");
		json10s.set("System/TrangThaiCamBien", myHumidityConnectionStatus);
		json10s.set("System/Hop", boxState);
		Firebase.updateNode(fbdo, "/DryBox", json10s);
	}
}

void useDehumidification() {
	if (humid >= 47 && servo1State == false && fanState == false) {
		myServo1.write(5);
		servo1State = true; changeFlag = true;
		analogWrite(fanPin, 20);
		fanState = true; changeFlag = true;
		lastTime_Dehumidification = millis();
	}
	if (servo1State == true && fanState == true) {
		unsigned long currentTime_Dehumidification = millis();
		if (humid <= 40) {
			myServo1.write(100);
			servo1State = false; changeFlag = true;
			analogWrite(fanPin, 0);
			fanState = false; changeFlag = true;
		}
		else if (currentTime_Dehumidification - lastTime_Dehumidification >= timeRange_Dehumidification) {
			myServo1.write(100);
			servo1State = false; changeFlag = true;
			analogWrite(fanPin, 0);
			fanState = false; changeFlag = true;
			boxState = 2; changeFlag = true;
		}
	}
}

int useMosfet() {
	if (servo1State == false && servo2State == true && fanState == false && mosfetState == false) {
		analogWrite(fanPin, 20);
		fanState = true; changeFlag = true;
		digitalWrite(mosfetPin, HIGH);
		mosfetState = true; changeFlag = true;
		lastTime_Mosfet = millis();
	}
	unsigned long currentTime_Mosfet = millis();
	if (currentTime_Mosfet - lastTime_Mosfet >= timeRange_Mosfet && mosfetState == true && fanState == true) {
		analogWrite(fanPin, 0);
		fanState = false; changeFlag = true;
		digitalWrite(mosfetPin, LOW);
		mosfetState = false; changeFlag = true;
		return 0;
	}
	return 1;
}

int useFan() {
	if (servo1State == false && servo2State == true && mosfetState == false && fanState == false) {
		analogWrite(fanPin, 1023);
		fanState = true; changeFlag = true;
		lastTime_Fan = millis();
	}
	unsigned long currentTime_Fan = millis();
	if (currentTime_Fan - lastTime_Fan >= timeRange_Fan && fanState == true) {
		digitalWrite(fanPin, LOW);
		fanState = false; changeFlag = true;
		return 0;
	}
	return 1;
}