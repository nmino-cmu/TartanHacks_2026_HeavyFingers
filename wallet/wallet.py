from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    import xrpl
    from xrpl.clients import JsonRpcClient
    from xrpl.models.requests.account_info import AccountInfo
    from xrpl.models.requests.account_tx import AccountTx
    from xrpl.models.transactions import CheckCreate
    from xrpl.transaction import XRPLReliableSubmissionException, submit_and_wait
    from xrpl.wallet import Wallet, generate_faucet_wallet
except ImportError as exc:  # pragma: no cover - clear error message for missing dep
    raise SystemExit(
        "Missing dependency: xrpl-py. Install with `python3 -m pip install xrpl-py` "
        "or add it to your environment before using wallet.py."
    ) from exc

try:
    from cryptography.fernet import Fernet, InvalidToken
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError as exc:  # pragma: no cover - clear error message for missing dep
    raise SystemExit(
        "Missing dependency: cryptography. Install with `python3 -m pip install cryptography` "
        "or add it to your environment before using wallet.py."
    ) from exc

JSON_RPC_URL = "https://s.altnet.rippletest.net:51234/"
DEFAULT_WALLET_FILE = Path(__file__).resolve().parent / "wallets" / "wallet.json"
EVERY_DONATE_ADDRESS = "rLjd5uRaxpi84pcn9ikbiMWPGqYfLrh15w"

client = JsonRpcClient(JSON_RPC_URL)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    try:
        # Best-effort: tighten permissions on POSIX; harmless on Windows
        os.chmod(path, 0o600)
    except Exception:
        pass


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=150_000,
        backend=default_backend(),
    )
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))


def _encrypt_seed(seed: str, passphrase: str) -> Dict[str, Any]:
    salt = os.urandom(16)
    key = _derive_key(passphrase, salt)
    fernet = Fernet(key)
    seed_ct = fernet.encrypt(seed.encode())
    hmac = hashlib.sha256(seed_ct).hexdigest()
    return {
        "seed_ct": seed_ct.decode(),
        "salt": base64.b64encode(salt).decode(),
        "hmac": hmac,
        "encrypted": True,
    }


def _decrypt_seed(raw: Dict[str, Any], passphrase: str) -> str:
    if "seed_ct" not in raw or "salt" not in raw:
        raise ValueError("Wallet file is not encrypted or missing fields.")
    salt = base64.b64decode(raw["salt"])
    key = _derive_key(passphrase, salt)
    fernet = Fernet(key)
    seed_ct = raw["seed_ct"].encode()
    expected_hmac = raw.get("hmac")
    if expected_hmac and hashlib.sha256(seed_ct).hexdigest() != expected_hmac:
        raise ValueError("Wallet file integrity check failed.")
    try:
        return fernet.decrypt(seed_ct).decode()
    except InvalidToken as exc:
        raise ValueError("Incorrect passphrase for encrypted wallet file.") from exc


def _require_passphrase(explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("WALLET_PASSPHRASE")
    if env:
        return env
    # For CLI use only; API callers should set WALLET_PASSPHRASE
    try:
        return getpass.getpass("Wallet passphrase: ")
    except (EOFError, getpass.GetPassWarning):
        raise ValueError(
            "Passphrase is required. Set WALLET_PASSPHRASE env var or pass --passphrase when running wallet.py."
        )


def create_wallet(wallet_file: Path = DEFAULT_WALLET_FILE, passphrase: Optional[str] = None) -> Dict[str, Any]:
    passphrase = _require_passphrase(passphrase)
    wallet = generate_faucet_wallet(client, debug=False)
    account_info = AccountInfo(
        account=wallet.classic_address,
        ledger_index="validated",
        strict=True,
    )
    response = client.request(account_info)
    payload = response.result
    payload.update(_encrypt_seed(wallet.seed, passphrase))
    payload.pop("seed", None)

    _write_json(wallet_file, payload)

    return {
        "address": wallet.classic_address,
        "file": str(wallet_file),
        "account_data": payload.get("account_data"),
        "explorer_url": f"https://testnet.xrpl.org/accounts/{wallet.classic_address}",
        "encrypted": True,
        "seed_available": False,
    }


def import_wallet(
    seed: str,
    wallet_file: Path = DEFAULT_WALLET_FILE,
    refresh: bool = True,
    passphrase: Optional[str] = None,
) -> Dict[str, Any]:
    passphrase = _require_passphrase(passphrase)
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
        **_encrypt_seed(seed, passphrase),
    }

    _write_json(wallet_file, payload)

    return {
        "address": wallet.classic_address,
        "file": str(wallet_file),
        "account_data": account_data,
        "validated_ledger": validated_ledger,
        "explorer_url": f"https://testnet.xrpl.org/accounts/{wallet.classic_address}",
        "encrypted": True,
        "seed_available": False,
    }


def load_wallet(wallet_file: Path = DEFAULT_WALLET_FILE, passphrase: Optional[str] = None) -> Dict[str, Any]:
    if not wallet_file.exists():
        raise FileNotFoundError(
            f"Wallet file not found. Expected one at {wallet_file}. Run `create` first."
        )

    raw = json.loads(wallet_file.read_text(encoding="utf-8"))
    account_data = raw.get("account_data", {})
    encrypted = "seed_ct" in raw
    seed: Optional[str] = None

    if encrypted:
        passphrase = _require_passphrase(passphrase)
        seed = _decrypt_seed(raw, passphrase)
    else:
        seed = raw.get("seed")

    return {
        "address": account_data.get("Account"),
        "seed": seed,
        "encrypted": encrypted,
        "seed_available": bool(seed),
        "file": str(wallet_file),
        "account_data": account_data,
        "validated_ledger": raw.get("validated_ledger"),
        "explorer_url": f"https://testnet.xrpl.org/accounts/{account_data.get('Account')}"
        if account_data.get("Account")
        else None,
        "raw": raw,
    }


def list_transactions(wallet_file: Path, limit: int = 10, passphrase: Optional[str] = None) -> Dict[str, Any]:
    payload = load_wallet(wallet_file, passphrase)
    address = payload.get("address")
    if not address:
        raise ValueError("Wallet address unavailable; create or import first.")

    req = AccountTx(
        account=address,
        ledger_index_min=-1,
        ledger_index_max=-1,
        limit=limit,
        binary=False,
    )
    res = client.request(req)
    txs_raw = res.result.get("transactions", [])
    simplified = []
    for tx in txs_raw:
        tx_body = tx.get("tx", {}) or tx
        simplified.append(
            {
                "hash": tx_body.get("hash") or tx.get("hash"),
                "type": tx_body.get("TransactionType") or tx_body.get("type") or tx_body.get("transaction_type"),
                "date": tx_body.get("date"),
                "validated": tx.get("validated", False),
                "amount": tx_body.get("SendMax") or tx_body.get("Amount"),
            }
        )
    return {"address": address, "transactions": simplified}


def refresh_account_info(address: str) -> Dict[str, Any]:
    account_info = AccountInfo(
        account=address,
        ledger_index="validated",
        strict=True,
    )
    response = client.request(account_info)
    return response.result


def _to_drops(amount: str) -> str:
    """
    Convert an XRP amount expressed in XRP (can include decimals) into drops as a string.
    XRPL transactions require drops to be an integer string.
    """
    try:
        dec_amount = Decimal(amount)
    except (InvalidOperation, TypeError):
        raise ValueError("Amount must be a numeric value in XRP.")
    if dec_amount <= 0:
        raise ValueError("Amount must be greater than zero.")
    drops = (dec_amount * Decimal(1_000_000)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return str(int(drops))


def send_check(wallet_file: Path, amount: str, destination: str, passphrase: Optional[str] = None) -> Dict[str, Any]:
    wallet_payload = load_wallet(wallet_file, passphrase)
    seed = wallet_payload.get("seed")
    if not seed:
        raise ValueError("Wallet seed missing from wallet file. Decryption failed or file is empty.")

    wallet = Wallet.from_seed(seed)
    send_max_drops = _to_drops(amount)
    check_tx = CheckCreate(
        account=wallet.address,
        send_max=send_max_drops,
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
    create_parser.add_argument(
        "--passphrase",
        help="Passphrase to encrypt the seed (falls back to WALLET_PASSPHRASE env)",
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
    info_parser.add_argument(
        "--passphrase",
        help="Passphrase to decrypt the wallet (falls back to WALLET_PASSPHRASE env)",
    )

    send_parser = subparsers.add_parser("send-check", help="Send a CheckCreate transaction")
    send_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    send_parser.add_argument("--destination", required=True)
    send_parser.add_argument(
        "--amount",
        required=True,
        help="Amount in XRP for the check (decimals allowed; converted to drops on submit)",
    )
    send_parser.add_argument(
        "--passphrase",
        help="Passphrase to decrypt the wallet (falls back to WALLET_PASSPHRASE env)",
    )

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
    import_parser.add_argument(
        "--passphrase",
        help="Passphrase to encrypt the wallet (falls back to WALLET_PASSPHRASE env)",
    )

    txs_parser = subparsers.add_parser("txs", help="List recent account transactions")
    txs_parser.add_argument(
        "--wallet-file",
        default=DEFAULT_WALLET_FILE,
        type=Path,
        help="Path to wallet JSON file",
    )
    txs_parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Number of recent transactions to return",
    )
    txs_parser.add_argument(
        "--passphrase",
        help="Passphrase to decrypt the wallet (falls back to WALLET_PASSPHRASE env)",
    )

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "create":
            if args.wallet_file.exists() and not args.force:
                data = load_wallet(args.wallet_file, passphrase=args.passphrase)
            else:
                data = create_wallet(args.wallet_file, passphrase=args.passphrase)
        elif args.command == "info":
            data = load_wallet(args.wallet_file, passphrase=args.passphrase)
            if args.refresh and data.get("address"):
                refreshed = refresh_account_info(data["address"])
                data["account_data"] = refreshed.get("account_data")
                data["validated_ledger"] = refreshed.get("validated_ledger")
        elif args.command == "send-check":
            data = send_check(args.wallet_file, str(args.amount), args.destination, passphrase=args.passphrase)
        elif args.command == "import":
            data = import_wallet(args.seed, args.wallet_file, refresh=args.refresh, passphrase=args.passphrase)
        elif args.command == "txs":
            data = list_transactions(args.wallet_file, limit=args.limit, passphrase=args.passphrase)
        else:
            raise ValueError(f"Unsupported command: {args.command}")

        print(json.dumps({"status": "ok", "data": data}))
    except Exception as exc:  # pylint: disable=broad-except
        print(json.dumps({"status": "error", "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
