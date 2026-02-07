# Define the network client
from xrpl.clients import JsonRpcClient
from xrpl.wallet import generate_faucet_wallet
from xrpl.core import addresscodec
from xrpl.models.requests.account_info import AccountInfo
import json

JSON_RPC_URL = "https://s.altnet.rippletest.net:51234/"
client = JsonRpcClient(JSON_RPC_URL)

JSON_WALLET1 = "wallet1.json"
JSON_WALLET2 = "wallet2.json" 

def createWallet(json_file):
    # Create a wallet using the Testnet faucet:
    # https://xrpl.org/xrp-testnet-faucet.html
    print("\nCreating a new wallet and funding it with Testnet XRP...")
    test_wallet = generate_faucet_wallet(client, debug=True)
    test_account = test_wallet.classic_address
    print(f"Wallet: {test_account}")
    print(f"Account Testnet Explorer URL: ")
    print(f" https://testnet.xrpl.org/accounts/{test_account}")

    # Look up info about your account
    #print("\nGetting account info...")
    acct_info = AccountInfo(
        account=test_account,
        ledger_index="validated",
        strict=True,
    )

    response = client.request(acct_info)
    result = response.result

    result["seed"] = test_wallet.seed
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(response.result, f, indent=2, sort_keys=True)

def getSeed(json_file):
    print("Getting seed")
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    return data["seed"]
    
def getAddress(json_file):
    print("Getting address")
    with open(json_file, "r",encoding="utf-8") as f:
        data = json.load(f)
    accountData = data["account_data"]
    return accountData["Account"]
            
def sendCheck(seed, amount, destination, issuer):
    wallet=Wallet.from_seed(seed)
#    client=JsonRpcClient(testnet_url)
#    check_tx=xrpl.models.transactions.CheckCreate(
#        account=wallet.address,
#        send_max=amount,
#        destination=destination
#    ) 
#	reply=""
#    try:
#        response=xrpl.transaction.submit_and_wait(check_tx,client,wallet)
        #reply=response.result
    #except xrpl.transaction.XRPLReliableSubmissionException as e:
   #     reply=f"Submit failed: {e}"
  #  return reply

#createWallet(JSON_WALLET1)
#createWallet(JSON_WALLET2)
#getSeed(JSON_WALLET2)
print(getAddress(JSON_WALLET1))
#sendCheck
