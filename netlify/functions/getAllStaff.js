const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥📋 getAllStaff function - Staff Management API");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // ✅ Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' })
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

    const locationId = event.queryStringParameters?.locationId || '7LYI93XFo8j4nZfswlaz';
    const includeInactive = event.queryStringParameters?.includeInactive === 'true';

    console.log('👥📋 Fetching all staff for location:', locationId);

    // Fetch all users/staff from HighLevel API
    const response = await axios.get(
      `https://services.leadconnectorhq.com/users/`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        },
        params: {
          locationId: locationId,
          limit: 100 // Adjust as needed
        }
      }
    );

    let staff = response.data?.users || response.data || [];

    // Filter out inactive staff if requested
    if (!includeInactive) {
      staff = staff.filter(member => !member.deleted && member.type !== 'AccountAdmin');
    }

    // Enhance staff data for easier frontend consumption
    const enhancedStaff = staff.map(member => ({
      id: member.id,
      name: member.name || `${member.firstName} ${member.lastName}`.trim(),
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      role: member.role,
      type: member.type,
      isActive: !member.deleted,
      locationId: member.locationId,
      // Add display name for dropdowns
      displayName: member.name || `${member.firstName} ${member.lastName}`.trim() || member.email,
      // Add role info
      roleDisplay: member.role || member.type || 'Staff Member'
    }));

    console.log('✅ All staff retrieved successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        locationId: locationId,
        totalStaff: enhancedStaff.length,
        staff: enhancedStaff,
        filters: {
          includeInactive: includeInactive
        }
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching all staff:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch staff members',
        details: message,
        success: false
      })
    };
  }
};