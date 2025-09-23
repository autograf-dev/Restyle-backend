const axios = require('axios');
const { getValidAccessToken } = require('../../supbase'); // unified helper for token

// Hardcoded locationId
const LOCATION_ID = '7LYI93XFo8j4nZfswlaz';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

exports.handler = async function (event) {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    const data = JSON.parse(event.body);

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'name', 'phone'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Missing required field: ${field}` })
        };
      }
    }

    // Prepare payload with hardcoded locationId
    const payload = {
      firstName: data.firstName,
      lastName: data.lastName,
      name: data.name,
      email: data.email,
      phone: data.phone,
      locationId: LOCATION_ID,  // hardcoded
      ...data.optionalFields   // include optional fields if any
    };

    // Create contact via LeadConnectorHQ API
    const response = await axios.post(
      'https://services.leadconnectorhq.com/contacts/',
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Version: '2021-07-28'
        }
      }
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: '✅ Contact created successfully',
        contact: response.data
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error('❌ Adding contact failed:', message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Adding contact failed',
        details: message
      })
    };
  }
};
