# 🚀 Librus GitHub Actions Sync with Playwright

Automatyczna synchronizacja Librus → Kalendarz używając GitHub Actions i Playwright (omija Cloudflare!)

## ✨ Zalety tego rozwiązania:

- ✅ **Działa w chmurze GitHub** - zero instalacji lokalnie
- ✅ **Omija Cloudflare** - używa prawdziwej przeglądarki (Playwright)
- ✅ **Automatyczne uruchomienia** - codziennie o ustalonej godzinie
- ✅ **Darmowe** - GitHub Actions daje 2000 minut/miesiąc za darmo
- ✅ **Ręczne uruchomienie** - możesz kliknąć button w GitHub

## 📦 Struktura:

```
github-actions-librus/
├── .github/
│   └── workflows/
│       └── librus-sync.yml      # GitHub Actions workflow
├── tests/
│   └── librus-sync.js           # Skrypt Playwright
├── package.json                 # Dependencies
└── README.md                    # Ten plik
```

## 🔧 Jak użyć:

### 1. Stwórz nowe repo na GitHub

```bash
cd github-actions-librus
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TWOJA-NAZWA/librus-sync.git
git push -u origin main
```

### 2. Dodaj sekretne zmienne (GitHub Secrets)

W repo na GitHub:
1. Idź do **Settings** → **Secrets and variables** → **Actions**
2. Kliknij **New repository secret**
3. Dodaj:
   - Name: `LIBRUS_USERNAME`
   - Value: `arkadiusz@mastalerz.it`
4. Dodaj drugi:
   - Name: `LIBRUS_PASSWORD`
   - Value: `9WHmjbgt9WHmjbgt`

### 3. Uruchom workflow

#### Opcja A: Ręcznie z GitHub
1. Idź do zakładki **Actions**
2. Wybierz **"Librus Calendar Sync"**
3. Kliknij **"Run workflow"**
4. Kliknij zielony button **"Run workflow"**

#### Opcja B: Automatycznie
Workflow uruchomi się:
- Codziennie o 7:00 UTC (8:00 lub 9:00 w Polsce)
- Przy każdym push do main

### 4. Sprawdź wyniki

1. Idź do **Actions**
2. Kliknij na workflow run
3. Zobacz logi i screenshots w **Artifacts**

## 🧪 Testowanie lokalnie:

```bash
# Zainstaluj dependencies
npm install

# Uruchom test (headless)
npm test

# Uruchom test z widoczną przeglądarką
npm run test:headed
```

## 📊 Co robi skrypt:

1. **Loguje się do Librus** - omija Cloudflare używając Playwright
2. **Pobiera konta uczniów** - Iga, Nina
3. **Pobiera wydarzenia** - z kalendarza
4. **Zapisuje wyniki** - do `sync-results.json`
5. **Robi screenshoty** - dla debugowania

## 🔔 Powiadomienia:

Workflow automatycznie:
- Tworzy issue gdy synchronizacja się nie uda
- Możesz dodać powiadomienia email/Discord/Slack

## 🎯 Komendy npm:

```bash
npm test              # Uruchom sync
npm run test:headed   # Uruchom z widoczną przeglądarką
npm run install-browsers  # Zainstaluj Playwright browsers
```

## ⚙️ Konfiguracja:

Edytuj `.github/workflows/librus-sync.yml`:
- Zmień godzinę synchronizacji (cron)
- Dodaj powiadomienia
- Zmień częstotliwość

## 📸 Debugowanie:

Jeśli coś nie działa:
1. Zobacz **Artifacts** w GitHub Actions
2. Tam będą screenshoty (debug-login-page.png)
3. Sprawdź `sync-results.json`

## 🔐 Bezpieczeństwo:

- Hasła są w GitHub Secrets (zaszyfrowane)
- Nikt nie widzi credentials w logach
- Workflow działa w izolowanym środowisku

## 🚀 Deploy:

Po push do GitHub, workflow automatycznie:
1. Zainstaluje Playwright
2. Uruchomi synchronizację
3. Pokaże wyniki

---

**To jest najlepsze rozwiązanie!** Działa w chmurze, omija Cloudflare, jest darmowe i automatyczne! 🎉