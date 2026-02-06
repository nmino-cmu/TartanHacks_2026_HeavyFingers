import os
import asyncio
from dotenv import load_dotenv
from dedalus_labs import AsyncDedalus, DedalusRunner

load_dotenv()

async def main():
    api_key = os.getenv("DEDALUS_API_KEY")
    if not api_key:
        raise RuntimeError("Missing DEDALUS_API_KEY")

    client = AsyncDedalus(api_key = api_key)
    runner = DedalusRunner(client)

    response = await runner.run(
        input="Hello, what can you do?",
        model="anthropic/claude-opus-4-5",
    )
    print(response.final_output)

if __name__ == "__main__":
    asyncio.run(main())
