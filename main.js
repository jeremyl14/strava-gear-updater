require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { initiateOAuth, exchangeCodeForToken } = require('./auth');
const { processActivities } = require('./activities'); // Import processActivities
const app = express();
const port = 3000;

let accessToken = process.env.STRAVA_ACCESS_TOKEN;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

// Function to save tokens to the .env file (unchanged)
function saveTokens(accessToken, refreshToken, expiresAt) {
    const envFilePath = '.env';
    try {
        let envContent = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
        const accessTokenLine = `STRAVA_ACCESS_TOKEN=${accessToken}`;
        const refreshTokenLine = `STRAVA_REFRESH_TOKEN=${refreshToken}`;
        const expiresAtLine = `STRAVA_TOKEN_EXPIRES_AT=${expiresAt}`;
        const tokenRegex = /^STRAVA_ACCESS_TOKEN=.*/m;
        const refreshTokenRegex = /^STRAVA_REFRESH_TOKEN=.*/m;
        const expiresAtRegex = /^STRAVA_TOKEN_EXPIRES_AT=.*/m;

        envContent = tokenRegex.test(envContent)
            ? envContent.replace(tokenRegex, accessTokenLine)
            : envContent + `\n${accessTokenLine}`;
        envContent = refreshTokenRegex.test(envContent)
            ? envContent.replace(refreshTokenRegex, refreshTokenLine)
            : envContent + `\n${refreshTokenLine}`;
        envContent = expiresAtRegex.test(envContent)
            ? envContent.replace(expiresAtRegex, expiresAtLine)
            : envContent + `\n${expiresAtLine}`;

        fs.writeFileSync(envFilePath, envContent, 'utf8');
        console.log('Tokens saved to .env');
    } catch (error) {
        console.error('Failed to save tokens:', error);
    }
}

// Function to check if the token is expired (unchanged)
function isTokenExpired() {
    const expiresAt = process.env.STRAVA_TOKEN_EXPIRES_AT;
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime >= expiresAt;
}

// Function to refresh the access token (unchanged)
async function refreshAccessToken() {
    try {
        const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
        const response = await axios.post('https://www.strava.com/oauth/token', {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });
        const { access_token, refresh_token, expires_at } = response.data;
        saveTokens(access_token, refresh_token, expires_at);
        return access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw new Error('Error refreshing access token');
    }
}

// Define a route for the root URL
app.get('/', (req, res) => {
    res.send('<h1>Welcome to Strava Gear Updater</h1><p><a href="/auth">Click here to authorize via Strava</a></p>');
});

// OAuth route (unchanged)
app.get('/auth', (req, res) => {
    initiateOAuth(req, res);
});

// Handle the callback from Strava and get tokens
app.get('/exchange_token', async (req, res) => {
    const authCode = req.query.code;
    if (!authCode) {
        return res.status(400).send('No authorization code found.');
    }
    try {
        const tokenData = await exchangeCodeForToken(authCode);
        res.send(`OAuth successful! Access token: ${tokenData.access_token}`);
        accessToken = tokenData.access_token;
        await processActivities(accessToken); // Call processActivities with the new token
    } catch (error) {
        res.status(500).send('Error exchanging code for token.');
    }
});

// Start the server and handle routes
const server = app.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}`);

    if (accessToken) {
        try {
            if (isTokenExpired()) {
                accessToken = await refreshAccessToken();
            }
            await processActivities(accessToken);
            console.log('Shutting down server...');
            server.close(() => {
                console.log('Server closed.');
                process.exit(0);  // Clean exit
            });
        } catch (error) {
            console.error('Error during startup:', error);
            process.exit(1); // Exit with error code
        }
    } else {
        console.log('No access token found, please authorize first via /auth');
    }

});