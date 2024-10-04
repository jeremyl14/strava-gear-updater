require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { initiateOAuth, exchangeCodeForToken, saveTokens } = require('./auth');
const { processActivities } = require('./activities');
const app = express();
const port = 3000;

let accessToken = process.env.STRAVA_ACCESS_TOKEN;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

// Authentication route
app.get('/auth', (req, res) => {
    initiateOAuth(req, res);
});

// Token exchange route
app.get('/exchange_token', async (req, res) => {
    const authCode = req.query.code;
    if (!authCode) {
        return res.status(400).send('No authorization code found.');
    }
    try {
        const tokenData = await exchangeCodeForToken(authCode);
        accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const envConfig = fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean);
        const newEnvConfig = envConfig.map(line => {
            if (line.startsWith('STRAVA_ACCESS_TOKEN=')) {
            return `STRAVA_ACCESS_TOKEN=${accessToken}`;
            } else if (line.startsWith('STRAVA_REFRESH_TOKEN=')) {
            return `STRAVA_REFRESH_TOKEN=${refreshToken}`;
            }
            return line;
        });

        if (!newEnvConfig.some(line => line.startsWith('STRAVA_ACCESS_TOKEN='))) {
            newEnvConfig.push(`STRAVA_ACCESS_TOKEN=${accessToken}`);
        }
        if (!newEnvConfig.some(line => line.startsWith('STRAVA_REFRESH_TOKEN='))) {
            newEnvConfig.push(`STRAVA_REFRESH_TOKEN=${refreshToken}`);
        }

        fs.writeFileSync('.env', newEnvConfig.join('\n'), { flag: 'w' });
        res.send(`OAuth successful! Access token: ${accessToken}`);
    } catch (error) {
        res.status(500).send('Error exchanging code for token.');
    }
});

// Root URL route
app.get('/', (req, res) => {
    res.send('<h1>Welcome to Strava Gear Updater</h1><p><a href="/auth">Click here to authorize via Strava</a></p>');
});

// Check if token is expired
function isTokenExpired() {
    const tokenExpiry = process.env.STRAVA_REFRESH_TOKEN_EXPIRY;
    return Date.now() > tokenExpiry;
}

// Refresh access token
async function refreshAccessToken() {
    const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
    const url = 'https://www.strava.com/oauth/token';
    const params = {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    };
    try {
        const response = await axios.post(url, null, { params });
        const tokenData = response.data;
        const newAccessToken = tokenData.access_token;
        const newRefreshToken = tokenData.refresh_token;
        const newRefreshTokenExpiry = Date.now() + 6 * 30 * 24 * 60 * 60 * 1000; // Assuming 6 months expiry
        saveTokens(newAccessToken, newRefreshToken, newRefreshTokenExpiry);
        return newAccessToken;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        throw error;
    }
}

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