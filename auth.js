// auth.js
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const port = 3005;
const redirectUri = `http://localhost:${port}/exchange_token`;

// Function to dynamically import 'open' module and open the URL
async function openUrl(url) {
    try {
        const { default: open } = await import('open');
        console.log(`Attempting to open URL: ${url}`);  // Debugging output
        await open(url);
        console.log(`URL opened successfully: ${url}`);  // Debugging output
    } catch (error) {
        console.error('Error importing "open" module or opening URL:', error);
    }
}

// Function to save access token to .env file
function saveTokens(accessToken, refreshToken, newRefreshTokenExpiry) {
    const envFilePath = '.env';
    try {
        let envContent = '';
        if (fs.existsSync(envFilePath)) {
            envContent = fs.readFileSync(envFilePath, 'utf8');
        }
        const accessTokenLine = `STRAVA_ACCESS_TOKEN=${accessToken}`;
        const refreshTokenLine = `STRAVA_REFRESH_TOKEN=${refreshToken}`;
        const refreshTokenExpiryLine = `STRAVA_REFRESH_TOKEN_EXPIRY=${newRefreshTokenExpiry}`;
        const accessTokenRegex = /^STRAVA_ACCESS_TOKEN=.*/m;
        const refreshTokenRegex = /^STRAVA_REFRESH_TOKEN=.*/m;
        const refreshTokenExpiryRegex = /^STRAVA_REFRESH_TOKEN_EXPIRY=.*/m;

        if (accessTokenRegex.test(envContent)) {
            envContent = envContent.replace(accessTokenRegex, accessTokenLine);
        } else {
            envContent += `\n${accessTokenLine}`;
        }

        if (refreshTokenRegex.test(envContent)) {
            envContent = envContent.replace(refreshTokenRegex, refreshTokenLine);
        } else {
            envContent += `\n${refreshTokenLine}`;
        }

        if (refreshTokenExpiryRegex.test(envContent)) {
            envContent = envContent.replace(refreshTokenExpiryRegex, refreshTokenExpiryLine);
        } else {
            envContent += `\n${refreshTokenExpiryLine}`;
        }

        fs.writeFileSync(envFilePath, envContent, 'utf8');
        console.log('Access and refresh tokens saved to .env');
    } catch (error) {
        console.error('Failed to save tokens:', error);
    }
}

// Function to initiate OAuth
async function initiateOAuth(req, res) {
    try {
        const authorizationUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=activity:read_all,activity:write,profile:read_all`;
        await openUrl(authorizationUrl);
        res.send('Opening Strava OAuth page...');
    } catch (error) {
        console.error('Error in initiateOAuth:', error);
        res.status(500).send('Internal server error');
    }
}

// Function to exchange authorization code for access token
async function exchangeCodeForToken(authCode) {
    try {
        const response = await axios.post('https://www.strava.com/oauth/token', {
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            grant_type: 'authorization_code',
        });
        const { access_token, refresh_token,  expires_at} = response.data;
        saveTokens(access_token, refresh_token, expires_at);  // Corrected function name
        return { access_token, refresh_token };
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        throw new Error('Error exchanging token');
    }
}

module.exports = { initiateOAuth, exchangeCodeForToken , saveTokens};
