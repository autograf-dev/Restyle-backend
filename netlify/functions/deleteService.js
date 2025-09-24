const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("🗑️ deleteService function - Service Management API");

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
    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing serviceId in query string (?id=...)' })
      };
    }

    console.log('🗑️ Deleting service:', serviceId);

    // First, get service details for logging
    let serviceDetails = null;
    try {
      const serviceResponse = await axios.get(
        `https://services.leadconnectorhq.com/calendars/${serviceId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: '2021-04-15'
          }
        }
      );
      serviceDetails = serviceResponse.data;
      console.log('🗑️ Service to delete:', serviceDetails.name);
    } catch (getErr) {
      console.warn('⚠️ Could not fetch service details before deletion:', getErr.message);
    }

    // Delete service via HighLevel API
    const response = await axios.delete(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    console.log('✅ Service deleted successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service deleted successfully',
        serviceId: serviceId,
        deletedService: serviceDetails?.name || 'Unknown Service'
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error deleting service:", message);

    // Handle case where service doesn't exist
    if (status === 404) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Service not found',
          message: 'The service may have already been deleted',
          success: false
        })
      };
    }

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to delete service',
        details: message,
        success: false
      })
    };
  }
};