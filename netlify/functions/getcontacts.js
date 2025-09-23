const axios = require('axios');
const { getValidAccessToken } = require('../../supbase'); // unified helper for token

exports.handler = async function (event) {
  try {
    // Get a valid access token
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    // Check if frontend sent a nextPageUrl
    const { nextPageUrl } = event.queryStringParameters || {};

    // Default: first page
    let url = nextPageUrl || `https://services.leadconnectorhq.com/contacts/?locationId=7LYI93XFo8j4nZfswlaz`;

    // Fetch contacts
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        Version: '2021-07-28'
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: '✅ Contacts fetched successfully',
        contacts: response.data.contacts,
        meta: response.data.meta // frontend ko aage nextPageUrl mil jaayega
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error('❌ Fetching contacts failed:', message);

    return {
      statusCode: status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Fetching contacts failed',
        details: message
      })
    };
  }
};
