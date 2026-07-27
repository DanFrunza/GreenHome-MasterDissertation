FROM python:3.9-slim
WORKDIR /app
RUN pip install paho-mqtt==1.6.1
COPY co2-simulation.py .
CMD ["python", "co2-simulation.py"]