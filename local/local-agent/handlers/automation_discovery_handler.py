import asyncio
import json
import threading
import websockets
from config import HA_URL, HA_TOKEN
from handlers.ha_retry import ha_call

HA_WS_URL = HA_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/websocket"

async def _fetch_automations():
    async with websockets.connect(HA_WS_URL) as ws:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": HA_TOKEN}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            raise Exception(f"Auth failed: {auth}")

        # Get all states to find automation entity IDs + runtime info
        await ws.send(json.dumps({"id": 1, "type": "get_states"}))
        msg = json.loads(await ws.recv())
        all_states = msg.get("result", [])

        auto_states = {}
        for state in all_states:
            if state["entity_id"].startswith("automation."):
                attrs = state.get("attributes", {})
                auto_states[state["entity_id"]] = {
                    "state":          state["state"],
                    "last_triggered": attrs.get("last_triggered"),
                    "mode":           attrs.get("mode", "single"),
                }

        # Fetch full config (triggers/conditions/actions) for each automation
        automations = []
        req_id = 2
        for entity_id, runtime in auto_states.items():
            await ws.send(json.dumps({
                "id": req_id,
                "type": "automation/config",
                "entity_id": entity_id,
            }))
            config_msg = json.loads(await ws.recv())
            config = config_msg.get("result", {}).get("config", {})
            if config:
                config["state"] = runtime["state"]
                config["last_triggered"] = runtime["last_triggered"]
                config["ha_entity_id"] = entity_id
                automations.append(config)
            req_id += 1

    return automations

def handle_automation_discovery(client, payload, retry_forever=False):
    def _run():
        print("[automation_discovery] Fetching automations from HA via WebSocket...")
        max_attempts = None if retry_forever else 3
        try:
            automations = asyncio.run(ha_call(_fetch_automations, max_attempts=max_attempts))
        except Exception as e:
            print(f"[automation_discovery] Failed after retries: {e}")
            return
        result = json.dumps({"automations": automations})
        client.publish("home/system/automation_discovery", result, qos=1)
        print(f"[automation_discovery] Published {len(automations)} automations")

    threading.Thread(target=_run, daemon=True).start()
