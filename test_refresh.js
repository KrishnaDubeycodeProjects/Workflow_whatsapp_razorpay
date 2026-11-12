const fs = require('fs');
const path = require('path');

const authPath = path.join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json');
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));

const CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';

async function refresh() {
  console.log('Fetching openid config from vercel.com...');
  const discoRes = await fetch('https://vercel.com/.well-known/openid-configuration');
  const disco = await discoRes.json();
  console.log('Token endpoint:', disco.token_endpoint);

  console.log('Sending refresh_token request...');
  const res = await fetch(disco.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': 'Vercel CLI'
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken
    })
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Keys in response:', Object.keys(data));

  if (data.access_token) {
    auth.token = data.access_token;
    if (data.refresh_token) auth.refreshToken = data.refresh_token;
    if (data.expires_in) auth.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log('SUCCESS: Token refreshed and saved to auth.json!');
  } else {
    console.error('Failed to refresh:', data);
  }
}

refresh().catch(e => console.error(e));
