import asyncio
import json
import websockets
from config import HA_URL, HA_TOKEN
from handlers.ha_retry import ha_call

HA_WS_URL = HA_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"

async def _call_service(domain, service, entity_id):
    async with websockets.connect(HA_WS_URL) as ws:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": HA_TOKEN}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            raise Exception(f"Auth failed: {auth}")

        await ws.send(json.dumps({
            "id": 1,
            "type": "call_service",
            "domain": domain,
            "service": service,
            "target": {"entity_id": entity_id}
        }))
        result = json.loads(await ws.recv())
        if not result.get("success"):
            raise Exception(f"Service call failed: {result}")

def handle_command(entity_id, payload):
    action = payload.strip().lower()
    if action not in ("on", "off"):
        print(f"[COMMAND] Invalid payload: {payload!r}")
        return

    domain = entity_id.split(".")[0]
    service = f"turn_{action}"

    print(f"[COMMAND] {entity_id} → {service}")
    try:
        asyncio.run(ha_call(lambda: _call_service(domain, service, entity_id)))
        print(f"[COMMAND] OK")
    except Exception as e:
        print(f"[COMMAND] Failed after retries: {e}")
