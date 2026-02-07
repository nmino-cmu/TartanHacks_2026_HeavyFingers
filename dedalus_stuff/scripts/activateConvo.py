from pathlib import Path
import json

def setActiveConvo(convoNum):
  parentDir = Path(__file__).resolve().parent.parent
  global_file_path = parentDir / "globalInfo.json"
  with open(global_file_path, "r", encoding="utf-8") as f:
    global_data = json.load(f)

  activeFileName = "conversation" + str(convoNum) + ".json"
  activePath = parentDir / "conversations" / activeFileName
  global_data["activeFileDetails"]["activeChatIndex"] = int(convoNum)
  global_data["activeFileDetails"]["activeJsonFilePath"] = str(activePath)
  global_data["activeFileDetails"]["existsActive"] = True

  with open(global_file_path, "w", encoding="utf-8", newline="\n") as f:
      json.dump(global_data, f, ensure_ascii=False, indent=2)

  return global_data["activeFileDetails"]
