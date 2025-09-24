const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("⚙️ updateServiceConfig function - Service Configuration API");

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

  // Only allow PUT/PATCH requests
  if (event.httpMethod !== 'PUT' && event.httpMethod !== 'PATCH') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use PUT or PATCH.' })
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

    // Parse configuration updates from request body
    const body = JSON.parse(event.body || '{}');
    const {
      // Duration settings
      duration,
      slotDuration,
      slotInterval,
      bufferTimeAfter,
      bufferTimeBefore,
      slotBuffer,

      // Booking window settings
      allowBookingAfter,   // minutes after current time
      allowBookingFor,     // minutes from current time
      preBookingDays,      // days in advance

      // Availability settings
      openHours,
      isActive,
      
      // Meeting settings
      meetingLocation,
      meetingType,
      eventType,

      // Notification settings
      notifications,

      // Form settings
      formSubmitType,
      formSubmitRedirectURL,
      formSubmitThankYouMessage,

      // Display settings
      eventColor,
      eventTitle,

      // Custom price field (if you want to add this to metadata)
      price,
      currency = 'USD'
    } = body;

    console.log('⚙️ Updating service configuration:', serviceId, 'with:', Object.keys(body));

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

    // Build updated configuration payload
    const configUpdates = {};

    // Duration and timing settings
    if (duration !== undefined) configUpdates.slotDuration = duration;
    if (slotDuration !== undefined) configUpdates.slotDuration = slotDuration;
    if (slotInterval !== undefined) configUpdates.slotInterval = slotInterval;
    if (slotBuffer !== undefined) configUpdates.slotBuffer = slotBuffer;
    if (bufferTimeAfter !== undefined) configUpdates.slotBuffer = bufferTimeAfter;
    
    // Booking window settings  
    if (allowBookingAfter !== undefined) configUpdates.allowBookingAfter = allowBookingAfter;
    if (allowBookingFor !== undefined) configUpdates.allowBookingFor = allowBookingFor;
    if (preBookingDays !== undefined) configUpdates.preBookingDays = preBookingDays;

    // Availability settings
    if (openHours !== undefined) configUpdates.openHours = openHours;
    if (isActive !== undefined) configUpdates.isActive = isActive;

    // Meeting settings
    if (meetingLocation !== undefined) configUpdates.meetingLocation = meetingLocation;
    if (meetingType !== undefined) configUpdates.meetingType = meetingType;
    if (eventType !== undefined) configUpdates.eventType = eventType;

    // Notification settings
    if (notifications !== undefined) configUpdates.notifications = notifications;

    // Form settings
    if (formSubmitType !== undefined) configUpdates.formSubmitType = formSubmitType;
    if (formSubmitRedirectURL !== undefined) configUpdates.formSubmitRedirectURL = formSubmitRedirectURL;
    if (formSubmitThankYouMessage !== undefined) configUpdates.formSubmitThankYouMessage = formSubmitThankYouMessage;

    // Display settings
    if (eventColor !== undefined) configUpdates.eventColor = eventColor;
    if (eventTitle !== undefined) configUpdates.eventTitle = eventTitle;

    // Add price to custom fields if provided
    if (price !== undefined) {
      configUpdates.customFields = {
        ...currentService.data.customFields,
        price: price,
        currency: currency,
        priceFormatted: `${currency} ${price}`
      };
    }

    // Merge with current service data
    const updatedPayload = {
      ...currentService.data,
      ...configUpdates
    };

    // Update service configuration via HighLevel API
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

    console.log('✅ Service configuration updated successfully');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service configuration updated successfully',
        serviceId: serviceId,
        updatedFields: Object.keys(configUpdates),
        configuration: {
          duration: response.data.slotDuration,
          bufferTime: response.data.slotBuffer,
          bookingWindow: {
            afterHours: Math.floor((response.data.allowBookingAfter || 1440) / 60),
            forDays: Math.floor((response.data.allowBookingFor || 43200) / 1440)
          },
          isActive: response.data.isActive,
          meetingLocation: response.data.meetingLocation,
          price: response.data.customFields?.price || null
        }
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error updating service configuration:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to update service configuration',
        details: message,
        success: false
      })
    };
  }
};