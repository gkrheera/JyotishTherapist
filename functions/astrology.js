/**
 * JyotishTherapist Backend v2.0.4
 *
 * This version fixes the ISO 8601 date format error by replacing
 * URLSearchParams with manual encodeURIComponent to ensure correct
 * encoding of the '+' character in the timezone offset.
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
        const { datetime, coordinates } = JSON.parse(event.body);
        if (!datetime || !coordinates) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields: datetime and coordinates.' })
            };
        }

        const accessToken = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
        
        const headers = { 'Authorization': `Bearer ${accessToken}` };
        
        // FIX: Manually build the query string using encodeURIComponent to ensure
        // the '+' in the timezone offset is correctly encoded.
        const queryString = `datetime=${encodeURIComponent(datetime)}&coordinates=${encodeURIComponent(coordinates)}&ayanamsa=1`;

        const kundliUrl = `https://api.prokerala.com/v2/astrology/kundli?${queryString}`;
        const dashaUrl = `https://api.prokerala.com/v2/astrology/dasha-periods?${queryString}`;
        const planetPositionUrl = `https://api.prokerala.com/v2/astrology/natal-planet-position?${queryString}`;

        console.log('Making concurrent API calls to ProKerala...');
        
        const [kundliResponse, dashaResponse, planetPositionResponse] = await Promise.all([
            fetch(kundliUrl, { headers }),
            fetch(dashaUrl, { headers }),
            fetch(planetPositionUrl, { headers })
        ]);

        const kundliData = await kundliResponse.json();
        const dashaData = await dashaResponse.json();
        const planetPositionData = await planetPositionResponse.json();
        
        if (!kundliResponse.ok) throw new Error(kundliData.errors?.[0]?.detail || 'Kundli API error.');
        if (!dashaResponse.ok) throw new Error(dashaData.errors?.[0]?.detail || 'Dasha API error.');
        if (!planetPositionResponse.ok) throw new Error(planetPositionData.errors?.[0]?.detail || 'Planet Position API error.');
        
        if (planetPositionData.data) {
            kundliData.data.ascendant = planetPositionData.data.ascendant;
            kundliData.data.planet_positions = planetPositionData.data.planets;
        }

        console.log('Successfully fetched and merged data. Sending back to client.');
        
        return {
            statusCode: 200,
            body: JSON.stringify({ kundliData, dashaData })
        };

    } catch (error) {
        console.error('Serverless Function Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

