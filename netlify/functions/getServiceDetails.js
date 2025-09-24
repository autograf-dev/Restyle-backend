const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("📋 getServiceDetails function - Service Management API");

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
    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing serviceId in query string (?id=...)' })
      };
    }

    console.log('📋 Fetching service details for:', serviceId);

    // Get service details via HighLevel API
    const response = await axios.get(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    const service = response.data;
    
    // Enhance the response with formatted data
    const enhancedService = {
      ...service,
      // Add computed fields for easier frontend consumption
      durationDisplay: `${service.slotDuration || service.duration || 30} minutes`,
      bufferDisplay: `${service.slotBuffer || service.bufferTimeAfter || 0} minutes`,
      bookingWindow: {
        afterHours: Math.floor((service.allowBookingAfter || 1440) / 60),
        forDays: Math.floor((service.allowBookingFor || 43200) / 1440)
      },
      isActive: service.isActive !== false, // Default to true if undefined
      teamMemberCount: service.teamMembers ? service.teamMembers.length : 0
    };

    console.log('✅ Service details retrieved successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        service: enhancedService
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching service details:", message);

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
        error: 'Failed to fetch service details',
        details: message,
        success: false
      })
    };
  }
};