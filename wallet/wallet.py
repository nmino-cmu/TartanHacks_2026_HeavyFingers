from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

import xrpl
from xrpl.clients import JsonRpcClient
from xrpl.models.requests.account_info import AccountInfo
from xrpl.models.transactions import CheckCreate
from xrpl.transaction import (
    XRPLReliableSubmissionException,
    submit_and_wait,
)
from xrpl.wallet import Wallet, generate_faucet_wallet

JSON_RPC_URL = "https://s.altnet.rippletest.net:51234/"
DEFAULT_WALLET_FILE = Path(__file__).resolve().parent / "wallets" / "wallet.json"
EVERY_DONATE_ADDRESS = "rLjd5uRaxpi84pcn9ikbiMWPGqYfLrh15w"

client = JsonRpcClient(JSON_RPC_URL)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def create_wallet(wallet_file: Path = DEFAULT_WALLET_FILE) -> Dict[str, Any]:
    wallet = generate_faucet_wallet(client, debug=False)
    account_info = AccountInfo(
        account=wallet.classic_address,
        ledger_index="validated",
        strict=True,
    )
    response = client.request(account_info)
    payload = response.result
    payload["seed"] = wallet.seed

    _write_json(wallet_file, payload)

    return {
        "address": wallet.classic_address,
        "seed": wallet.seed,
        "file": str(wallet_file),
        "account_data": payload.get("account_data"),
        "explorer_url": f"https://testnet.xrpl.org/accounts/{wallet.classic_address}",
    }


def import_wallet(seed: str, wallet_file: Path = DEFAULT_WALLET_FILE, refresh: bool = True) -> Dict[str, Any]:
    wallet = Wallet.from_seed(seed)

    account_data: Dict[str, Any] | None = None
    validated_ledger: Dict[str, Any] | None = None

    if refresh:
        try:
            response = client.request(
                AccountInfo(account=wallet.classic_address, ledger_index="validated", strict=True)
            )
            account_data = response.result.get("account_data")
            validated_ledger = response.result.get("validated_ledger")
        except Exception:  # account may be unfunded; fail softly
            account_data = None
            validated_ledger = None

    payload: Dict[str, Any] = {
        "account_data": account_data,
        "validated_ledger": validated_ledger,
        "seed": seed,
    }

    _write_json(wallet_file, payload)

    return {
        "address": wallet.classic_address,
        "seed": seed,
        "file": str(wallet_file),
        "account_data": account_data,
        "validated_ledger": validated_ledger,
        "explorer_url": f"https://testnet.xrpl.org/accounts/{wallet.classic_address}",
    }


def load_wallet(wallet_file: Path = DEFAULT_WALLET_FILE) -> Dict[str, Any]:
    if not wallet_file.exists():
        raise FileNotFoundError(
            f"Wallet file not found. Expected one at {wallet_file}. Run `create` first."
        )

    raw = json.loads(wallet_file.read_text(encoding="utf-8"))
    account_data = raw.get("account_data", {})

    return {
        "address": account_data.get("Account"),
        "seed": raw.get("seed"),
        "file": str(wallet_file),
        "account_data": account_data,
        "validated_ledger": raw.get("validated_ledger"),
        "explorer_url": f"https://testnet.xrpl.org/accounts/{account_data.get('Account')}"
        if account_data.get("Account")
        else None,
        "raw": raw,
    }


def refresh_account_info(address: str) -> Dict[str, Any]:
    account_info = AccountInfo(
        account=address,
        ledger_index="validated",
        strict=True,
    )
    response = client.request(account_info)
    return response.result


def send_check(wallet_file: Path, amount: str, destination: str) -> Dict[str, Any]:
    wallet_payload = load_wallet(wallet_file)
    seed = wallet_payload.get("seed")
    if not seed:
        raise ValueError("Wallet seed missing from wallet file.")

    wallet = Wallet.from_seed(seed)
    check_tx = CheckCreate(
        account=wallet.address,
        send_max=amount,
        destination=destination,
    )

    try:
        response = submit_and_wait(check_tx, client, wallet)
        result = response.result
    except XRPLReliableSubmissionException as exc:
        raise RuntimeError(f"Submit failed: {exc}") from exc

    return {
        "tx_hash": result.get("hash"),
        "destination": destination,
        "amount": amount,
        "engine_result": result.get("engine_result"),
        "result": result,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="XRPL testnet wallet helper")

    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create", help="Create and fund a Testnet wallet")
    create_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    create_parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing wallet file",
    )

    info_parser = subparsers.add_parser("info", help="Read wallet info")
    info_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    info_parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh on-ledger account data",
    )

    send_parser = subparsers.add_parser("send-check", help="Send a CheckCreate transaction")
    send_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    send_parser.add_argument("--destination", required=True)
    send_parser.add_argument("--amount", required=True, help="Amount in XRP for the check")

    import_parser = subparsers.add_parser("import", help="Import an existing seed")
    import_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    import_parser.add_argument("--seed", required=True, help="Existing XRPL seed")
    import_parser.add_argument(
        "--refresh",
        action="store_true",
        help="Attempt to load on-ledger account info for the seed",
    )

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "create":
            if args.wallet_file.exists() and not args.force:
                data = load_wallet(args.wallet_file)
            else:
                data = create_wallet(args.wallet_file)
        elif args.command == "info":
            data = load_wallet(args.wallet_file)
            if args.refresh and data.get("address"):
                refreshed = refresh_account_info(data["address"])
                data["account_data"] = refreshed.get("account_data")
                data["validated_ledger"] = refreshed.get("validated_ledger")
        elif args.command == "send-check":
            data = send_check(args.wallet_file, str(args.amount), args.destination)
        elif args.command == "import":
            data = import_wallet(args.seed, args.wallet_file, refresh=args.refresh)
        else:
            raise ValueError(f"Unsupported command: {args.command}")

        print(json.dumps({"status": "ok", "data": data}))
    except Exception as exc:  # pylint: disable=broad-except
        print(json.dumps({"status": "error", "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
