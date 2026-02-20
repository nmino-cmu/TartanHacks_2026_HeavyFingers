import argparse
import asyncio
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional local dependency
    def load_dotenv() -> None:
        return None

try:
    from dedalus_labs import AsyncDedalus, DedalusRunner
    HAS_DEDALUS_SDK = True
except ImportError:  # pragma: no cover - optional local dependency
    AsyncDedalus = None
    DedalusRunner = None
    HAS_DEDALUS_SDK = False


DEFAULT_SYSTEM_PROMPT = (
    "You are Verdant, an eco-conscious AI assistant. You are knowledgeable, helpful, and thoughtful.\n"
    "You have a warm, grounded personality inspired by nature and sustainability.\n"
    "When appropriate, you weave in eco-friendly perspectives without being preachy.\n"
    "You provide clear, well-structured responses with practical advice.\n"
    "You are capable of helping with coding, writing, analysis, brainstorming, and any general knowledge questions.\n"
    "Always be concise yet thorough. Use markdown formatting when it helps clarity. \n"
    "Your capabilities include normal chat functions, and parsing 200<mb pdfs of pure text. \n"
)
DEFAULT_MODEL = "anthropic/claude-opus-4-5"
DEFAULT_API_BASE_URL = "https://api.dedaluslabs.ai/v1"
DEFAULT_GLOBAL_JSON = Path("dedalus_stuff") / "globalInfo.json"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
DEFAULT_HISTORY_WINDOW_MESSAGES = 14
DEFAULT_HISTORY_SUMMARY_MAX_CHARS = 1800


def emit(event_type: str, **payload: object) -> None:
    event = {"type": event_type, **payload}
    print(json.dumps(event, ensure_ascii=False), flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json_or_empty(path: Path) -> dict:
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    if isinstance(raw, dict):
        return raw
    return {}


def normalize_global_info_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        payload = {}

    active_file_details = payload.get("activeFileDetails")
    if not isinstance(active_file_details, dict):
        active_file_details = {}

    exists_active_raw = active_file_details.get("existsActive")
    if isinstance(exists_active_raw, bool):
        exists_active: bool | str = exists_active_raw
    elif exists_active_raw == "":
        exists_active = ""
    else:
        exists_active = ""

    active_chat_index_raw = active_file_details.get("activeChatIndex")
    if isinstance(active_chat_index_raw, int):
        active_chat_index: int | str = active_chat_index_raw
    elif isinstance(active_chat_index_raw, str) and active_chat_index_raw.strip().isdigit():
        active_chat_index = int(active_chat_index_raw.strip())
    else:
        active_chat_index = ""

    active_json_file_path = active_file_details.get("activeJsonFilePath")
    if not isinstance(active_json_file_path, str):
        active_json_file_path = ""

    convo_index_raw = payload.get("convoIndex")
    try:
        convo_index = int(convo_index_raw)
    except (TypeError, ValueError):
        convo_index = 0
    if convo_index < 0:
        convo_index = 0

    carbon_footprint_raw = payload.get("carbonFootprint")
    if isinstance(carbon_footprint_raw, (int, float)):
        carbon_footprint = carbon_footprint_raw
    else:
        carbon_footprint = 0

    memories_raw = payload.get("permanent memories")
    permanent_memories = memories_raw if isinstance(memories_raw, list) else []
    convo_name = payload.get("convoName")
    if not isinstance(convo_name, str):
        convo_name = ""

    return {
        "activeFileDetails": {
            "existsActive": exists_active,
            "activeChatIndex": active_chat_index,
            "activeJsonFilePath": active_json_file_path,
        },
        "convoName": convo_name,
        "convoIndex": convo_index,
        "carbonFootprint": carbon_footprint,
        "permanent memories": permanent_memories,
    }


def default_conversation_title(conversation_id: str) -> str:
    match = re.match(r"^conversation(\d+)$", conversation_id, flags=re.IGNORECASE)
    if match:
        return f"Conversation {int(match.group(1))}"
    return conversation_id


def normalize_conversation_title(raw_name: str, conversation_id: str) -> str:
    trimmed = raw_name.strip()
    if not trimmed:
        return default_conversation_title(conversation_id)

    match = re.match(r"^conversation(\d+)$", trimmed, flags=re.IGNORECASE)
    if match:
        return f"Conversation {int(match.group(1))}"

    return trimmed


def save_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{os.getpid()}.{uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    try:
        temp_path.replace(path)
    except Exception:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise


def ensure_conversation_bundle(path: Path, conversation_id: str) -> dict:
    raw = load_json_or_empty(path)

    conversation = raw.get("conversation")
    if not isinstance(conversation, dict):
        conversation = {}

    model = raw.get("model")
    if not isinstance(model, dict):
        model = {}

    messages_container = raw.get("messages")
    if not isinstance(messages_container, dict):
        messages_container = {}

    stored_messages = messages_container.get("messages")
    if not isinstance(stored_messages, list):
        stored_messages = []

    bundle = {
        "conversation": {
            "id": conversation.get("id", conversation_id),
            "name": conversation.get("name", conversation_id),
            "updated_at": conversation.get("updated_at", now_iso()),
        },
        "model": {
            "kind": model.get("kind", "dedalus"),
            "name": model.get("name", DEFAULT_MODEL),
        },
        "messages": {
            "messages": stored_messages,
        },
    }

    if isinstance(raw.get("system_prompt"), str):
        bundle["system_prompt"] = raw["system_prompt"]
    elif isinstance(conversation.get("system_prompt"), str):
        bundle["system_prompt"] = conversation["system_prompt"]

    return bundle


def get_system_prompt(bundle: dict) -> str:
    value = bundle.get("system_prompt")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return DEFAULT_SYSTEM_PROMPT


def _compact_text(value: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    compact = re.sub(r"\s+", " ", value).strip()
    if len(compact) <= max_chars:
        return compact
    if max_chars <= 2:
        return compact[:max_chars].rstrip()
    return compact[: max_chars - 1].rstrip() + "…"


def _clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def _history_compression_pressure(history_window: int, summary_limit: int) -> float:
    window_denom = max(DEFAULT_HISTORY_WINDOW_MESSAGES - 1, 1)
    summary_floor = 400
    summary_denom = max(DEFAULT_HISTORY_SUMMARY_MAX_CHARS - summary_floor, 1)
    window_pressure = max(DEFAULT_HISTORY_WINDOW_MESSAGES - history_window, 0) / window_denom
    summary_pressure = max(DEFAULT_HISTORY_SUMMARY_MAX_CHARS - summary_limit, 0) / summary_denom
    return min(max((window_pressure * 0.6) + (summary_pressure * 0.4), 0.0), 1.0)


def _is_signal_line(line: str) -> bool:
    if not line:
        return False
    return bool(
        re.search(
            r"(```|`[^`]+`|^\s*[-*]\s+|^\s*\d+[.)]\s+|error|exception|traceback|failed|must|required|todo|fix|bug|[{}\[\]();=<>])",
            line,
            flags=re.IGNORECASE,
        )
    )


def _compact_with_head_tail(value: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(value) <= max_chars:
        return value
    if max_chars <= 7:
        return value[:max_chars].rstrip()

    head_budget = max(1, int(max_chars * 0.62))
    tail_budget = max(1, max_chars - head_budget - 5)
    compacted = f"{value[:head_budget].rstrip()}\n...\n{value[-tail_budget:].lstrip()}"
    if len(compacted) <= max_chars:
        return compacted
    return _compact_text(compacted, max_chars)


def _compact_message_text(value: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""

    normalized_lines = [line.strip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    normalized_lines = [line for line in normalized_lines if line]
    if not normalized_lines:
        return ""

    normalized = "\n".join(normalized_lines)
    if len(normalized) <= max_chars:
        return normalized

    selected_lines: list[str] = []
    seen: set[str] = set()
    for index, line in enumerate(normalized_lines):
        is_edge_line = index == 0 or index == len(normalized_lines) - 1
        if not (is_edge_line or _is_signal_line(line)):
            continue
        if line in seen:
            continue
        seen.add(line)
        selected_lines.append(line)

    candidate = "\n".join(selected_lines).strip()
    if candidate:
        return _compact_with_head_tail(candidate, max_chars)
    return _compact_with_head_tail(normalized, max_chars)


def _select_messages_for_summary(messages: list[dict], max_entries: int) -> list[dict]:
    if len(messages) <= max_entries:
        return messages

    safe_max_entries = max(1, max_entries)
    head_count = min(2, max(1, safe_max_entries // 3))
    tail_count = max(0, safe_max_entries - head_count)
    if tail_count == 0:
        return messages[-safe_max_entries:]
    return messages[:head_count] + messages[-tail_count:]


def _build_history_summary(messages: list[dict], max_chars: int) -> str:
    if not messages or max_chars <= 0:
        return ""

    summary_limit = max(140, int(max_chars))
    max_summary_entries = _clamp_int(summary_limit // 120, 4, 36)
    selected_messages = _select_messages_for_summary(messages, max_summary_entries)
    omitted_count = max(0, len(messages) - len(selected_messages))
    per_message_cap = _clamp_int(summary_limit // max(len(selected_messages) + 1, 5), 90, 260)

    lines: list[str] = []
    remaining = summary_limit

    if omitted_count > 0:
        omitted_line = f"- [Earlier history compressed: {omitted_count} turn(s) omitted.]"
        if len(omitted_line) + 1 <= remaining:
            lines.append(omitted_line)
            remaining -= len(omitted_line) + 1

    for entry in selected_messages:
        role = entry.get("role")
        content = entry.get("content")
        if role not in {"user", "assistant", "system"} or not isinstance(content, str):
            continue
        normalized = _compact_message_text(content, per_message_cap)
        if not normalized:
            continue

        prefix = "User" if role == "user" else "Assistant" if role == "assistant" else "System"
        line = f"- {prefix}: {normalized}"
        if len(line) + 1 > remaining:
            line = _compact_text(line, remaining)
        if not line:
            break

        lines.append(line)
        remaining -= len(line) + 1
        if remaining <= 0:
            break

    return "\n".join(lines).strip()


def _compute_recent_history_budget(history_window: int, summary_limit: int, pressure: float) -> int:
    window_ratio = history_window / max(DEFAULT_HISTORY_WINDOW_MESSAGES, 1)
    budget = int(round(summary_limit * (1.75 + (1.35 * window_ratio))))
    if pressure >= 0.65:
        budget = int(round(budget * 0.84))
    if pressure >= 0.85:
        budget = int(round(budget * 0.82))
    return _clamp_int(
        budget,
        max(180, history_window * 170),
        max(2200, history_window * 2200),
    )


def _compress_recent_messages(
    messages: list[dict],
    *,
    total_budget_chars: int,
    compression_pressure: float,
    preserve_last_message: bool = True,
) -> list[dict]:
    if not messages:
        return []

    max_chars_per_message = _clamp_int(int(round(2200 - (1300 * compression_pressure))), 480, 2200)
    min_chars_per_message = _clamp_int(int(round(240 - (110 * compression_pressure))), 120, 240)

    preserved_tail: dict | None = None
    message_pool = messages
    if preserve_last_message and messages:
        tail = messages[-1]
        tail_role = tail.get("role")
        tail_content = tail.get("content")
        if (
            tail_role in {"user", "assistant", "system"}
            and isinstance(tail_content, str)
            and tail_content.strip()
        ):
            preserved_tail = {"role": tail_role, "content": tail_content.strip()}
            message_pool = messages[:-1]

    preserved_tail_len = len(preserved_tail["content"]) if preserved_tail else 0
    pool_count = len(message_pool)

    if pool_count == 0:
        return [preserved_tail] if preserved_tail else []

    minimum_pool_budget = pool_count * min_chars_per_message
    maximum_pool_budget = pool_count * max_chars_per_message
    effective_total_budget = _clamp_int(
        total_budget_chars,
        minimum_pool_budget + preserved_tail_len,
        maximum_pool_budget + preserved_tail_len,
    )
    available_pool_budget = max(effective_total_budget - preserved_tail_len, minimum_pool_budget)

    weights: list[float] = []
    for index, entry in enumerate(message_pool):
        recency = index / max(pool_count - 1, 1)
        role = entry.get("role")
        weight = 1.0 + (0.9 * recency)
        if role == "user":
            weight += 0.25
        elif role == "system":
            weight += 0.1
        if index >= pool_count - 2:
            weight += 0.2
        weights.append(weight)

    weight_sum = sum(weights) or float(pool_count)
    char_budgets: list[int] = []
    for weight in weights:
        share = available_pool_budget * (weight / weight_sum)
        char_budgets.append(_clamp_int(int(round(share)), min_chars_per_message, max_chars_per_message))

    compressed_messages: list[dict] = []
    for entry, message_budget in zip(message_pool, char_budgets):
        role = entry.get("role")
        content = entry.get("content")
        if role not in {"user", "assistant", "system"} or not isinstance(content, str):
            continue
        compacted = _compact_message_text(content, message_budget)
        if compacted:
            compressed_messages.append({"role": role, "content": compacted})

    current_total = sum(len(item["content"]) for item in compressed_messages) + preserved_tail_len
    overflow = max(current_total - effective_total_budget, 0)
    if overflow > 0:
        for index in range(len(compressed_messages)):
            if overflow <= 0:
                break
            current_content = compressed_messages[index]["content"]
            current_length = len(current_content)
            if index >= len(compressed_messages) - 2:
                floor = min_chars_per_message
            else:
                floor = max(90, min_chars_per_message - 40)
            reducible = max(current_length - floor, 0)
            if reducible <= 0:
                continue
            target_length = current_length - min(reducible, overflow)
            reduced = _compact_message_text(current_content, target_length)
            compressed_messages[index]["content"] = reduced
            overflow -= current_length - len(reduced)

    if preserved_tail:
        compressed_messages.append(preserved_tail)

    return compressed_messages


def normalize_messages_for_api(
    bundle: dict,
    *,
    history_window_messages: int = DEFAULT_HISTORY_WINDOW_MESSAGES,
    history_summary_max_chars: int = DEFAULT_HISTORY_SUMMARY_MAX_CHARS,
) -> list[dict]:
    api_messages: list[dict] = [{"role": "system", "content": get_system_prompt(bundle)}]
    stored = bundle["messages"]["messages"]
    normalized_messages: list[dict] = []

    for entry in stored:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        text = entry.get("text")
        if role in {"user", "assistant", "system"} and isinstance(text, str) and text.strip():
            normalized_messages.append({"role": role, "content": text})

    history_window = max(1, int(history_window_messages))
    summary_limit = max(240, int(history_summary_max_chars))
    compression_pressure = _history_compression_pressure(history_window, summary_limit)
    recent_budget = _compute_recent_history_budget(history_window, summary_limit, compression_pressure)

    if len(normalized_messages) > history_window:
        older_messages = normalized_messages[:-history_window]
        recent_messages = normalized_messages[-history_window:]
        summary = _build_history_summary(older_messages, summary_limit)
        if summary:
            api_messages.append(
                {
                    "role": "system",
                    "content": (
                        "Conversation summary for earlier turns (compressed for efficiency):\n"
                        f"{summary}"
                    ),
                }
            )
        api_messages.extend(
            _compress_recent_messages(
                recent_messages,
                total_budget_chars=recent_budget,
                compression_pressure=compression_pressure,
                preserve_last_message=True,
            )
        )
        return api_messages

    bounded_recent_budget = _clamp_int(
        recent_budget,
        max(180, len(normalized_messages) * 170),
        max(2200, len(normalized_messages) * 2200),
    )
    api_messages.extend(
        _compress_recent_messages(
            normalized_messages,
            total_budget_chars=bounded_recent_budget,
            compression_pressure=compression_pressure,
            preserve_last_message=True,
        )
    )
    return api_messages


def ensure_latest_user_message(api_messages: list[dict], user_message: str) -> None:
    user_message = user_message.strip()
    if not user_message:
        return

    if api_messages:
        last = api_messages[-1]
        if (
            isinstance(last, dict)
            and last.get("role") == "user"
            and isinstance(last.get("content"), str)
            and last["content"].strip() == user_message
        ):
            return

    api_messages.append({"role": "user", "content": user_message})


def map_finish_reason(reason: str) -> str:
    mapping = {
        "content_filter": "content-filter",
        "tool_calls": "tool-calls",
    }
    return mapping.get(reason, reason)


def extract_error_message_from_json(raw_body: str, default: str) -> str:
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return default

    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = error_obj.get("message")
            if isinstance(message, str) and message.strip():
                return message

    return default


def extract_text_fragments(value: object) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []

    if isinstance(value, list):
        fragments: list[str] = []
        for item in value:
            fragments.extend(extract_text_fragments(item))
        return fragments

    if isinstance(value, dict):
        fragments: list[str] = []
        for key in ("text", "content", "value", "output_text"):
            if key in value:
                fragments.extend(extract_text_fragments(value.get(key)))
        return fragments

    return []


def extract_stream_tokens_from_choice(choice: dict) -> list[str]:
    raw_fragments: list[str] = []
    raw_fragments.extend(extract_text_fragments(choice.get("delta")))

    if not raw_fragments:
        raw_fragments.extend(extract_text_fragments(choice.get("text")))
        raw_fragments.extend(extract_text_fragments(choice.get("content")))
        message_obj = choice.get("message")
        if isinstance(message_obj, dict):
            raw_fragments.extend(extract_text_fragments(message_obj.get("content")))
        else:
            raw_fragments.extend(extract_text_fragments(message_obj))

    # Drop empties and collapse immediate duplicates from mixed provider payloads.
    fragments: list[str] = []
    for fragment in raw_fragments:
        if not fragment:
            continue
        if fragments and fragments[-1] == fragment:
            continue
        fragments.append(fragment)

    return fragments


def to_non_negative_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        if math.isfinite(value):
            as_int = int(round(value))
            return as_int if as_int >= 0 else None
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            parsed = int(trimmed)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def normalize_usage_payload(raw_usage: object) -> dict[str, int] | None:
    if not isinstance(raw_usage, dict):
        return None

    prompt_tokens = to_non_negative_int(
        raw_usage.get("prompt_tokens", raw_usage.get("input_tokens"))
    )
    completion_tokens = to_non_negative_int(
        raw_usage.get("completion_tokens", raw_usage.get("output_tokens"))
    )
    total_tokens = to_non_negative_int(raw_usage.get("total_tokens"))

    if total_tokens is None and prompt_tokens is not None and completion_tokens is not None:
        total_tokens = prompt_tokens + completion_tokens

    if total_tokens is not None:
        if prompt_tokens is None and completion_tokens is not None:
            prompt_tokens = max(total_tokens - completion_tokens, 0)
        if completion_tokens is None and prompt_tokens is not None:
            completion_tokens = max(total_tokens - prompt_tokens, 0)

    if prompt_tokens is None and completion_tokens is None and total_tokens is None:
        return None

    prompt_tokens = prompt_tokens or 0
    completion_tokens = completion_tokens or 0
    total_tokens = total_tokens or (prompt_tokens + completion_tokens)

    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def calculate_carbon_from_env_costs(
    model_name: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float | None:
    if prompt_tokens < 0 or completion_tokens < 0:
        return None

    repo_root = Path(__file__).resolve().parents[2]
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)

    try:
        import env_costs  # type: ignore
    except Exception:
        return None

    get_cost = getattr(env_costs, "get_cost", None)
    if not callable(get_cost):
        return None

    try:
        value = get_cost(model_name, prompt_tokens, completion_tokens)
    except Exception:
        return None

    if isinstance(value, (int, float)) and math.isfinite(value) and value >= 0:
        return float(value)
    return None


def run_dedalus_stream(
    *,
    api_key: str,
    api_base_url: str,
    model: str,
    messages: list[dict],
    stream: bool,
    max_tokens: int | None = None,
    available_models: list[str] | None = None,
) -> tuple[str, str, dict[str, int] | None]:
    user_agent = os.getenv("DEDALUS_USER_AGENT", "").strip() or DEFAULT_USER_AGENT
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
    if isinstance(max_tokens, int) and max_tokens > 0:
        payload["max_tokens"] = max_tokens
    if isinstance(available_models, list) and available_models:
        payload["available_models"] = available_models

    request = urllib.request.Request(
        url=f"{api_base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "User-Agent": user_agent,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            if not stream:
                body = response.read().decode("utf-8", errors="replace")
                parsed = json.loads(body)
                choices = parsed.get("choices", []) if isinstance(parsed, dict) else []
                if not choices or not isinstance(choices[0], dict):
                    raise RuntimeError("Dedalus returned no completion choices.")

                message = choices[0].get("message", {})
                content = message.get("content") if isinstance(message, dict) else None
                if not isinstance(content, str) or not content.strip():
                    raise RuntimeError("Dedalus returned an empty assistant response.")

                finish_reason = choices[0].get("finish_reason")
                normalized_reason = (
                    map_finish_reason(finish_reason) if isinstance(finish_reason, str) else "stop"
                )
                usage = normalize_usage_payload(parsed.get("usage")) if isinstance(parsed, dict) else None
                return content, normalized_reason, usage

            full_text_parts: list[str] = []
            finish_reason = "stop"
            usage_counts: dict[str, int] | None = None
            
            def consume_chunk_payload(payload: str) -> bool:
                nonlocal finish_reason, usage_counts

                if payload == "[DONE]":
                    return True

                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    # Ignore malformed non-JSON chunks.
                    return False

                if not isinstance(chunk, dict):
                    return False

                if usage_counts is None:
                    usage_counts = normalize_usage_payload(chunk.get("usage"))

                error_obj = chunk.get("error")
                if isinstance(error_obj, dict):
                    error_message = error_obj.get("message")
                    if isinstance(error_message, str) and error_message.strip():
                        raise RuntimeError(error_message)

                choices = chunk.get("choices")
                if isinstance(choices, list):
                    for choice in choices:
                        if not isinstance(choice, dict):
                            continue

                        for token in extract_stream_tokens_from_choice(choice):
                            full_text_parts.append(token)
                            emit("token", token=token)

                        if usage_counts is None:
                            usage_counts = normalize_usage_payload(choice.get("usage"))

                        reason = choice.get("finish_reason")
                        if isinstance(reason, str) and reason:
                            finish_reason = map_finish_reason(reason)
                    return False

                for token in extract_text_fragments(chunk):
                    full_text_parts.append(token)
                    emit("token", token=token)

                return False

            def consume_event_lines(event_lines: list[str]) -> bool:
                if not event_lines:
                    return False

                data_lines: list[str] = []
                for line in event_lines:
                    if line.startswith("data:"):
                        data_lines.append(line[len("data:") :].lstrip())

                if data_lines:
                    payload = "\n".join(data_lines).strip()
                    if payload:
                        return consume_chunk_payload(payload)
                    return False

                # Fallback when providers proxy non-SSE JSON despite stream=true.
                payload = "\n".join(event_lines).strip()
                if payload.startswith("{"):
                    return consume_chunk_payload(payload)

                return False

            pending_event_lines: list[str] = []
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")

                if not line:
                    if consume_event_lines(pending_event_lines):
                        break
                    pending_event_lines = []
                    continue

                if line.startswith(":"):
                    continue

                pending_event_lines.append(line)

            if pending_event_lines:
                consume_event_lines(pending_event_lines)

            return "".join(full_text_parts), finish_reason, usage_counts

    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        default_message = f"Dedalus request failed with status {error.code}."
        message = extract_error_message_from_json(body, default_message)
        if message == default_message and body.strip():
            message = f"{default_message} {body[:500]}"
        raise RuntimeError(message) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Failed to reach Dedalus API: {error.reason}") from error


def build_sdk_input(messages: list[dict]) -> str:
    lines: list[str] = []
    for entry in messages:
        role = entry.get("role")
        content = entry.get("content")
        if isinstance(role, str) and isinstance(content, str) and content.strip():
            lines.append(f"{role.upper()}: {content}")

    if not lines:
        return ""

    lines.append("ASSISTANT:")
    return "\n".join(lines)


def run_dedalus_with_sdk(*, api_key: str, model: str, messages: list[dict]) -> tuple[str, str]:
    if not HAS_DEDALUS_SDK:
        raise RuntimeError("dedalus_labs SDK is not installed.")

    async def _run() -> str:
        client = AsyncDedalus(api_key=api_key)
        runner = DedalusRunner(client)
        combined_input = build_sdk_input(messages)
        response = await runner.run(input=combined_input, model=model)
        final_output = getattr(response, "final_output", "")
        if not isinstance(final_output, str) or not final_output.strip():
            raise RuntimeError("Dedalus SDK returned an empty assistant response.")
        return final_output

    return asyncio.run(_run()), "stop"


def update_global_info_json(
    *,
    global_json_path: Path,
    conversation_id: str,
    conversation_json_path: Path,
    conversation_name: str,
    model_name: str,
    user_message: str,
    assistant_text: str | None,
    finish_reason: str | None,
    error_message: str | None = None,
) -> None:
    del model_name, user_message, assistant_text, finish_reason, error_message
    payload = normalize_global_info_payload(load_json_or_empty(global_json_path))

    active_file_details = payload["activeFileDetails"]
    active_file_details["existsActive"] = True
    active_file_details["activeJsonFilePath"] = str(conversation_json_path)
    payload["convoName"] = normalize_conversation_title(conversation_name, conversation_id)

    match = re.match(r"^conversation(\d+)$", conversation_id, flags=re.IGNORECASE)
    conversation_index = int(match.group(1)) if match else None
    if conversation_index is not None:
        active_file_details["activeChatIndex"] = conversation_index

        payload["convoIndex"] = max(int(payload["convoIndex"]), conversation_index)

    save_json(global_json_path, payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ask Dedalus with active conversation context.")
    parser.add_argument("--message", required=True, help="Latest user message.")
    parser.add_argument(
        "--conversation-json-path",
        required=True,
        help="Path to the active conversation JSON file.",
    )
    parser.add_argument(
        "--conversation-id",
        default=None,
        help="Active conversation id. Defaults to the conversation json filename stem.",
    )
    parser.add_argument(
        "--global-json-path",
        default=str(DEFAULT_GLOBAL_JSON),
        help="Path to the global info JSON file to update every turn.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Optional model override. Defaults to active conversation model, then DEDALUS_MODEL.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=None,
        help="Optional max_tokens cap for this completion.",
    )
    parser.add_argument(
        "--available-models",
        default="",
        help="Optional comma-separated list of allowed models for this run.",
    )
    parser.add_argument(
        "--history-window-messages",
        type=int,
        default=DEFAULT_HISTORY_WINDOW_MESSAGES,
        help="Number of most recent messages to send verbatim before summarizing older context.",
    )
    parser.add_argument(
        "--history-summary-max-chars",
        type=int,
        default=DEFAULT_HISTORY_SUMMARY_MAX_CHARS,
        help="Character budget for compressed summary of older context.",
    )
    parser.add_argument(
        "--stream",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable streaming token output.",
    )
    parser.add_argument(
        "--update-global-info",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Allow this script to write globalInfo.json. Disabled by default for single-writer mode.",
    )
    return parser.parse_args()


def parse_available_models(raw: str) -> list[str]:
    if not isinstance(raw, str) or not raw.strip():
        return []
    deduped: list[str] = []
    for part in raw.split(","):
        candidate = part.strip()
        if not candidate:
            continue
        if candidate not in deduped:
            deduped.append(candidate)
    return deduped


def main() -> int:
    load_dotenv()
    args = parse_args()

    user_message = args.message.strip()
    if not user_message:
        emit("error", message="Message cannot be empty.")
        return 1

    dedalus_api_key = os.getenv("DEDALUS_API_KEY", "").strip()
    if not dedalus_api_key:
        emit("error", message="Missing DEDALUS_API_KEY.")
        return 1

    conversation_json_path = Path(args.conversation_json_path).expanduser()
    conversation_id = (
        args.conversation_id.strip()
        if isinstance(args.conversation_id, str) and args.conversation_id.strip()
        else conversation_json_path.stem
    )
    global_json_path = Path(args.global_json_path).expanduser()

    conversation_bundle = ensure_conversation_bundle(conversation_json_path, conversation_id)

    env_model = os.getenv("DEDALUS_MODEL", "").strip()
    conversation_model_name = str(conversation_bundle["model"].get("name", "")).strip()
    model_name = (
        (args.model.strip() if isinstance(args.model, str) else "")
        or env_model
        or conversation_model_name
        or DEFAULT_MODEL
    )
    if (
        model_name.startswith("openai/")
        and not (isinstance(args.model, str) and args.model.strip())
        and not env_model
    ):
        model_name = DEFAULT_MODEL

    max_tokens = args.max_tokens if isinstance(args.max_tokens, int) and args.max_tokens > 0 else None
    available_models = parse_available_models(args.available_models)
    if available_models and model_name not in available_models:
        model_name = available_models[0]

    history_window_messages = (
        args.history_window_messages
        if isinstance(args.history_window_messages, int) and args.history_window_messages > 0
        else DEFAULT_HISTORY_WINDOW_MESSAGES
    )
    history_summary_max_chars = (
        args.history_summary_max_chars
        if isinstance(args.history_summary_max_chars, int) and args.history_summary_max_chars > 0
        else DEFAULT_HISTORY_SUMMARY_MAX_CHARS
    )

    api_base_url = os.getenv("DEDALUS_API_BASE_URL", DEFAULT_API_BASE_URL).strip() or DEFAULT_API_BASE_URL
    api_messages = normalize_messages_for_api(
        conversation_bundle,
        history_window_messages=history_window_messages,
        history_summary_max_chars=history_summary_max_chars,
    )
    ensure_latest_user_message(api_messages, user_message)

    try:
        assistant_text, finish_reason, usage = run_dedalus_stream(
            api_key=dedalus_api_key,
            api_base_url=api_base_url,
            model=model_name,
            messages=api_messages,
            stream=bool(args.stream),
            max_tokens=max_tokens,
            available_models=available_models,
        )
    except Exception as error:  # broad by design for CLI error surface
        if args.update_global_info:
            try:
                update_global_info_json(
                    global_json_path=global_json_path,
                    conversation_id=conversation_id,
                    conversation_json_path=conversation_json_path,
                    conversation_name=str(
                        conversation_bundle["conversation"].get("name", "")
                    ).strip(),
                    model_name=model_name,
                    user_message=user_message,
                    assistant_text=None,
                    finish_reason="error",
                    error_message=str(error),
                )
            except Exception:
                pass
        emit("error", message=str(error))
        return 1

    if not assistant_text or not assistant_text.strip():
        emit("error", message="Dedalus returned an empty assistant response.")
        return 1

    if isinstance(usage, dict):
        prompt_tokens = to_non_negative_int(usage.get("prompt_tokens")) or 0
        completion_tokens = to_non_negative_int(usage.get("completion_tokens")) or 0
        total_tokens = to_non_negative_int(usage.get("total_tokens")) or (prompt_tokens + completion_tokens)
        usage_event_payload: dict[str, object] = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }
        carbon_kg = calculate_carbon_from_env_costs(model_name, prompt_tokens, completion_tokens)
        if carbon_kg is not None:
            usage_event_payload["carbon_kg"] = carbon_kg
        emit("usage", **usage_event_payload)

    if args.update_global_info:
        try:
            update_global_info_json(
                global_json_path=global_json_path,
                conversation_id=conversation_id,
                conversation_json_path=conversation_json_path,
                conversation_name=str(
                    conversation_bundle["conversation"].get("name", "")
                ).strip(),
                model_name=model_name,
                user_message=user_message,
                assistant_text=assistant_text,
                finish_reason=finish_reason,
            )
        except Exception as error:
            emit("error", message=f"Failed to update global info json: {error}")
            return 1

    emit("final", text=assistant_text, finish_reason=finish_reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
