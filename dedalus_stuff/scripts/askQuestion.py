import argparse
import asyncio
import json
import os
import re
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
    "Always be concise yet thorough. Use markdown formatting when it helps clarity."
)
DEFAULT_MODEL = "anthropic/claude-opus-4-5"
DEFAULT_API_BASE_URL = "https://api.dedaluslabs.ai/v1"
DEFAULT_GLOBAL_JSON = Path("dedalus_stuff") / "globalInfo.json"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


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


def normalize_messages_for_api(bundle: dict) -> list[dict]:
    api_messages: list[dict] = [{"role": "system", "content": get_system_prompt(bundle)}]
    stored = bundle["messages"]["messages"]

    for entry in stored:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        text = entry.get("text")
        if role in {"user", "assistant", "system"} and isinstance(text, str) and text.strip():
            api_messages.append({"role": role, "content": text})

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


def run_dedalus_stream(
    *,
    api_key: str,
    api_base_url: str,
    model: str,
    messages: list[dict],
    stream: bool,
) -> tuple[str, str]:
    user_agent = os.getenv("DEDALUS_USER_AGENT", "").strip() or DEFAULT_USER_AGENT
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }

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
                return content, normalized_reason

            full_text_parts: list[str] = []
            finish_reason = "stop"
            
            def consume_chunk_payload(payload: str) -> bool:
                nonlocal finish_reason

                if payload == "[DONE]":
                    return True

                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    # Ignore malformed non-JSON chunks.
                    return False

                if not isinstance(chunk, dict):
                    return False

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

            return "".join(full_text_parts), finish_reason

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

    api_base_url = os.getenv("DEDALUS_API_BASE_URL", DEFAULT_API_BASE_URL).strip() or DEFAULT_API_BASE_URL
    api_messages = normalize_messages_for_api(conversation_bundle)
    ensure_latest_user_message(api_messages, user_message)

    try:
        assistant_text, finish_reason = run_dedalus_stream(
            api_key=dedalus_api_key,
            api_base_url=api_base_url,
            model=model_name,
            messages=api_messages,
            stream=bool(args.stream),
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
