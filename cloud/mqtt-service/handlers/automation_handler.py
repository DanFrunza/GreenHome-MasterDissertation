import json
from database import get_connection

def handle_automation_discovery(home_id, payload):
    try:
        data = json.loads(payload)
        automations = data.get("automations", [])
    except json.JSONDecodeError:
        print(f"[WARN] Invalid automation_discovery payload for {home_id}")
        return

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM homes WHERE id = %s", (home_id,))
    if cur.fetchone() is None:
        print(f"[WARN] Unknown home_id: {home_id}, skipping")
        cur.close()
        conn.close()
        return

    saved = 0
    for auto in automations:
        automation_id = str(auto.get("id", ""))
        if not automation_id:
            continue

        alias = auto.get("alias") or auto.get("friendly_name") or automation_id
        description = auto.get("description", "")
        enabled = auto.get("state") != "off"
        mode = auto.get("mode", "single")
        last_triggered = auto.get("last_triggered") or None
        raw = json.dumps(auto)

        ha_entity_id = auto.get("ha_entity_id")

        cur.execute("""
            INSERT INTO automations (automation_id, home_id, alias, description, enabled, mode, last_triggered, ha_entity_id, raw_config)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (home_id, automation_id) DO UPDATE SET
                alias          = EXCLUDED.alias,
                description    = EXCLUDED.description,
                enabled        = EXCLUDED.enabled,
                mode           = EXCLUDED.mode,
                last_triggered = EXCLUDED.last_triggered,
                ha_entity_id   = EXCLUDED.ha_entity_id,
                raw_config     = EXCLUDED.raw_config
        """, (automation_id, home_id, alias, description, enabled, mode, last_triggered, ha_entity_id, raw))

        # Rebuild trigger/condition/action rows on every sync
        cur.execute("DELETE FROM automation_triggers WHERE home_id = %s AND automation_id = %s", (home_id, automation_id))
        cur.execute("DELETE FROM automation_conditions WHERE home_id = %s AND automation_id = %s", (home_id, automation_id))
        cur.execute("DELETE FROM automation_actions WHERE home_id = %s AND automation_id = %s", (home_id, automation_id))

        for trigger in _as_list(auto.get("trigger") or auto.get("triggers")):
            ttype = trigger.get("trigger") or trigger.get("platform", "unknown")
            cur.execute("""
                INSERT INTO automation_triggers
                    (automation_id, home_id, trigger_type, entity_id, above, below, from_state, to_state, at_time, event_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                automation_id, home_id, ttype,
                _first_entity(trigger.get("entity_id")),
                _float(trigger.get("above")),
                _float(trigger.get("below")),
                trigger.get("from"),
                trigger.get("to"),
                trigger.get("at"),
                trigger.get("event_type"),
            ))

        for condition in _as_list(auto.get("condition") or auto.get("conditions")):
            ctype = condition.get("condition", "unknown")
            cur.execute("""
                INSERT INTO automation_conditions
                    (automation_id, home_id, condition_type, entity_id, above, below, state_value, after_time, before_time, template_text)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                automation_id, home_id, ctype,
                _first_entity(condition.get("entity_id")),
                _float(condition.get("above")),
                _float(condition.get("below")),
                condition.get("state"),
                condition.get("after"),
                condition.get("before"),
                condition.get("value_template"),
            ))

        for order, action in enumerate(_as_list(auto.get("action") or auto.get("actions"))):
            atype = _infer_action_type(action)
            service = action.get("action") or action.get("service")
            target = action.get("target", {})
            entity_id = _first_entity(target.get("entity_id") if target else action.get("entity_id"))
            cur.execute("""
                INSERT INTO automation_actions
                    (automation_id, home_id, action_order, action_type, service, entity_id, delay, topic, payload)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                automation_id, home_id, order, atype, service, entity_id,
                action.get("delay"),
                action.get("topic"),
                str(action.get("payload", "")) if action.get("payload") is not None else None,
            ))

        saved += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"[AUTOMATION_DISCOVERY] {home_id} → {saved} automations saved")


def _as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]

def _first_entity(value):
    if value is None:
        return None
    if isinstance(value, list):
        return value[0] if value else None
    return str(value)

def _float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def _infer_action_type(action):
    if "action" in action or "service" in action:
        return "service"
    if "delay" in action:
        return "delay"
    if "topic" in action:
        return "mqtt"
    if "choose" in action:
        return "choose"
    return "other"
