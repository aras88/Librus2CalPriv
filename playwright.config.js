module.exports = {
  // Test directory
  testDir: './tests',

  // Test timeout
  timeout: 60000,

  // Reporter configuration
  reporter: [
    ['html', {
      open: 'never',
      outputFolder: 'playwright-report'
    }],
    ['json', {
      outputFile: 'test-results.json'
    }],
    ['list']
  ],

  // Use configuration
  use: {
    // Base URL
    baseURL: 'https://portal.librus.pl',

    // Collect trace on failure
    trace: 'on',

    // Take screenshot on failure
    screenshot: 'on',

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Browser options
    launchOptions: {
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    }
  },

  // Projects configuration
  projects: [
    {
      name: 'chromium',
      use: {
        ...require('playwright').devices['Desktop Chrome'],
      }
    }
  ]
};