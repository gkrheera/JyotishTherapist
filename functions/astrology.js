// This is your secure backend function, updated with Netlify best practices.
// It runs in the cloud, not in the browser.

// The 'node-fetch' dependency has been removed as per Netlify's best practices.
// Netlify's modern environment provides a native 'fetch' function.

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
    console.log('Astrology function handler invoked successfully.');

    // --- 1. Get Secret Keys from Environment Variables ---
    const CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
    const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        const errorMsg = 'API credentials are not set up in the serverless environment.';
        console.error(errorMsg);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: errorMsg })
        };
    }

    try {
        // --- BEST PRACTICE: Add defensive parsing for the request body ---
        let bodyData;
        try {
            if (!event.body) throw new Error('Request body is missing.');
            bodyData = JSON.parse(event.body);
        } catch (parseError) {
            console.error('JSON Parsing Error:', parseError);
            return { 
                statusCode: 400, // Bad Request
                body: JSON.stringify({ error: 'Invalid request body. Ensure it is valid JSON.' }) 
            };
        }
        
        const { datetime, coordinates } = bodyData;
        
        // --- 2. Get a valid access token ---
        const accessToken = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
        
        // --- 3. Prepare API calls with the new access token ---
        const headers = {
            'Authorization': `Bearer ${accessToken}`
        };

        const params = new URLSearchParams({
            datetime: datetime,
            coordinates: coordinates,
            ayanamsa: 1 // Lahiri Ayanamsa
        });

        const kundliUrl = `https://api.prokerala.com/astrology/kundli?${params.toString()}`;
        const dashaUrl = `https://api.prokerala.com/astrology/major-dasha?${params.toString()}`;

        console.log('Making GET API calls to ProKerala with corrected URLs...');
        
        // --- 4. Make the secure, server-to-server API calls using GET ---
        const [kundliResponse, dashaResponse] = await Promise.all([
            fetch(kundliUrl, { method: 'GET', headers }),
            fetch(dashaUrl, { method: 'GET', headers })
        ]);

        console.log('ProKerala API responses received.');
        const kundliData = await kundliResponse.json();
        const dashaData = await dashaResponse.json();
        
        if (!kundliResponse.ok) throw new Error(kundliData.errors ? kundliData.errors[0].detail.replace('{value}', datetime) : 'Kundli API error.');
        if (!dashaResponse.ok) throw new Error(dashaData.errors ? dashaData.errors[0].detail.replace('{value}', datetime) : 'Dasha API error.');

        console.log('Successfully fetched data. Sending back to client.');
        
        // --- 5. Send the successful response back to the frontend ---
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

