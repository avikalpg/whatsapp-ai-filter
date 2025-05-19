import requests

url = "https://api.perplexity.ai/chat/completions"
headers = {"Authorization": "Bearer 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"}
payload = {
    "model": "sonar-reasoning-pro",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Tell me about the James Webb Space Telescope discoveries."}
    ],
    "search_domain_filter": [
        "nasa.gov",
        "wikipedia.org",
        "space.com"
    ]
}

response = requests.post(url, headers=headers, json=payload).json()
print(response["choices"][0]["message"]["content"])