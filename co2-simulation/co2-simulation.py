import time
import random
import paho.mqtt.client as mqtt


BROKER = "mqtt-local"
PORT = 1883

client = mqtt.Client()
client.connect(BROKER, PORT, 60)

co2 = 700
ventilation_on = False

# parameters for CO2 simulation
num_people = 2  # number of people



def on_message(client, userdata, msg):
    global ventilation_on
    if msg.payload.decode() == "ON":
        ventilation_on = True
    elif msg.payload.decode() == "OFF":
        ventilation_on = False



client.subscribe("home/ventilation/control")
client.on_message = on_message

client.loop_start()

while True:
    if ventilation_on:
        co2 -= random.randint(10, 20)  # ventilation reduce CO2
        if co2 < 700:  # minimum CO2 level
            co2 = 700
    else:
        increase = num_people * random.choices([0, 1], weights=[0.5, 0.5])[0]
        co2 += increase

    client.publish("home/co2", co2)
    time.sleep(15)