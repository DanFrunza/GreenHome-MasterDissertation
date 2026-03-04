import time
import random
import paho.mqtt.client as mqtt

BROKER = "mqtt-local"
PORT = 1883

client = mqtt.Client()
client.connect(BROKER, PORT, 60)

co2 = 700
purifier_on = False

# parameters for CO2 simulation
num_people = 1  # number of people
ventilation = False  # ventilation active or not


def on_message(client, userdata, msg):
    global purifier_on
    if msg.payload.decode() == "ON":
        purifier_on = True
    elif msg.payload.decode() == "OFF":
        purifier_on = False


client.subscribe("home/purifier/control")
client.on_message = on_message

client.loop_start()

while True:
    if purifier_on:
        co2 -= random.randint(10, 20)  # purificator reduce CO2
        if co2 < 400:  # minimum CO2 level
            co2 = 400
    else:
        increase = num_people * random.choices([0, 1], weights=[0.5, 0.5])[0]
        if not ventilation:
            co2 += increase
        else:
            co2 += max(0, increase - random.randint(1, 2))  # ventilation reduces CO2 increase

    client.publish("home/co2", co2)
    time.sleep(15)