const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥 assignStaffToService function - Staff Management API");

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
    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing serviceId in query string (?id=...)' })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { staffIds, staffId } = body;

    // Support both single staff ID and array of staff IDs
    const staffToAdd = staffIds || (staffId ? [staffId] : []);

    if (!staffToAdd.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing staff IDs. Provide either staffId (string) or staffIds (array)',
          received: body
        })
      };
    }

    console.log('👥 Assigning staff to service:', serviceId, 'Staff IDs:', staffToAdd);

    // Get current service data
    const currentService = await axios.get(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    // Merge current team members with new ones (avoid duplicates)
    const currentStaff = currentService.data.teamMembers || [];
    const updatedStaff = [...new Set([...currentStaff, ...staffToAdd])];

    // Update service with new team members
    const updatePayload = {
      ...currentService.data,
      teamMembers: updatedStaff
    };

    const response = await axios.put(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Staff assigned successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Staff assigned to service successfully',
        serviceId: serviceId,
        addedStaff: staffToAdd,
        totalStaff: updatedStaff.length,
        allTeamMembers: updatedStaff
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error assigning staff to service:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to assign staff to service',
        details: message,
        success: false
      })
    };
  }
};