const axios = require('axios');
const { getValidAccessToken } = require('../../supbase'); // updated helper path

console.log("👥 Staff function - updated 2025-09-24");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
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

    const userId = event.queryStringParameters?.id;
    const locationId = event.queryStringParameters?.locationId || '7LYI93XFo8j4nZfswlaz';

    let url;
    let responseMessage;

    if (userId) {
      // Get specific user by ID
      url = `https://services.leadconnectorhq.com/users/${userId}`;
      responseMessage = `staff member ${userId}`;
    } else {
      // Get all users for the location
      url = `https://services.leadconnectorhq.com/users/?locationId=${locationId}`;
      responseMessage = `all staff for location ${locationId}`;
    }

    console.log('👥 Fetching', responseMessage);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: '2021-04-15'
      }
    });

    const data = response.data;
    const staff = userId ? data : (data.users || data);

    console.log('👥 Retrieved staff successfully:', Array.isArray(staff) ? staff.length : 1);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        locationId: locationId,
        staff: staff,
        users: staff, // alias for compatibility
        data: staff,  // another alias for compatibility
        count: Array.isArray(staff) ? staff.length : 1
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching staff:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ error: message })
    };
  }
};
