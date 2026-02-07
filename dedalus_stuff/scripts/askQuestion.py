import argparse
import json
import os
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


DEFAULT_SYSTEM_PROMPT = (
    "You are Daedalus, an eco-conscious AI assistant. You are knowledgeable, helpful, and thoughtful.\n"
    "You have a warm, grounded personality inspired by nature and sustainability.\n"
    "When appropriate, you weave in eco-friendly perspectives without being preachy.\n"
    "You provide clear, well-structured responses with practical advice.\n"
    "You are capable of helping with coding, writing, analysis, brainstorming, and any general knowledge questions.\n"
    "Always be concise yet thorough. Use markdown formatting when it helps clarity."
)
DEFAULT_MODEL = "anthropic/claude-opus-4-5"
DEFAULT_API_BASE_URL = "https://api.dedaluslabs.ai/v1"
DEFAULT_GLOBAL_JSON = Path("dedalus_stuff") / "test_chat_info.json"


def emit(event_type: str, **payload: object) -> None:
    event = {"type": event_type, **payload}
    print(json.dumps(event, ensure_ascii=False), flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_message_id(role: str) -> str:
    return f"{role}-{uuid4().hex[:10]}"


def ensure_bundle(path: Path) -> dict:
    if path.exists():
        with path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    else:
        raw = {}

    if not isinstance(raw, dict):
        raw = {}

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
        "format": raw.get("format")
        if isinstance(raw.get("format"), dict)
        else {"name": "conversation_bundle", "version": "1.0"},
        "encoding": raw.get("encoding")
        if isinstance(raw.get("encoding"), dict)
        else {"charset": "utf-8", "line_endings": "lf"},
        "conversation": {
            "name": conversation.get("name", "global_conversation"),
            "name_hash_sha256": conversation.get("name_hash_sha256", "SHA256_OF_NAME"),
            "updated_at": conversation.get("updated_at", now_iso()),
        },
        "model": {
            "kind": model.get("kind", "dedalus"),
            "name": model.get("name", DEFAULT_MODEL),
        },
        "messages": {
            "messages": stored_messages,
            "filepaths": messages_container.get("filepaths", []),
            "tools": messages_container.get("tools", []),
            "notes": messages_container.get("notes", ""),
        },
    }

    if isinstance(raw.get("system_prompt"), str):
        bundle["system_prompt"] = raw["system_prompt"]
    elif isinstance(conversation.get("system_prompt"), str):
        bundle["system_prompt"] = conversation["system_prompt"]

    return bundle


def save_bundle(path: Path, bundle: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(bundle, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def append_message(bundle: dict, role: str, text: str) -> None:
    text = text.strip()
    if not text:
        return

    bundle["messages"]["messages"].append(
        {
            "id": make_message_id(role),
            "role": role,
            "text": text,
            "created_at": now_iso(),
        }
    )
    bundle["conversation"]["updated_at"] = now_iso()


def get_system_prompt(bundle: dict) -> str:
    value = bundle.get("system_prompt")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return DEFAULT_SYSTEM_PROMPT


def to_chat_messages(bundle: dict) -> list[dict]:
    api_messages: list[dict] = [{"role": "system", "content": get_system_prompt(bundle)}]

    for entry in bundle["messages"]["messages"]:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        text = entry.get("text")
        if role in {"user", "assistant", "system"} and isinstance(text, str) and text.strip():
            api_messages.append({"role": role, "content": text})

    return api_messages


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


def run_dedalus_stream(
    *,
    api_key: str,
    api_base_url: str,
    model: str,
    messages: list[dict],
    stream: bool,
) -> tuple[str, str]:
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

            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data:"):
                    continue

                data = line[len("data:") :].strip()
                if not data:
                    continue
                if data == "[DONE]":
                    break

                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue

                if isinstance(chunk, dict):
                    error_obj = chunk.get("error")
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get("message")
                        if isinstance(error_message, str) and error_message.strip():
                            raise RuntimeError(error_message)

                    choices = chunk.get("choices")
                    if not isinstance(choices, list):
                        continue

                    for choice in choices:
                        if not isinstance(choice, dict):
                            continue
                        delta = choice.get("delta")
                        if isinstance(delta, dict):
                            token = delta.get("content")
                            if isinstance(token, str) and token:
                                full_text_parts.append(token)
                                emit("token", token=token)

                        reason = choice.get("finish_reason")
                        if isinstance(reason, str) and reason:
                            finish_reason = map_finish_reason(reason)

            return "".join(full_text_parts), finish_reason

    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        default_message = f"Dedalus request failed with status {error.code}."
        message = extract_error_message_from_json(body, default_message)
        raise RuntimeError(message) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Failed to reach Dedalus API: {error.reason}") from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ask Dedalus with JSON-backed memory.")
    parser.add_argument("--message", required=True, help="Latest user message.")
    parser.add_argument(
        "--json-path",
        default=os.getenv("GLOBAL_CONVERSATION_JSON", str(DEFAULT_GLOBAL_JSON)),
        help="Path to the global conversation JSON file.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Optional model override. Defaults to JSON model name, then DEDALUS_MODEL.",
    )
    parser.add_argument(
        "--stream",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable streaming token output.",
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

    json_path = Path(args.json_path).expanduser()
    bundle = ensure_bundle(json_path)

    append_message(bundle, "user", user_message)
    save_bundle(json_path, bundle)

    model_name = (
        (args.model.strip() if isinstance(args.model, str) else "")
        or str(bundle["model"].get("name", "")).strip()
        or os.getenv("DEDALUS_MODEL", "").strip()
        or DEFAULT_MODEL
    )
    bundle["model"]["name"] = model_name
    bundle["model"]["kind"] = "dedalus"

    api_base_url = os.getenv("DEDALUS_API_BASE_URL", DEFAULT_API_BASE_URL).strip() or DEFAULT_API_BASE_URL
    api_messages = to_chat_messages(bundle)

    try:
        assistant_text, finish_reason = run_dedalus_stream(
            api_key=dedalus_api_key,
            api_base_url=api_base_url,
            model=model_name,
            messages=api_messages,
            stream=bool(args.stream),
        )
    except Exception as error:  # broad by design for CLI error surface
        emit("error", message=str(error))
        return 1

    append_message(bundle, "assistant", assistant_text)
    save_bundle(json_path, bundle)

    emit("final", text=assistant_text, finish_reason=finish_reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
