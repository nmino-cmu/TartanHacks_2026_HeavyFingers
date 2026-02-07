import requests
import json 

charities = {"earthday.org": "133798288", 
             "Pacific Environmental Coalition":"843138671",
             "Environmental Defense Fund":"116107128"}


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


    debug_link = f"https://api.givepact.io/v1/verify?address={deposit_addr}"
    debug_response = requests.get(debug_link)
    if(debug_response.status !=200): return None
    debug_response_json = debug_response.json()
    print(debug_response_json)

    return deposit_addr 


