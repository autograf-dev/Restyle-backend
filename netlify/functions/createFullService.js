const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("🎯 createFullService function - GoHighLevel style service creation - 2025-09-24");

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

    // Extract service data with validation
    const {
      name,
      duration = 60, // minutes
      durationUnit = 'mins',
      price,
      currency = 'CA$',
      selectedStaff = [], // array of userIds
      locationId = '7LYI93XFo8j4nZfswlaz',
      slotInterval = 15,
      slotBufferBefore = 0,
      slotBufferAfter = 0,
      autoConfirm = true,
      allowReschedule = true,
      allowCancellation = true,
      eventColor = '#039BE5',
      description = '',
      notes = ''
    } = requestData;

    // Validation
    if (!name || name.trim() === '') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Service name is required' })
      };
    }

    if (!Array.isArray(selectedStaff) || selectedStaff.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'At least one staff member must be selected' })
      };
    }

    // Build team members array for GoHighLevel
    const teamMembers = selectedStaff.map(userId => ({
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

    // Build service description with price
    const serviceDescription = price 
      ? `<p style="margin:0px;color:#10182899">${currency}${price}</p>${description ? `<br>${description}` : ''}`
      : description;

    // Convert duration based on unit
    let slotDuration, slotDurationUnit;
    if (durationUnit === 'hours') {
      slotDuration = duration;
      slotDurationUnit = 'hours';
    } else {
      slotDuration = Math.ceil(duration / 60); // Convert minutes to hours, round up
      slotDurationUnit = 'hours';
    }

    // Build service payload for GoHighLevel API
    const servicePayload = {
      locationId: locationId,
      name: name.trim(),
      description: serviceDescription,
      teamMembers: teamMembers,
      eventType: "RoundRobin_OptimizeForEqualDistribution",
      widgetSlug: `service_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      calendarType: "service_booking",
      widgetType: "default",
      eventTitle: `{{contact.name}} ${name.trim()} with {{appointment.user.name}}`,
      eventColor: eventColor,
      slotDuration: slotDuration,
      slotDurationUnit: slotDurationUnit,
      slotInterval: slotInterval,
      slotIntervalUnit: "mins",
      slotBufferUnit: "mins",
      slotBuffer: slotBufferBefore,
      appoinmentPerSlot: 1,
      appoinmentPerDay: 9007199254740991,
      openHours: [
        // Default: All days 24/7 (you can modify this as needed)
        { daysOfTheWeek: [0], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [1], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [2], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [3], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [4], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [5], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] },
        { daysOfTheWeek: [6], hours: [{ openHour: 0, openMinute: 0, closeHour: 23, closeMinute: 55 }] }
      ],
      enableRecurring: false,
      recurring: {
        count: 1,
        bookingOption: "skip",
        bookingOverlapDefaultStatus: "",
        interval: null,
        freq: "DAILY",
        monthDays: [],
        weekDays: []
      },
      formId: "",
      stickyContact: false,
      isLivePaymentMode: false,
      autoConfirm: autoConfirm,
      googleInvitationEmails: true,
      allowReschedule: allowReschedule,
      allowCancellation: allowCancellation,
      shouldAssignContactToTeamMember: false,
      shouldSkipAssigningContactForExisting: false,
      notes: notes || `Phone:- {{contact.phone}}\nEmail:- {{contact.email}}\n\nNeed to make a change to this event?\nReschedule:- {{reschedule_link}}\n\nCancel:- {{cancellation_link}}`,
      pixelId: "",
      formSubmitType: "ThankYouMessage",
      formSubmitThanksMessage: "Thank you for your appointment request. We will contact you shortly to confirm your request. Please call our office at {{contactMethod}} if you have any questions.",
      availabilities: [],
      guestType: "collect_detail",
      consentLabel: "I confirm that I want to receive content from this company using any contact information I provide.",
      calendarCoverImage: "",
      lookBusyConfig: {
        enabled: false,
        lookBusyPercentage: 0
      },
      allowBookingAfterUnit: "days",
      allowBookingAfter: 0,
      allowBookingForUnit: "days",
      allowBookingFor: 365,
      preBufferUnit: "mins",
      preBuffer: slotBufferBefore,
      isActive: true
    };

    console.log('🎯 Creating service:', name, 'with', selectedStaff.length, 'staff members');

    // Create the service in GoHighLevel
    const response = await axios.post(
      'https://services.leadconnectorhq.com/calendars/',
      servicePayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15',
          'Content-Type': 'application/json'
        }
      }
    );

    const createdService = response.data;

    console.log('🎯 Service created successfully:', createdService.calendar?.id || 'ID not available');

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service created successfully',
        service: createdService,
        serviceId: createdService.calendar?.id,
        requestData: {
          name,
          duration: `${duration} ${durationUnit}`,
          price: price ? `${currency}${price}` : 'No price set',
          staffCount: selectedStaff.length,
          selectedStaff
        }
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
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};