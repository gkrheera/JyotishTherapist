/**
 * JyotishTherapist Backend v7.0.0 (Production Ready)
 *
 * Final Fix: This version implements a targeted fix based on analysis of
 * Netlify logs. It surgically replaces the space character introduced by
 * Netlify's decoding with the '%2B' that the ProKerala API requires.
 * This is the most robust solution as it only modifies the known incorrect
 * character while leaving the rest of the query string intact.
 */

// A simple in-memory cache for the access token to improve performance.
let cachedToken = {
    accessToken: null,
    expiresAt: 0,
};

const TOKEN_URL = 'https://api.prokerala.com/token';

/**
 * Gets a valid OAuth 2.0 access token, using a cache to avoid unnecessary requests.
 * @param {string} clientId Your ProKerala Client ID.
 * @param {string} clientSecret Your ProKerala Client Secret.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken(clientId, clientSecret) {
    if (cachedToken.accessToken && cachedToken.expiresAt > Date.now() + 300 * 1000) {
        return cachedToken.accessToken;
    }

    console.log('Requesting new access token...');
    
    const body = new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret
    });

    const response = await fetch(TOKEN_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
        body: body.toString() 
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('Failed to get access token:', data);
        throw new Error('Could not authenticate with ProKerala. Check API credentials.');
    }
    
    cachedToken.accessToken = data.access_token;
    cachedToken.expiresAt = Date.now() + data.expires_in * 1000;
    
    console.log('Successfully obtained and cached new access token.');
    return data.access_token;
}

exports.handler = async (event) => {
    console.log('Astrology function invoked.');

    const CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
    const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API credentials are not set up in the serverless environment.' })
        };
    }

    try {
        let queryString = event.rawQuery;
        if (!queryString) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required query parameters.' })
            };
        }

        // **THE DEFINITIVE FIX: Surgically replace the space with '%2B'.**
        // Netlify incorrectly decodes '%2B' to a space. We replace it back to the
        // required '%2B' format for the ProKerala API. This regular expression
        // ensures we only replace the space between the time and the offset.
        const correctedQueryString = queryString.replace(/(\d{2}:\d{2}:\d{2})\s(\d{2}:\d{2})/, '$1%2B$2');

        const accessToken = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
        const headers = { 'Authorization': `Bearer ${accessToken}` };
        
        const kundliUrl = `https://api.prokerala.com/v2/astrology/kundli?${correctedQueryString}`;
        const dashaUrl = `https://api.prokerala.com/v2/astrology/dasha-periods?${correctedQueryString}`;
        const planetPositionUrl = `https://api.prokerala.com/v2/astrology/natal-planet-position?${correctedQueryString}`;
        
        // VERIFICATION LOG:
        console.log('VERIFICATION: Calling Corrected URLs:', { kundliUrl, dashaUrl, planetPositionUrl });

        const [kundliResponse, dashaResponse, planetPositionResponse] = await Promise.all([
            fetch(kundliUrl, { headers }),
            fetch(dashaUrl, { headers }),
            fetch(planetPositionUrl, { headers })
        ]);
        
        // Helper to safely parse and throw errors
        const processResponse = async (res, name) => {
            if (!res.ok) {
                const errorText = await res.text();
                let errorJson;
                try {
                    errorJson = JSON.parse(errorText);
                } catch(e) {
                    throw new Error(`${name} API request failed with status ${res.status}: ${errorText}`);
                }
                throw new Error(errorJson.errors?.[0]?.detail || `Unknown ${name} API error.`);
            }
            return res.json();
        };

        const kundliData = await processResponse(kundliResponse, 'Kundli');
        const dashaData = await processResponse(dashaResponse, 'Dasha');
        const planetPositionData = await processResponse(planetPositionResponse, 'Planet Position');

        if (planetPositionData.data) {
            kundliData.data.ascendant = planetPositionData.data.ascendant;
            kundliData.data.planet_positions = planetPositionData.data.planets;
        }

        console.log('Successfully fetched and merged data.');
        
        return {
            statusCode: 200,
            body: JSON.stringify({ kundliData, dashaData })
        };

    } catch (error) {
        console.error('Serverless Function CRITICAL Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

