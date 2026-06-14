import asyncio

async def ha_call(fn, max_attempts=3, base_delay=5, max_delay=60):
    """Retry an async HA WebSocket call with exponential backoff.

    max_attempts=None means retry indefinitely (delay capped at max_delay).
    """
    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as e:
            attempt += 1
            if max_attempts is not None and attempt >= max_attempts:
                raise
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            label = f"{attempt}/{max_attempts}" if max_attempts else str(attempt)
            print(f"[HA] Attempt {label} failed: {e}. Retry in {delay}s...")
            await asyncio.sleep(delay)
