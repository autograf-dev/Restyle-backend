const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👥➕ manageServiceStaff function - Assign/Remove staff from services - 2025-09-24");

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

    const { serviceId, action, staffIds } = requestData;

    if (!serviceId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'serviceId is required' })
      };
    }

    if (!action || !['assign', 'remove', 'replace'].includes(action)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'action must be "assign", "remove", or "replace"' })
      };
    }

    if (!Array.isArray(staffIds) || staffIds.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'staffIds must be a non-empty array' })
      };
    }

    // First, get the existing service
    console.log('👥➕ Fetching existing service:', serviceId);
    
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
    let currentTeamMembers = existingService.teamMembers || [];
    
    // Perform the requested action
    let newTeamMembers;
    let actionDescription;

    switch (action) {
      case 'assign':
        // Add new staff to existing team members (avoid duplicates)
        const existingUserIds = currentTeamMembers.map(tm => tm.userId);
        const newStaffIds = staffIds.filter(id => !existingUserIds.includes(id));
        
        const additionalMembers = newStaffIds.map(userId => ({
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
        
        newTeamMembers = [...currentTeamMembers, ...additionalMembers];
        actionDescription = `Assigned ${newStaffIds.length} new staff members`;
        break;

      case 'remove':
        // Remove specified staff from team members
        newTeamMembers = currentTeamMembers.filter(tm => !staffIds.includes(tm.userId));
        actionDescription = `Removed ${currentTeamMembers.length - newTeamMembers.length} staff members`;
        break;

      case 'replace':
        // Replace all team members with new staff
        newTeamMembers = staffIds.map(userId => ({
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
        actionDescription = `Replaced all staff with ${staffIds.length} staff members`;
        break;
    }

    if (newTeamMembers.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Service must have at least one staff member assigned' })
      };
    }

    // Build update payload
    const updatePayload = {
      ...existingService,
      teamMembers: newTeamMembers
    };

    console.log('👥➕ Updating service staff:', actionDescription);

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

    console.log('👥➕ Service staff updated successfully:', serviceId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Service staff updated successfully',
        action: action,
        actionDescription: actionDescription,
        service: updatedService,
        serviceId: serviceId,
        previousStaffCount: currentTeamMembers.length,
        newStaffCount: newTeamMembers.length,
        staffAssigned: newTeamMembers.map(tm => tm.userId)
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error managing service staff:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to manage service staff',
        details: message,
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};