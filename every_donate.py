import requests
import json 

charities = {"earthday.org": "133798288", 
             "GivePact":"920504087",
             "Environmental Defense Fund":"116107128"}

def get_donate_address(nonprofit_ein, name, email):
    payload = {
        "ein": charities[nonprofit_ein],
        "asset": "XRP",
        "network": "Ripple",
        "share_data": True,
        "donor_name": name,
        "donor_email": email
    } 

    link = "https://api.givepact.io/v1/donate"
    header ={"Content-Type": "application/json"}
    response = requests.post(link, headers=header, data=json.dumps(payload))

    if(response.status_code != 200): print(response.status_code)

    response_json = response.json()

    deposit_addr = response_json["address"]


    """debug_link = f"https://api.givepact.io/v1/verify?address={deposit_addr}"
    debug_response = requests.get(debug_link)
    if(debug_response.status !=200): return None
    debug_response_json = debug_response.json()
    print(debug_response_json)"""

    return deposit_addr 

print(get_donate_address("earthday.org", "B", "E@e.org"))