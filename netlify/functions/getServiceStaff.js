const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥📋 getServiceStaff function - Staff Management API");

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

    // Get service ID from query parameters
    const serviceId = event.queryStringParameters?.id;
    const includeDetails = event.queryStringParameters?.includeDetails === 'true';

    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing serviceId in query string (?id=...)' })
      };
    }

    console.log('👥📋 Fetching staff for service:', serviceId, 'Include details:', includeDetails);

    // Get service data to extract team members
    const serviceResponse = await axios.get(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    const teamMembers = serviceResponse.data.teamMembers || [];
    
    if (!includeDetails) {
      // Return just the staff IDs
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          serviceId: serviceId,
          serviceName: serviceResponse.data.name,
          staffIds: teamMembers,
          staffCount: teamMembers.length
        })
      };
    }

    // Fetch detailed information for each staff member
    const staffDetails = [];
    
    for (const staffId of teamMembers) {
      try {
        const staffResponse = await axios.get(
          `https://services.leadconnectorhq.com/users/${staffId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Version: '2021-04-15'
            }
          }
        );

        staffDetails.push({
          id: staffId,
          ...staffResponse.data,
          // Add computed fields for easier frontend consumption
          displayName: staffResponse.data.name || staffResponse.data.firstName + ' ' + staffResponse.data.lastName,
          isActive: staffResponse.data.deleted !== true
        });

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (staffErr) {
        console.warn(`⚠️ Could not fetch details for staff ${staffId}:`, staffErr.message);
        staffDetails.push({
          id: staffId,
          error: 'Could not fetch staff details',
          displayName: 'Unknown Staff Member'
        });
      }
    }

    console.log('✅ Service staff retrieved successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        serviceId: serviceId,
        serviceName: serviceResponse.data.name,
        staffCount: teamMembers.length,
        staff: staffDetails
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching service staff:", message);

    if (status === 404) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Service not found',
          success: false
        })
      };
    }

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch service staff',
        details: message,
        success: false
      })
    };
  }
};