const { chromium } = require('playwright');
const fs = require('fs').promises;

/**
 * Librus Sync - Based on LibrusAuthFinal.gs logic
 * Uses Playwright to handle authentication with proper cookie management
 */

class LibrusClient {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.cookies = {};
    this.bearerToken = null;
    this.synergiaAccounts = [];
    this.isAuthenticated = false;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize Playwright browser
   */
  async init() {
    console.log('🚀 Inicjalizacja przeglądarki...');

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    // Create context without video recording
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw'
    });

    // Start tracing
    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });

    this.page = await this.context.newPage();

    // Intercept requests to handle cookies better
    await this.page.route('**/*', async route => {
      const request = route.request();
      const headers = {
        ...request.headers(),
        'Accept-Language': 'pl-PL,pl;q=0.9'
      };
      await route.continue({ headers });
    });
  }

  /**
   * Main login method - follows LibrusAuthFinal.gs logic
   */
  async login() {
    console.log('🔐 Rozpoczynam logowanie do Librus...');
    console.log('⏰ Czas startu:', new Date().toISOString());
    console.log('👤 Użytkownik:', this.username);

    try {
      await this.init();

      // Krok 1: Pobierz token CSRF
      console.log('\n📝 KROK 1/3: Pobieranie tokenu CSRF...');
      const startCsrf = Date.now();
      const csrfToken = await this.getCsrfToken();
      console.log(`⏱️ Czas pobrania CSRF: ${Date.now() - startCsrf}ms`);

      if (!csrfToken) {
        throw new Error('Nie można pobrać tokenu CSRF');
      }
      console.log('✓ Token CSRF pobrany:', csrfToken.substring(0, 20) + '...');

      // Krok 2: Zaloguj się
      console.log('\n🔑 KROK 2/3: Wykonywanie logowania...');
      const startLogin = Date.now();
      const loginSuccess = await this.performLogin(csrfToken);
      console.log(`⏱️ Czas logowania: ${Date.now() - startLogin}ms`);

      if (!loginSuccess) {
        throw new Error('Logowanie nieudane - sprawdź hasło');
      }
      console.log('✓ Logowanie zakończone sukcesem');

      // Krok 3: Pobierz Bearer Token i dane kont
      console.log('\n🎫 KROK 3/3: Pobieranie danych kont Synergia...');
      const startAccounts = Date.now();
      await this.fetchSynergiaAccounts();
      console.log(`⏱️ Czas pobrania kont: ${Date.now() - startAccounts}ms`);

      if (this.bearerToken) {
        console.log('✅ Zalogowano pomyślnie z Bearer Token!');
        console.log('🎯 Token (pierwsze 30 znaków):', this.bearerToken.substring(0, 30) + '...');
        this.isAuthenticated = true;
        return true;
      } else {
        console.log('⚠️ Zalogowano ale brak Bearer Token');
        console.log('📋 Dostępne ciasteczka:', Object.keys(this.cookies).join(', '));
        this.isAuthenticated = true;
        return true;
      }

    } catch (error) {
      console.error('❌ Błąd logowania:', error.toString());
      console.error('📊 Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Get CSRF token from login page
   */
  async getCsrfToken() {
    console.log('  🌐 Pobieranie strony głównej...');

    try {
      // First visit main page
      console.log('  ⏱️ Start request:', new Date().toISOString());
      console.log('  📍 Nawigacja do: https://portal.librus.pl/rodzina');
      const response1 = await this.page.goto('https://portal.librus.pl/rodzina', {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      console.log('  ✅ Strona załadowana, czekam na elementy...');
      console.log('  ⏱️ End request:', new Date().toISOString());
      console.log(`  📊 Status strony głównej: ${response1.status()}`);

      // Check for Cloudflare challenge or "Wróć do strony głównej" button
      console.log('  🔍 Sprawdzanie czy jest strona Cloudflare...');

      // Wait a bit for Cloudflare to load
      await this.page.waitForTimeout(3000);

      // Check if we have "Wróć do strony głównej" button or similar
      // Try multiple selectors to find the button
      const selectors = [
        'text="Wróć do strony głównej"',
        'a:has-text("Wróć do strony głównej")',
        'button:has-text("Wróć do strony głównej")',
        'a[href*="portal.librus.pl"]',
        '.btn:has-text("Wróć")',
        'a.btn'
      ];

      let buttonClicked = false;
      for (const selector of selectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            const buttonText = await button.textContent();
            console.log(`  ⚠️ Znaleziono przycisk: "${buttonText}" - klikam...`);
            await button.click();
            await this.page.waitForLoadState('networkidle');
            console.log('  ✓ Kliknięto, czekam na załadowanie...');
            await this.page.waitForTimeout(3000);
            buttonClicked = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!buttonClicked) {
        // Take screenshot for debugging
        await this.page.screenshot({ path: 'debug-cloudflare-page.png' });
        console.log('  📸 Screenshot saved as debug-cloudflare-page.png');
      }

      // Check for cookie consent banner FIRST
      console.log('  🍪 Sprawdzanie baneru ciasteczek...');
      try {
        // Look for cookie consent button - try multiple selectors
        const cookieSelectors = [
          'button:has-text("Akceptuję i przechodzę do serwisu")',
          'button:has-text("Akceptuj")',
          'text="Akceptuję i przechodzę do serwisu"',
          'button.btn-primary:has-text("Akceptuj")',
          '[class*="cookie"] button',
          '[class*="consent"] button',
          'button:has-text("Accept")'
        ];

        for (const selector of cookieSelectors) {
          const cookieButton = await this.page.$(selector);
          if (cookieButton) {
            const buttonText = await cookieButton.textContent();
            console.log(`  ✅ Znaleziono przycisk ciasteczek: "${buttonText.trim()}"`);
            await cookieButton.click();
            console.log('  ✅ Kliknięto akceptację ciasteczek');
            await this.page.waitForTimeout(2000);
            break;
          }
        }
      } catch (e) {
        console.log('  ℹ️ Brak baneru ciasteczek lub już zaakceptowany');
      }

      // Check for Cloudflare verification
      const pageContent = await this.page.content();
      if (pageContent.includes('Cloudflare') || pageContent.includes('Checking your browser')) {
        console.log('  ⚠️ Wykryto weryfikację Cloudflare, czekam...');
        await this.page.waitForTimeout(8000);

        // Try to click any continue button
        const continueButton = await this.page.$('button:has-text("Continue"), a:has-text("Continue"), button:has-text("Kontynuuj")');
        if (continueButton) {
          console.log('  🖱️ Klikam przycisk kontynuuj...');
          await continueButton.click();
          await this.page.waitForTimeout(2000);
        }
      }

      // Store cookies
      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po stronie głównej: ${Object.keys(this.cookies).join(', ')}`);

      // Click on login button instead of direct navigation
      console.log('  🔍 Szukam przycisku "Zaloguj (mam Konto LIBRUS)"...');

      // Try different selectors for the login button
      const loginButtonSelectors = [
        'text="Zaloguj (mam Konto LIBRUS)"',
        'a:has-text("Zaloguj")',
        'a:has-text("mam Konto LIBRUS")',
        'button:has-text("Zaloguj")',
        '[href*="login"]:has-text("Zaloguj")',
        'a.btn:has-text("Zaloguj")',
        '.login-button',
        'a[href*="konto-librus/login"]'
      ];

      let loginButtonClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          const loginButton = await this.page.$(selector);
          if (loginButton) {
            const buttonText = await loginButton.textContent();
            console.log(`  ✅ Znaleziono przycisk logowania: "${buttonText.trim()}"`);

            // Click and wait for navigation
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }),
              loginButton.click()
            ]);

            console.log('  ✅ Kliknięto przycisk logowania');
            loginButtonClicked = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!loginButtonClicked) {
        console.log('  ⚠️ Nie znaleziono przycisku logowania, nawiguję bezpośrednio...');
        console.log('  📍 Nawigacja do: https://portal.librus.pl/konto-librus/login');
        const response2 = await this.page.goto('https://portal.librus.pl/konto-librus/login', {
          waitUntil: 'networkidle',
          timeout: 60000
        });
        console.log('  ✅ Strona logowania załadowana');
        console.log(`  📊 Status strony logowania: ${response2.status()}`);
      } else {
        console.log(`  📊 Przeszedłem na stronę logowania`);
      }

      console.log(`  🔗 Aktualny URL: ${this.page.url()}`);

      // Check for cookie consent again on login page
      await this.page.waitForTimeout(2000);
      try {
        const cookieButton = await this.page.$('button:has-text("Akceptuję i przechodzę do serwisu"), button:has-text("Akceptuj")');
        if (cookieButton) {
          console.log('  🍪 Znaleziono baner ciasteczek na stronie logowania - klikam...');
          await cookieButton.click();
          await this.page.waitForTimeout(2000);
        }
      } catch (e) {
        // Ignore if no cookie banner
      }

      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po stronie logowania: ${Object.keys(this.cookies).join(', ')}`);

      // Check for form fields
      const hasEmail = await this.page.$('input[name="email"]');
      const hasPassword = await this.page.$('input[name="password"]');

      if (hasEmail) {
        console.log('  ✓ Znaleziono pole email w formularzu');
      }
      if (hasPassword) {
        console.log('  ✓ Znaleziono pole hasła w formularzu');
      }

      // Extract CSRF token
      const csrfToken = await this.page.evaluate(() => {
        const tokenInput = document.querySelector('input[name="_token"]');
        return tokenInput ? tokenInput.value : null;
      });

      if (csrfToken) {
        console.log('  ✓ Token CSRF znaleziony w HTML');
        return csrfToken;
      } else {
        console.log('  ❌ Nie znaleziono tokenu CSRF w HTML');
        const html = await this.page.content();
        console.log('  📝 Pierwsze 500 znaków HTML:', html.substring(0, 500));
        return null;
      }

    } catch (error) {
      console.error('  ❌ Błąd podczas pobierania tokenu CSRF:', error.toString());

      if (error.toString().includes('timeout')) {
        console.error('  ⏱️ TIMEOUT - strona nie odpowiada');
      } else if (error.toString().includes('DNS')) {
        console.error('  🌐 Problem z DNS - nie można znaleźć serwera');
      }

      // Take screenshot for debugging
      await this.page.screenshot({ path: 'debug-csrf-error.png' });
      return null;
    }
  }

  /**
   * Perform login with credentials
   */
  async performLogin(csrfToken) {
    console.log('  📮 Wysyłanie danych logowania...');
    console.log(`  🍪 Ciasteczka przed logowaniem: ${Object.keys(this.cookies).join(', ')}`);

    try {
      // Fill and submit form
      await this.page.fill('input[name="email"]', this.username);
      await this.page.fill('input[name="password"]', this.password);

      // Set CSRF token if not already set
      await this.page.evaluate((token) => {
        const tokenInput = document.querySelector('input[name="_token"]');
        if (tokenInput) tokenInput.value = token;
      }, csrfToken);

      // Submit form with navigation wait
      const [response] = await Promise.all([
        this.page.waitForNavigation({
          waitUntil: 'networkidle',
          timeout: 60000
        }),
        this.page.click('button[type="submit"], input[type="submit"]')
      ]);

      const statusCode = response.status();
      const url = response.url();
      console.log(`  📊 Status odpowiedzi: ${statusCode}`);
      console.log(`  🔗 URL po logowaniu: ${url}`);

      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po logowaniu: ${Object.keys(this.cookies).join(', ')}`);

      // Check if login was successful
      if (url.includes('rodzina') || url.includes('konto')) {
        console.log('  ✓ Logowanie pomyślne - przekierowano na stronę główną');

        // Follow any additional redirects
        if (url.includes('oauth2')) {
          console.log('  🔄 Wykryto OAuth2 flow, podążam...');
          await this.page.waitForLoadState('networkidle');
        }

        return true;
      }

      // Check for error messages
      const errorMsg = await this.page.textContent('.alert-danger, .error').catch(() => null);
      if (errorMsg) {
        console.log('  ❌ Błąd logowania:', errorMsg);
      }

      return false;

    } catch (error) {
      console.error('  ❌ Błąd podczas logowania:', error.toString());
      await this.page.screenshot({ path: 'debug-login-error.png' });
      return false;
    }
  }

  /**
   * Fetch Synergia accounts and bearer token
   */
  async fetchSynergiaAccounts() {
    console.log('  📚 Pobieranie kont Synergia...');

    try {
      // Navigate to accounts endpoint
      const response = await this.page.goto('https://portal.librus.pl/konto-librus/informacje/dane-uczniow', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log(`  📊 Status: ${response.status()}`);

      // Try to get bearer token from page or API calls
      const bearerToken = await this.page.evaluate(async () => {
        // Check localStorage
        const storedToken = localStorage.getItem('bearer-token') ||
                          sessionStorage.getItem('bearer-token');
        if (storedToken) return storedToken;

        // Try to fetch accounts via API
        try {
          const response = await fetch('https://portal.librus.pl/api/v3/SynergiaAccounts', {
            credentials: 'include'
          });
          const data = await response.json();

          // Return first account's token if available
          if (data.accounts && data.accounts[0]) {
            return data.accounts[0].accessToken;
          }
        } catch (e) {
          console.error('API call failed:', e);
        }

        return null;
      });

      if (bearerToken) {
        this.bearerToken = bearerToken;
        console.log('  ✓ Bearer token pobrany!');
      }

      // Extract account information from page
      const accountInfo = await this.page.evaluate(() => {
        const accounts = [];
        // Look for student names in various places
        document.querySelectorAll('.student-name, .uczen-nazwa, [data-student-name]').forEach(el => {
          accounts.push({
            name: el.textContent.trim()
          });
        });
        return accounts;
      });

      if (accountInfo.length > 0) {
        this.synergiaAccounts = accountInfo;
        console.log(`  ✓ Znaleziono ${accountInfo.length} kont(a)`);
        accountInfo.forEach(acc => {
          console.log(`    - ${acc.name}`);
        });
      }

      return true;

    } catch (error) {
      console.error('  ❌ Błąd podczas pobierania kont:', error.toString());
      return false;
    }
  }

  /**
   * Update cookies from page
   */
  async updateCookies() {
    const cookies = await this.context.cookies();
    cookies.forEach(cookie => {
      this.cookies[cookie.name] = cookie.value;
    });
  }

  /**
   * Test API access with bearer token
   */
  async testApiAccess() {
    if (!this.bearerToken) {
      console.log('⚠️ Brak Bearer Token - pomijam test API');
      return;
    }

    console.log('\n🧪 Testowanie dostępu do API z Bearer Token...');

    const endpoints = [
      { url: 'https://api.librus.pl/3.0/Me', desc: 'Dane użytkownika' },
      { url: 'https://api.librus.pl/3.0/Timetables', desc: 'Plan lekcji' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.page.evaluate(async (params) => {
          const res = await fetch(params.url, {
            headers: {
              'Authorization': `Bearer ${params.token}`,
              'Accept': 'application/json'
            }
          });
          return {
            status: res.status,
            ok: res.ok
          };
        }, { url: endpoint.url, token: this.bearerToken });

        console.log(`  ${endpoint.desc}: ${response.status} ${response.ok ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`  ${endpoint.desc}: ❌ ${error.message}`);
      }
    }
  }

  /**
   * Verify widget page loads correctly
   */
  async verifyWidgetPage() {
    console.log('\n🔍 Weryfikacja dostępu do widgetu Librus...');

    try {
      const widgetUrl = 'https://portal.librus.pl/vendor/widget-librus/index.html?v=1759002805';
      console.log(`  📍 Nawigacja do: ${widgetUrl}`);

      // Navigate to widget page
      console.log('  🔄 Nawigacja do widgetu...');
      const response = await this.page.goto(widgetUrl, {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      console.log('  ✅ Widget załadowany');

      const status = response.status();
      const url = this.page.url();

      console.log(`  📊 Status odpowiedzi: ${status}`);
      console.log(`  🔗 Aktualny URL: ${url}`);

      // Check if page loaded successfully
      if (status === 200) {
        // Wait for widget content to load
        await this.page.waitForTimeout(3000);

        // Check for widget elements
        const hasWidgetContent = await this.page.evaluate(() => {
          // Check for various widget elements
          const selectors = [
            '.widget-container',
            '#widget-librus',
            '.librus-widget',
            'iframe[src*="librus"]',
            '[class*="widget"]',
            '[id*="widget"]'
          ];

          for (const selector of selectors) {
            if (document.querySelector(selector)) {
              return true;
            }
          }

          // Check if there's any content at all
          return document.body && document.body.innerHTML.length > 100;
        });

        if (hasWidgetContent) {
          console.log('  ✅ Widget załadowany pomyślnie');

          // Take screenshot for verification
          await this.page.screenshot({
            path: 'widget-verification.png',
            fullPage: true
          });
          console.log('  📸 Screenshot widgetu zapisany jako widget-verification.png');

          return true;
        } else {
          console.log('  ⚠️ Widget załadowany ale brak zawartości');
          return false;
        }
      } else {
        console.log(`  ❌ Błąd ładowania widgetu - status: ${status}`);
        return false;
      }

    } catch (error) {
      console.error('  ❌ Błąd podczas weryfikacji widgetu:', error.message);

      // Take error screenshot
      await this.page.screenshot({
        path: 'widget-error.png',
        fullPage: true
      });

      return false;
    }
  }

  /**
   * Generate HTML report
   */
  async generateHtmlReport(results) {
    const timestamp = new Date().toISOString();
    const success = results.success || false;

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Librus Sync Report - ${timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .status { padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .failure { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        h1 { color: #333; }
        .section { margin: 20px 0; }
        .data { background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Librus Sync Report</h1>
        <div class="timestamp">Generated: ${timestamp}</div>

        <div class="status ${success ? 'success' : 'failure'}">
            <h2>${success ? '✅ SUCCESS' : '❌ FAILURE'}</h2>
            <p>Status: ${success ? 'Logged in successfully' : 'Login failed'}</p>
        </div>

        <div class="section">
            <h3>🔐 Authentication Details</h3>
            <table>
                <tr><th>Property</th><th>Value</th></tr>
                <tr><td>Username</td><td>${this.username}</td></tr>
                <tr><td>Bearer Token</td><td>${this.bearerToken ? '✅ Obtained' : '❌ Not obtained'}</td></tr>
                <tr><td>Accounts Found</td><td>${this.synergiaAccounts.length}</td></tr>
                <tr><td>Cookies Set</td><td>${Object.keys(this.cookies).length}</td></tr>
            </table>
        </div>

        ${this.synergiaAccounts.length > 0 ? `
        <div class="section">
            <h3>👨‍👩‍👧‍👦 Synergia Accounts</h3>
            <table>
                <tr><th>ID</th><th>Name</th></tr>
                ${this.synergiaAccounts.map(acc =>
                  `<tr><td>${acc.id}</td><td>${acc.name || 'Unknown'}</td></tr>`
                ).join('')}
            </table>
        </div>
        ` : ''}

        <div class="section">
            <h3>🍪 Cookies</h3>
            <div class="data">${Object.keys(this.cookies).join(', ') || 'No cookies'}</div>
        </div>

        <div class="section info">
            <h3>📝 Notes</h3>
            <ul>
                <li>Test executed in ${process.env.HEADLESS !== 'false' ? 'headless' : 'headed'} mode</li>
                <li>Platform: ${process.platform}</li>
                <li>Node version: ${process.version}</li>
            </ul>
        </div>
    </div>
</body>
</html>`;

    await fs.writeFile('test-report.html', html);
    console.log('📄 HTML report generated: test-report.html');
  }

  /**
   * Cleanup browser
   */
  async cleanup() {
    console.log('\n🧹 Czyszczenie...');

    // Stop tracing and save it
    if (this.context) {
      await this.context.tracing.stop({
        path: 'trace.zip'
      });
      console.log('📊 Trace zapisany do trace.zip');

      // Close context
      await this.context.close();
    }

    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Main run method
   */
  async run() {
    const success = await this.login();

    if (success) {
      console.log('\n✨ SUKCES! Zalogowano do Librus');
      console.log('📊 Podsumowanie:');
      console.log(`  - Użytkownik: ${this.username}`);
      console.log(`  - Bearer Token: ${this.bearerToken ? '✅ Pobrany' : '❌ Brak'}`);
      console.log(`  - Konta: ${this.synergiaAccounts.length}`);
      console.log(`  - Ciasteczka: ${Object.keys(this.cookies).length}`);

      await this.testApiAccess();

      // Verify widget page at the end
      const widgetVerified = await this.verifyWidgetPage();
      if (!widgetVerified) {
        console.log('⚠️ Uwaga: Widget Librus nie załadował się poprawnie');
      }
    } else {
      console.log('\n❌ NIEPOWODZENIE - nie udało się zalogować');
    }

    const results = {
      success: success,
      bearerToken: this.bearerToken,
      accounts: this.synergiaAccounts,
      timestamp: new Date().toISOString()
    };

    // Generate HTML report
    await this.generateHtmlReport(results);

    await this.cleanup();

    return results;
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('LIBRUS SYNC - FINAL VERSION (Based on LibrusAuthFinal.gs)');
  console.log('='.repeat(60));

  const config = {
    username: process.env.LIBRUS_USERNAME || 'arkadiusz@mastalerz.it',
    password: process.env.LIBRUS_PASSWORD || '9WHmjbgt9WHmjbgt'
  };

  const client = new LibrusClient(config.username, config.password);
  const results = await client.run();

  // Save results
  await fs.writeFile(
    'sync-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📁 Wyniki zapisane do sync-results.json');
  process.exit(results.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { LibrusClient };