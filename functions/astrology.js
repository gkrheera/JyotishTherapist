// This is your secure backend function.
// It runs in the cloud, not in the browser.

// Netlify's modern environment includes a global fetch, so 'node-fetch' is not needed.
const TOKEN_URL = 'https://api.prokerala.com/token';

/**
 * Gets a valid OAuth 2.0 access token from the ProKerala token endpoint.
 * @param {string} clientId Your ProKerala Client ID.
 * @param {string} clientSecret Your ProKerala Client Secret.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken(clientId, clientSecret) {
    console.log('Requesting new access token...');
    
    const body = new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret
    });

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    const response = await fetch(TOKEN_URL, { 
        method: 'POST', 
        headers: headers, 
        body: body.toString() 
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('Failed to get access token:', data);
        throw new Error('Could not authenticate with ProKerala. Please check your API credentials in the Netlify environment variables.');
    }
    
    console.log('Successfully obtained access token.');
    return data.access_token;
}


exports.handler = async (event, context) => {
    console.log('Astrology function invoked.');

    // 1. Get Secret Keys from Environment Variables
    const CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
    const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('API credentials are not set in the environment.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API credentials are not set up in the serverless environment.' })
        };
    }

    try {
        let bodyData;
        try {
            bodyData = JSON.parse(event.body);
        } catch (error) {
            console.error("Malformed request body:", event.body);
            return {
                statusCode: 400, // Bad Request
                body: JSON.stringify({ error: 'Invalid request body. It must be a valid JSON string.' })
            };
        }
        
        const { datetime, coordinates } = bodyData;
        
        if (!datetime || !coordinates) {
             return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields in request body: datetime and coordinates.' })
            };
        }

        // 2. Get a valid access token
        const accessToken = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
        
        // 3. Prepare API calls with the new access token
        const headers = {
            'Authorization': `Bearer ${accessToken}`
        };

        const params = new URLSearchParams({
            datetime: datetime,
            coordinates: coordinates,
            ayanamsa: 1 // Lahiri Ayanamsa
        });

        // --- FINAL FIX: Use a mixed URL structure based on definitive testing ---
        const kundliUrl = `https://api.prokerala.com/astrology/kundli?${params.toString()}`;
        const dashaUrl = `https://api.prokerala.com/v2/astrology/major-dasha?${params.toString()}`;

        console.log('Making GET API calls to ProKerala with access token...');
        console.log('Kundli URL:', kundliUrl);
        console.log('Dasha URL:', dashaUrl);
        
        // 4. Make the secure, server-to-server API calls using GET
        const [kundliResponse, dashaResponse] = await Promise.all([
            fetch(kundliUrl, { method: 'GET', headers }),
            fetch(dashaUrl, { method: 'GET', headers })
        ]);

        console.log('ProKerala API responses received.');
        const kundliData = await kundliResponse.json();
        const dashaData = await dashaResponse.json();
        
        if (!kundliResponse.ok) throw new Error(kundliData.errors ? kundliData.errors[0].detail : 'Kundli API error.');
        if (!dashaResponse.ok) throw new Error(dashaData.errors ? dashaData.errors[0].detail : 'Dasha API error.');

        console.log('Successfully fetched data. Sending back to client.');
        
        // 5. Send the successful response back to the frontend
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

