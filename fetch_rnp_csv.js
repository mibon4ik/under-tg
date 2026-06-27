const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sheetUrl = 'https://docs.google.com/spreadsheets/d/1RHCkTtgZpyS-4onpUNa3_6jSS18JIdrfHQAfQMwmvCQ/export?format=csv&gid=1746230968';

async function run() {
  console.log('Fetching public Google Sheet CSV from: ' + sheetUrl);
  try {
    const response = await axios.get(sheetUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('Success! Data retrieved.');
    const csvData = response.data;
    console.log('CSV size: ' + csvData.length + ' bytes');
    
    // Save sample of first 1000 characters
    console.log('--- SAMPLE START ---');
    console.log(csvData.slice(0, 1000));
    console.log('--- SAMPLE END ---');
    
    // Save full data
    fs.writeFileSync(path.join(__dirname, 'rnp_data.csv'), csvData, 'utf8');
    console.log('Saved CSV to rnp_data.csv');
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

run();
