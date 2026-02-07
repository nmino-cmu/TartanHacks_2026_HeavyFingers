import os
import asyncio
from dotenv import load_dotenv
from dedalus_labs import AsyncDedalus, DedalusRunner
import json

load_dotenv()



JSON_FILE_LOCATION = os.getcwd()
# Change this when needed
# JSON_FILE_NAME = 
JSON_FILE_NAME = "globalInfo.json"

def require(d, key):
    if key not in d:
        raise KeyError(f"Missing required key: {key}")
    return d[key]


async def main():
    api_key = os.getenv("DEDALUS_API_KEY")
    if not api_key:
        raise RuntimeError("Missing DEDALUS_API_KEY")

    client = AsyncDedalus(api_key = api_key)

    chatInfoJsonPath = JSON_FILE_LOCATION + "/dedalus_stuff/" + JSON_FILE_NAME
    with open(chatInfoJsonPath, "r", encoding="utf-8") as convoInfo:
        convoData = json.load(convoInfo)

    require(convoData, "conversation")
    require(convoData, "model")
    require(convoData, "messages")


    convoName = convoData["conversation"]["name"]
    runningModel = convoData["model"]["name"]



    runner = DedalusRunner(client)

    response = await runner.run(
        input="Hello, what can you do?",
        model="anthropic/claude-opus-4-5",
    )

    print(response.final_output)

if __name__ == "__main__":
    asyncio.run(main())
