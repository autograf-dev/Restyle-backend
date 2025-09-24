const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥 getAvailableStaff function - Staff dropdown data - 2025-09-24");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight request
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

    const locationId = event.queryStringParameters?.locationId || '7LYI93XFo8j4nZfswlaz';

    console.log('👥 Fetching available staff for dropdown, location:', locationId);

    // Get all users for the location
    const response = await axios.get(
      `https://services.leadconnectorhq.com/users/?locationId=${locationId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    const users = response.data.users || response.data || [];

    // Format staff for dropdown usage
    const staffDropdown = users.map(user => ({
      value: user.id,
      label: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      id: user.id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      roles: user.roles
    }));

    console.log('👥 Retrieved staff for dropdown:', staffDropdown.length);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        locationId: locationId,
        totalStaff: staffDropdown.length,
        staff: staffDropdown,
        dropdownOptions: staffDropdown // explicit dropdown format
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching available staff:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ error: message })
    };
  }
};