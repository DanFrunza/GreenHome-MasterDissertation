FROM python:3.9-slim

WORKDIR /app

RUN pip install paho-mqtt

COPY co2-simulation.py .

CMD ["python", "co2-simulation.py"]