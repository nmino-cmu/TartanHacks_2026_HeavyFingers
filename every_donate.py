import requests
import json 

charities = {"The Nature Conservancy": "53-0242652", 
             }


def get_donate_address(nonprofit_ein, amount, name, email):
    payload = {
        "ein": charities[nonprofit_ein],
        "asset": "XRP",
        "network": "Ripple",
        "share_data": True,
        "donor_name": name,
        "donor_email": email
    } 

    link = "https://api.givepact.io/v1/donate"
    headers ={"Content-Type": "application/json"}
    response = requests.post(link, headers=headers, data=payload)

    if(response.status != 200): return None

    response_json = response.json()

    deposit_addr = response_json["address"]

    return deposit_addr 


