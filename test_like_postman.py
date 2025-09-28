#!/usr/bin/env python3
"""
Test Librus - symulacja Postman
Używa dokładnie tych samych nagłówków co Postman
"""

import os
import sys
import json
import requests
from datetime import datetime

print("=" * 60)
print("LIBRUS TEST - Symulacja Postman")
print("=" * 60)
print(f"Start: {datetime.now().isoformat()}")

# Dane logowania
USERNAME = os.getenv('LIBRUS_USERNAME', 'arkadiusz@mastalerz.it')
PASSWORD = os.getenv('LIBRUS_PASSWORD', '9WHmjbgt9WHmjbgt')

print(f"📧 Username: {USERNAME}")
print(f"🔑 Password: {'*' * len(PASSWORD)}")

# Sesja z nagłówkami jak w Postman
session = requests.Session()

# Dokładne nagłówki z Postman
session.headers.update({
    'User-Agent': 'PostmanRuntime/7.36.0',  # User-Agent z Postman
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Postman-Token': 'test-token-12345'  # Postman dodaje swój token
})

print("\n🔍 TEST 1: Sprawdzanie połączenia (jak Postman)...")
print("-" * 40)

try:
    # Test połączenia
    response = session.get(
        'https://portal.librus.pl',
        timeout=30,
        allow_redirects=True,
        verify=True  # Postman weryfikuje SSL
    )
    print(f"✅ Status: {response.status_code}")
    print(f"📏 Rozmiar: {len(response.text)} bajtów")
    print(f"🍪 Cookies: {list(session.cookies.keys())}")

except Exception as e:
    print(f"❌ Błąd: {e}")
    print("\nJeśli to nie działa, ale Postman działa, to znaczy że:")
    print("1. GitHub Actions jest blokowane po IP")
    print("2. Musisz użyć proxy lub self-hosted runner")
    sys.exit(1)

print("\n🔐 TEST 2: Pobieranie strony logowania...")
print("-" * 40)

try:
    # Strona logowania
    response = session.get('https://portal.librus.pl/konto-librus/login')
    print(f"Status: {response.status_code}")

    # Szukaj CSRF
    import re
    csrf_match = re.search(r'name="_token"[^>]*value="([^"]+)"', response.text)

    if csrf_match:
        csrf_token = csrf_match.group(1)
        print(f"✅ CSRF Token: {csrf_token[:20]}...")
    else:
        print("❌ Brak CSRF token")
        # Debug HTML
        print("\nFragment HTML:")
        print(response.text[:1000])
        sys.exit(1)

except Exception as e:
    print(f"❌ Błąd: {e}")
    sys.exit(1)

print("\n🔑 TEST 3: Logowanie (jak w Postman)...")
print("-" * 40)

# Dane do logowania - dokładnie jak w Postman
login_data = {
    'email': USERNAME,
    'password': PASSWORD,
    '_token': csrf_token,
    'redirectTo': '',
    'redirectCrc': ''
}

try:
    # Nagłówki dla POST - jak w Postman
    post_headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://portal.librus.pl',
        'Referer': 'https://portal.librus.pl/konto-librus/login'
    }

    response = session.post(
        'https://portal.librus.pl/konto-librus/login/action',
        data=login_data,
        headers=post_headers,
        allow_redirects=False  # Postman domyślnie nie podąża za redirectami
    )

    print(f"Status: {response.status_code}")
    print(f"Cookies po logowaniu: {list(session.cookies.keys())}")

    if response.status_code in [302, 303]:
        print("✅ Logowanie udane (redirect)")
        location = response.headers.get('Location', '')
        print(f"Redirect do: {location}")
    elif response.status_code == 200:
        print("⚠️ Status 200 - sprawdzam treść...")
        if 'błąd' in response.text.lower() or 'error' in response.text.lower():
            print("❌ Błąd logowania")
        else:
            print("✅ Prawdopodobnie zalogowano")
    else:
        print(f"❌ Nieoczekiwany status: {response.status_code}")

except Exception as e:
    print(f"❌ Błąd: {e}")
    sys.exit(1)

print("\n🎫 TEST 4: Bearer Token (jak w Postman)...")
print("-" * 40)

try:
    response = session.get(
        'https://portal.librus.pl/api/v3/SynergiaAccounts',
        headers={'Accept': 'application/json'}
    )

    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        if data.get('accounts'):
            print(f"✅ Znaleziono {len(data['accounts'])} kont")
            for acc in data['accounts']:
                print(f"  - {acc.get('studentName')}")
                if acc.get('accessToken'):
                    bearer = acc['accessToken']
                    print(f"  - Token: {bearer[:30]}...")

                    # Test API z Bearer
                    print("\n📬 TEST 5: API z Bearer Token...")
                    api_headers = {
                        'Authorization': f'Bearer {bearer}',
                        'Accept': 'application/json',
                        'User-Agent': 'PostmanRuntime/7.36.0'
                    }

                    # Test Messages
                    api_response = requests.get(
                        'https://api.librus.pl/3.0/Messages',
                        headers=api_headers
                    )
                    print(f"Messages API status: {api_response.status_code}")

                    if api_response.status_code == 200:
                        messages = api_response.json().get('Messages', [])
                        print(f"✅ Pobrano {len(messages)} wiadomości")
        else:
            print("❌ Brak kont")
    else:
        print(f"❌ Błąd API: {response.status_code}")

except Exception as e:
    print(f"❌ Błąd: {e}")

print("\n" + "=" * 60)
print("TEST ZAKOŃCZONY")
print("=" * 60)