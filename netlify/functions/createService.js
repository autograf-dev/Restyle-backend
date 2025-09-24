const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("🛠️ createService function - Service Management API");

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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
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

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const {
      name,
      description,
      duration,
      bufferTimeAfter,
      bufferTimeBefore,
      slotDuration,
      slotInterval,
      slotBuffer,
      preBookingDays,
      groupId,
      locationId = '7LYI93XFo8j4nZfswlaz', // default location
      teamMembers = [],
      meetingType = 'Round-Robin-Event',
      eventType = 'RoundRobin_OptimizeForAvailability',
      allowBookingAfter = 1440, // 24 hours in minutes
      allowBookingFor = 43200, // 30 days in minutes
      openHours = [
        { day: 'monday', openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
        { day: 'tuesday', openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
        { day: 'wednesday', openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
        { day: 'thursday', openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
        { day: 'friday', openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 },
        { day: 'saturday', openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 0 },
        { day: 'sunday', openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 0 }
      ],
      isActive = true
    } = body;

    // Validate required fields
    if (!name || !duration || !groupId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: name, duration, groupId',
          received: { name, duration, groupId }
        })
      };
    }

    // Prepare calendar payload for HighLevel API
    const calendarPayload = {
      name,
      description: description || `${name} - Created via Service Management`,
      locationId,
      groupId,
      teamMembers, // Array of user IDs
      eventType,
      meetingType,
      slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Generate URL-friendly slug
      widgetType: 'default',
      calendarType: 'round_robin',
      eventTitle: name,
      eventColor: '#3b82f6', // Default blue color
      meetingLocation: 'Zoom', // Default meeting location
      slotDuration: slotDuration || duration,
      slotInterval: slotInterval || duration,
      slotBuffer: slotBuffer || bufferTimeAfter || 0,
      preBookingDays: preBookingDays || 30,
      allowBookingAfter,
      allowBookingFor,
      openHours,
      isActive,
      // Notification settings
      notifications: {
        type: 'email',
        shouldSendToContact: true,
        shouldSendToGuest: false,
        shouldSendToUser: true,
        shouldSendToAssignedUser: true
      },
      // Form settings
      formSubmitType: 'ThankYouMessage',
      formSubmitRedirectURL: '',
      formSubmitThankYouMessage: 'Thank you for booking with us!'
    };

    console.log('🛠️ Creating service with payload:', JSON.stringify(calendarPayload, null, 2));

    // Create calendar service via HighLevel API
    const response = await axios.post(
      'https://services.leadconnectorhq.com/calendars/',
      calendarPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Service created successfully:', response.data);

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service created successfully',
        service: response.data,
        serviceId: response.data?.id
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error creating service:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to create service',
        details: message,
        success: false
      })
    };
  }
};