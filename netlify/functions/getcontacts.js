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

    // Page param (default = 1)
    const { page } = event.queryStringParameters || {};
    const pageNum = parseInt(page) || 1;

    // Base URL
    let url = `https://services.leadconnectorhq.com/contacts/?locationId=7LYI93XFo8j4nZfswlaz&page=${pageNum}`;

    // Call LeadConnector API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        Version: '2021-07-28'
      }
    });

    const { contacts, meta } = response.data;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: '✅ Contacts fetched successfully',
        page: meta.currentPage || pageNum,
        total: meta.total,
        nextPage: meta.nextPage,
        prevPage: meta.prevPage,
        contacts
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
