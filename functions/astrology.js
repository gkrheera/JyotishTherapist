// This is your secure backend function.
// It runs in the cloud, not in the browser.

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    console.log('Astrology function invoked.');
    console.log('Event Body:', event.body);

    // --- 1. Get Secret Keys from Environment Variables ---
    const CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
    const CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('API credentials are not set up.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API credentials are not set up in the serverless environment.' })
        };
    }

    // --- 2. Get birth data from the frontend request ---
    const { datetime, coordinates, timezone } = JSON.parse(event.body);
    
    // --- 3. Prepare the API request to ProKerala ---
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const headers = {
        'Authorization': `Bearer ${authString}`
    };

    // --- FIX: Construct URL with Query Parameters for a GET request ---
    const params = new URLSearchParams({
        datetime: datetime,
        coordinates: coordinates,
        ayanamsa: 1, // Lahiri Ayanamsa
        timezone: timezone
    });

    const kundliUrl = `https://api.prokerala.com/v2/astrology/kundli?${params.toString()}`;
    const dashaUrl = `https://api.prokerala.com/v2/astrology/major-dasha?${params.toString()}`;

    try {
        console.log('Making GET API calls to ProKerala...');
        // --- 4. Make the secure, server-to-server API calls using GET ---
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
        // --- 5. Send the successful response back to the frontend ---
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

