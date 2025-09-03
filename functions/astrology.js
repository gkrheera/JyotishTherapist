// This is your secure backend function.
// It runs in the cloud, not in the browser.

// We use 'node-fetch' for making API calls in a Node.js environment.
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // --- 1. Get Secret Keys from Environment Variables ---
    // These are set in your Netlify dashboard, not in the code.
    const CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
    const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

    // --- 2. Check for missing keys ---
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API credentials are not set up in the serverless environment.' })
        };
    }

    // --- 3. Get birth data from the frontend request ---
    const { datetime, coordinates, timezone } = JSON.parse(event.body);
    
    // --- 4. Prepare the API request to ProKerala ---
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const headers = {
        'Authorization': `Bearer ${authString}`,
        'Content-Type': 'application/json'
    };
    const body = JSON.stringify({
        datetime: datetime,
        coordinates: coordinates,
        ayanamsa: 1, // Lahiri Ayanamsa
        timezone: timezone
    });
    
    const kundliUrl = 'https://api.prokerala.com/v2/astrology/kundli';
    const dashaUrl = 'https://api.prokerala.com/v2/astrology/major-dasha';

    try {
        // --- 5. Make the secure, server-to-server API calls ---
        const [kundliResponse, dashaResponse] = await Promise.all([
            fetch(kundliUrl, { method: 'POST', headers, body }),
            fetch(dashaUrl, { method: 'POST', headers, body })
        ]);

        const kundliData = await kundliResponse.json();
        const dashaData = await dashaResponse.json();
        
        if (!kundliResponse.ok) throw new Error(kundliData.errors ? kundliData.errors[0].detail : 'Kundli API error.');
        if (!dashaResponse.ok) throw new Error(dashaData.errors ? dashaData.errors[0].detail : 'Dasha API error.');

        // --- 6. Send the successful response back to the frontend ---
        return {
            statusCode: 200,
            body: JSON.stringify({ kundliData, dashaData })
        };

    } catch (error) {
        console.error('Serverless Function Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
