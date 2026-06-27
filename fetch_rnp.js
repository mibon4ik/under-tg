const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./src/config/config');

async function run() {
  console.log('Waiting for database configuration to initialize...');
  // Wait 3 seconds for PostgreSQL connection and config loading
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const appsScriptUrl = config.APPS_SCRIPT_URL;
  
  if (!appsScriptUrl || appsScriptUrl.includes('...')) {
    console.error('Error: Real APPS_SCRIPT_URL is not configured in DB or .env. Found: ' + appsScriptUrl);
    process.exit(1);
  }

  console.log('Fetching RNP sheet from: ' + appsScriptUrl);
  try {
    const response = await axios.get(appsScriptUrl, {
      params: {
        sheetProd: 'РНП'
      },
      timeout: 30000
    });

    if (response.data && response.data.ok) {
      console.log('Success! Data retrieved.');
      const rnpRows = response.data.data['РНП'] || [];
      console.log('Total rows found: ' + rnpRows.length);
      
      // Save full output to a file for analysis
      const outputFilePath = path.join(__dirname, 'rnp_sample.json');
      fs.writeFileSync(outputFilePath, JSON.stringify(rnpRows.slice(0, 100), null, 2), 'utf8');
      console.log('Sample saved to: ' + outputFilePath);
    } else {
      console.error('Error from Apps Script:', response.data);
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
  
  // Exit process
  process.exit(0);
}

run();
