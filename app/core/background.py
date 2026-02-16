"""In-memory background task runner — replaces Redis + ARQ for desktop."""
import asyncio
import structlog
from typing import Callable, Any

logger = structlog.get_logger()
_tasks: dict[str, asyncio.Task] = {}


async def enqueue(name: str, func: Callable, *args: Any):
    """Fire-and-forget background task."""
    task_id = f"{name}-{id(args)}"

    async def wrapper():
        try:
            logger.info("background.start", task=name)
            await func(*args)
            logger.info("background.done", task=name)
        except Exception as e:
            logger.error("background.error", task=name, error=str(e))
        finally:
            _tasks.pop(task_id, None)

    _tasks[task_id] = asyncio.create_task(wrapper())


def active_tasks() -> list[str]:
    return [k for k, t in _tasks.items() if not t.done()]
