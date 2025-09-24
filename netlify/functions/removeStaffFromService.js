const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥➖ removeStaffFromService function - Staff Management API");

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

  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use DELETE.' })
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
    const staffIdToRemove = event.queryStringParameters?.staffId;

    if (!serviceId || !staffIdToRemove) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required parameters: id (serviceId) and staffId in query string',
          example: '?id=service123&staffId=staff456'
        })
      };
    }

    console.log('👥➖ Removing staff from service:', serviceId, 'Staff ID:', staffIdToRemove);

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

    // Remove staff member from team
    const currentStaff = currentService.data.teamMembers || [];
    const updatedStaff = currentStaff.filter(staffId => staffId !== staffIdToRemove);

    // Check if staff was actually removed
    const wasRemoved = currentStaff.length !== updatedStaff.length;

    if (!wasRemoved) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Staff member was not found in this service',
          staffId: staffIdToRemove,
          currentStaff: currentStaff
        })
      };
    }

    // Update service with remaining team members
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

    console.log('✅ Staff removed successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Staff removed from service successfully',
        serviceId: serviceId,
        removedStaff: staffIdToRemove,
        remainingStaff: updatedStaff.length,
        allTeamMembers: updatedStaff
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error removing staff from service:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to remove staff from service',
        details: message,
        success: false
      })
    };
  }
};