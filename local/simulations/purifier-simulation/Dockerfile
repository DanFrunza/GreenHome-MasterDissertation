FROM python:3.9-slim
WORKDIR /app
RUN pip install paho-mqtt==1.6.1
COPY purifier-simulation.py .
CMD ["python", "purifier-simulation.py"]
