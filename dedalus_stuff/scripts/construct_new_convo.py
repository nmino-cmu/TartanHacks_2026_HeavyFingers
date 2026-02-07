import os
from pathlib import Path
import json

def updateConvoCounter():
  global_file_path = Path(__file__).resolve().parent.parent / "globalInfo.json"

  with open(global_file_path, "r", encoding="utf-8") as f:
      global_data = json.load(f)

  global_data["convoIndex"] = int(global_data["convoIndex"]) + 1

  with open(global_file_path, "w", encoding="utf-8", newline="\n") as f:
      json.dump(global_data, f, ensure_ascii=False, indent=2)

  return global_data["convoIndex"]

def createJsonFile(convoNum, model):
    updateConvoCounter()
    data = {
    "format": { "name": "conversation_bundle", "version": "1.0" },
    "encoding": { "charset": "utf-8", "line_endings": "lf" },
    "conversation": {
      "name": "NONE",
      "name_hash_sha256": "SHA256_OF_NAME"
        },
    "model": {
      "kind": model[1],
      "name": model[2],
        },
    "messages": {
        "messages": [],
        "filepaths": [],
        "tools": [],
        "notes": ""
        }
    }

    # The file path where you want to save the JSON data

    file_path = "conversation" + str(convoNum) + ".json"
    out_path = Path() / "conversations" / file_path
    out_path.parent.mkdir(parents=True, exist_ok=True) 

    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
