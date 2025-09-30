const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("📒 listbooking function - list calendar events with pagination");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

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

    const qp = event.queryStringParameters || {};

    const locationId = qp.locationId || '7LYI93XFo8j4nZfswlaz';
    const userId = qp.userId;
    const calendarId = qp.calendarId;
    const groupId = qp.groupId;
    const startTime = qp.startTime;
    const endTime = qp.endTime;
    const page = qp.page ? Number(qp.page) : undefined; // optional
    const limit = qp.limit ? Number(qp.limit) : undefined; // optional

    // Validation
    if (!locationId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'locationId is required' })
      };
    }

    if (!userId && !calendarId && !groupId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'One of userId, calendarId, or groupId is required' })
      };
    }

    if (!startTime || !endTime) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'startTime and endTime (in millis) are required' })
      };
    }

    const params = {
      locationId,
      startTime,
      endTime
    };

    if (userId) params.userId = userId;
    if (calendarId) params.calendarId = calendarId;
    if (groupId) params.groupId = groupId;
    if (typeof page === 'number' && !Number.isNaN(page)) params.page = page;
    if (typeof limit === 'number' && !Number.isNaN(limit)) params.limit = limit;

    console.log('📒 Fetching events with params:', params);

    const response = await axios.get('https://services.leadconnectorhq.com/calendars/events', {
      params,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        Version: '2021-04-15'
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        params,
        data: response.data
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error('❌ Error listing bookings:', details);
    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to list bookings', details })
    };
  }
};

const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("📒 listbooking function - list calendar events (bookings)");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

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

    const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';

    // Default locationId if not supplied
    const url = new URL(`https://services.leadconnectorhq.com/calendars/events${qs}`);
    if (!url.searchParams.get('locationId')) {
      url.searchParams.set('locationId', '7LYI93XFo8j4nZfswlaz');
    }

    // Optional: simple pagination defaults if none provided
    if (!url.searchParams.get('page')) {
      url.searchParams.set('page', '1');
    }
    if (!url.searchParams.get('limit')) {
      url.searchParams.set('limit', '50');
    }

    console.log('📒 Fetching bookings from:', url.toString());

    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        Version: '2021-04-15'
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, query: Object.fromEntries(url.searchParams.entries()), data: response.data })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error('❌ Error listing bookings:', details);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Failed to list bookings', details })
    };
  }
};


