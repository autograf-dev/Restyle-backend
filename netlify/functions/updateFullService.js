const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("📝 updateFullService function - GoHighLevel style service update - 2025-09-24");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

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

    // Parse request body
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseErr) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { serviceId, ...updateData } = requestData;

    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'serviceId is required' })
      };
    }

    // First, get the existing service
    console.log('📝 Fetching existing service:', serviceId);
    
    const existingResponse = await axios.get(
      `https://services.leadconnectorhq.com/calendars/${serviceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    const existingService = existingResponse.data.calendar;
    
    // Extract update data with defaults from existing service
    const {
      name = existingService.name,
      duration = existingService.slotDuration * (existingService.slotDurationUnit === 'hours' ? 60 : 1),
      durationUnit = 'mins',
      price,
      currency = 'CA$',
      selectedStaff,
      slotInterval = existingService.slotInterval,
      slotBufferBefore = existingService.preBuffer,
      slotBufferAfter = 0,
      autoConfirm = existingService.autoConfirm,
      allowReschedule = existingService.allowReschedule,
      allowCancellation = existingService.allowCancellation,
      eventColor = existingService.eventColor,
      description = '',
      notes = existingService.notes
    } = updateData;

    // Build team members array if staff selection provided
    let teamMembers = existingService.teamMembers;
    if (selectedStaff && Array.isArray(selectedStaff)) {
      teamMembers = selectedStaff.map(userId => ({
        priority: 0.5,
        selected: true,
        userId: userId,
        isZoomAdded: "false",
        zoomOauthId: "",
        locationConfigurations: [
          {
            location: "",
            position: 0,
            kind: "custom",
            zoomOauthId: "",
            meetingId: "custom_0"
          }
        ]
      }));
    }

    // Build service description with price
    let serviceDescription = existingService.description;
    if (price !== undefined) {
      serviceDescription = price 
        ? `<p style="margin:0px;color:#10182899">${currency}${price}</p>${description ? `<br>${description}` : ''}`
        : description;
    }

    // Convert duration based on unit
    let slotDuration, slotDurationUnit;
    if (durationUnit === 'hours') {
      slotDuration = duration;
      slotDurationUnit = 'hours';
    } else {
      slotDuration = Math.ceil(duration / 60);
      slotDurationUnit = 'hours';
    }

    // Build update payload
    const updatePayload = {
      ...existingService,
      name: name.trim(),
      description: serviceDescription,
      teamMembers: teamMembers,
      eventTitle: `{{contact.name}} ${name.trim()} with {{appointment.user.name}}`,
      eventColor: eventColor,
      slotDuration: slotDuration,
      slotDurationUnit: slotDurationUnit,
      slotInterval: slotInterval,
      slotBuffer: slotBufferBefore,
      preBuffer: slotBufferBefore,
      autoConfirm: autoConfirm,
      allowReschedule: allowReschedule,
      allowCancellation: allowCancellation,
      notes: notes
    };

    console.log('📝 Updating service:', name, 'with', teamMembers.length, 'staff members');

    // Update the service in GoHighLevel
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

    const updatedService = response.data;

    console.log('📝 Service updated successfully:', serviceId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service updated successfully',
        service: updatedService,
        serviceId: serviceId,
        updatedFields: {
          name: name !== existingService.name,
          duration: updateData.duration !== undefined,
          price: updateData.price !== undefined,
          staff: selectedStaff !== undefined,
          settings: updateData.autoConfirm !== undefined || updateData.allowReschedule !== undefined
        }
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
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};