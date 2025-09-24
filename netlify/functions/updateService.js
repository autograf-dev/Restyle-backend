const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("✏️ updateService function - Service Management API");

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

  // Only allow PUT requests
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use PUT.' })
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

    // Parse request body with updates
    const body = JSON.parse(event.body || '{}');
    const updates = { ...body };

    console.log('✏️ Updating service:', serviceId, 'with data:', JSON.stringify(updates, null, 2));

    // Get current service data first
    const currentService = await axios.get(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    // Merge current data with updates
    const updatedPayload = {
      ...currentService.data,
      ...updates,
      // Ensure these fields are properly formatted if provided
      slug: updates.name ? updates.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : currentService.data.slug,
    };

    // Update service via HighLevel API
    const response = await axios.put(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      updatedPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Service updated successfully:', response.data);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service updated successfully',
        service: response.data,
        serviceId: serviceId,
        updatedFields: Object.keys(updates)
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error updating service:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to update service',
        details: message,
        success: false
      })
    };
  }
};