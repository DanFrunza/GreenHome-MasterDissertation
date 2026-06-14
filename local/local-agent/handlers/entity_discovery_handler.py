import asyncio
import json
import threading
import websockets
from config import HA_URL, HA_TOKEN, ALLOWED_DOMAINS, EXCLUDED_PREFIXES
from handlers.ha_retry import ha_call

HA_WS_URL = HA_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"

async def _fetch_entities():
    async with websockets.connect(HA_WS_URL) as ws:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": HA_TOKEN}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            raise Exception(f"Auth failed: {auth}")

        await ws.send(json.dumps({"id": 1, "type": "get_states"}))
        states_msg = json.loads(await ws.recv())
        states = {s["entity_id"]: s for s in states_msg.get("result", [])}

        await ws.send(json.dumps({"id": 2, "type": "config/entity_registry/list"}))
        registry_msg = json.loads(await ws.recv())
        registry = {e["entity_id"]: e for e in registry_msg.get("result", [])}

    entities = []
    for entity_id, state in states.items():
        domain = entity_id.split(".")[0]
        if domain not in ALLOWED_DOMAINS:
            continue
        if entity_id.startswith(EXCLUDED_PREFIXES):
            continue

        reg  = registry.get(entity_id, {})
        attrs = state.get("attributes", {})
        entities.append({
            "entity_id":          entity_id,
            "domain":             domain,
            "state":              state["state"],
            "available":          state["state"] != "unavailable",
            "friendly_name":      attrs.get("friendly_name"),
            "unit_of_measurement": attrs.get("unit_of_measurement"),
            "device_class":       attrs.get("device_class"),
            "device_id":          reg.get("device_id"),
        })

    return entities

def handle_entity_discovery(client, payload, retry_forever=False):
    def _run():
        print("[entity_discovery] Fetching entities from HA via WebSocket...")
        max_attempts = None if retry_forever else 3
        try:
            entities = asyncio.run(ha_call(_fetch_entities, max_attempts=max_attempts))
        except Exception as e:
            print(f"[entity_discovery] Failed after retries: {e}")
            return
        result = json.dumps({"entities": entities})
        client.publish("home/system/entity_discovery", result, qos=1)
        print(f"[entity_discovery] Published {len(entities)} entities")

    threading.Thread(target=_run, daemon=True).start()
