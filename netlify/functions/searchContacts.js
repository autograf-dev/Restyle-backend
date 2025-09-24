const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

exports.handler = async function (event) {
  try {
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

    // Single search param ?s=query
    const { s, page, limit } = event.queryStringParameters || {};

    // Required fields
    const locationId = '7LYI93XFo8j4nZfswlaz'; // replace with your actual locationId
    const pageNum = parseInt(page) || 1;
    const pageLimit = parseInt(limit) || 20; // default 20

    const payload = {
      locationId,
      page: pageNum,
      pageLimit
    };

    if (s) {
      payload.query = s;
    }

    // POST to LeadConnector search endpoint
    const response = await axios.post(
      'https://services.leadconnectorhq.com/contacts/search',
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Version: '2021-07-28'
        }
      }
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: '✅ Contacts search successful',
        query: s || null,
        page: pageNum,
        limit: pageLimit,
        total: response.data.total,
        results: response.data.contacts || []
      })
    };
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error('❌ Searching contacts failed:', message);

    return {
      statusCode: status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Searching contacts failed',
        details: message
      })
    };
  }
};
