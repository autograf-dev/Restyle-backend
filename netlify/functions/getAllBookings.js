const axios = require('axios');
const { getValidAccessToken } = require('../../supbase'); // unified helper for token

// Hardcoded locationId
const LOCATION_ID = '7LYI93XFo8j4nZfswlaz';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

exports.handler = async function (event) {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
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

    // Get query parameters for pagination and filtering
    const params = event.queryStringParameters || {};
    const limit = params.limit || 100; // Default limit
    const skip = params.skip || 0; // Default skip
    const startDate = params.startDate; // Optional date filter
    const endDate = params.endDate; // Optional date filter

    // Step 1: Get all calendars from the location
    console.log('📋 Fetching all calendars...');
    const calendarsResponse = await axios.get(
      `https://services.leadconnectorhq.com/calendars/?locationId=${LOCATION_ID}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          Version: '2021-04-15'
        }
      }
    );

    const calendars = calendarsResponse.data.calendars || [];
    console.log(`📅 Found ${calendars.length} calendars`);

    // Step 2: Try different approaches to get all appointments
    console.log('📊 Fetching all appointments...');
    const allAppointments = [];

    // Try multiple approaches to get appointments
    let methodUsed = 'none';

    // Get all calendars for this location to use in appointments API
    const calendarIds = calendars.map(cal => cal.id).filter(Boolean);
    console.log(`📅 Calendar IDs found: ${calendarIds.join(', ')}`);

    // Approach 1: Try the correct GHL appointments API endpoint
    const approaches = [
      // V1 API approach with calendar IDs
      ...calendarIds.map(calendarId => ({
        name: `ghl_v1_appointments_calendar_${calendarId}`,
        url: () => {
          const now = new Date();
          const startDate = new Date(now.getFullYear() - 1, 0, 1); // Start from last year
          const endDate = new Date(now.getFullYear() + 1, 11, 31); // Go to next year
          const startEpoch = Math.floor(startDate.getTime());
          const endEpoch = Math.floor(endDate.getTime());
          return `https://rest.gohighlevel.com/v1/appointments/?startDate=${startEpoch}&endDate=${endEpoch}&calendarId=${calendarId}&includeAll=true`;
        },
        version: null, // V1 API doesn't use version header
        useLocationKey: true
      })),
      
      // Original leadconnectorhq approaches as fallback
      {
        name: 'leadconnector_appointments_with_location_and_dates',
        url: () => {
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 1);
          const startDateStr = startDate.toISOString().split('T')[0];
          const endDateStr = endDate.toISOString().split('T')[0];
          return `https://services.leadconnectorhq.com/calendars/events/appointments?locationId=${LOCATION_ID}&startDate=${startDateStr}&endDate=${endDateStr}`;
        },
        version: '2021-04-15',
        useLocationKey: false
      },
      {
        name: 'leadconnector_appointments_with_location_only',
        url: () => `https://services.leadconnectorhq.com/calendars/events/appointments?locationId=${LOCATION_ID}`,
        version: '2021-04-15',
        useLocationKey: false
      }
    ];

    for (const approach of approaches) {
      try {
        console.log(`🔍 Trying ${approach.name}...`);
        const url = approach.url();
        console.log(`📡 URL: ${url}`);
        
        // Prepare headers based on API type
        const headers = {
          Accept: 'application/json'
        };

        if (approach.useLocationKey) {
          // For V1 API, we might need location-specific API key instead of access token
          // For now, let's try with the access token we have
          headers.Authorization = `Bearer ${accessToken}`;
        } else {
          headers.Authorization = `Bearer ${accessToken}`;
          if (approach.version) {
            headers.Version = approach.version;
          }
        }

        const appointmentsResponse = await axios.get(url, { headers });

        console.log(`📊 Response status: ${appointmentsResponse.status}`);
        console.log(`📦 Response data keys:`, Object.keys(appointmentsResponse.data || {}));
        
        // Try different possible data structures
        let appointments = [];
        if (appointmentsResponse.data) {
          if (appointmentsResponse.data.events) {
            appointments = appointmentsResponse.data.events;
          } else if (appointmentsResponse.data.appointments) {
            appointments = appointmentsResponse.data.appointments;
          } else if (Array.isArray(appointmentsResponse.data)) {
            appointments = appointmentsResponse.data;
          } else if (appointmentsResponse.data.data && Array.isArray(appointmentsResponse.data.data)) {
            appointments = appointmentsResponse.data.data;
          }
        }

        if (appointments && appointments.length > 0) {
          allAppointments.push(...appointments);
          methodUsed = approach.name;
          console.log(`✅ ${approach.name}: Found ${appointments.length} appointments`);
          break; // Stop trying other approaches if we found appointments
        } else {
          console.log(`⚠️ ${approach.name}: No appointments found in response`);
        }
      } catch (err) {
        console.log(`❌ ${approach.name} failed:`, err.response?.status, err.response?.data || err.message);
      }
    }

    // If no direct methods worked, try the contacts fallback
    if (allAppointments.length === 0) {
      console.log('🔄 All direct methods failed, trying contacts approach...');
      methodUsed = 'contacts_fallback';
      
      // Approach 2: Fallback - Get all contacts and their appointments
      console.log('🔄 Falling back to contacts approach...');
      
      const allContacts = [];
      let hasMore = true;
      let contactSkip = 0;
      const contactLimit = 100;

      while (hasMore) {
        try {
          const contactsResponse = await axios.get(
            `https://services.leadconnectorhq.com/contacts/?locationId=${LOCATION_ID}&limit=${contactLimit}&skip=${contactSkip}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                Version: '2021-07-28'
              }
            }
          );

          const contacts = contactsResponse.data.contacts || [];
          allContacts.push(...contacts);
          
          if (contacts.length < contactLimit) {
            hasMore = false;
          } else {
            contactSkip += contactLimit;
            await delay(100);
          }
        } catch (err) {
          console.error('❌ Error fetching contacts:', err.response?.data || err.message);
          hasMore = false;
        }
      }

      console.log(`📞 Found ${allContacts.length} contacts, fetching their appointments...`);

      // Get appointments for each contact
      const contactChunks = chunkArray(allContacts, 10);

      for (const chunk of contactChunks) {
        const appointmentPromises = chunk.map(async (contact) => {
          try {
            const appointmentResponse = await axios.get(
              `https://services.leadconnectorhq.com/contacts/${contact.id}/appointments`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/json',
                  Version: '2021-07-28'
                }
              }
            );

            const appointments = appointmentResponse.data.appointments || [];
            
            return appointments.map(appointment => ({
              ...appointment,
              contactInfo: {
                id: contact.id,
                name: contact.name,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone
              }
            }));
          } catch (err) {
            console.warn(`⚠️ Failed to fetch appointments for contact ${contact.id}:`, err.message);
            return [];
          }
        });

        const chunkResults = await Promise.allSettled(appointmentPromises);
        
        chunkResults.forEach(result => {
          if (result.status === 'fulfilled') {
            allAppointments.push(...result.value);
          }
        });

        await delay(100);
      }
    }

    console.log(`📊 Total appointments found: ${allAppointments.length}`);

    // Step 3: Apply date filtering if provided
    let filteredAppointments = allAppointments;
    
    if (startDate || endDate) {
      filteredAppointments = allAppointments.filter(appointment => {
        const appointmentDate = new Date(appointment.startTime || appointment.dateAdded);
        
        if (startDate && appointmentDate < new Date(startDate)) {
          return false;
        }
        if (endDate && appointmentDate > new Date(endDate)) {
          return false;
        }
        return true;
      });
    }

    // Step 4: Sort by date (newest first)
    filteredAppointments.sort((a, b) => {
      const dateA = new Date(a.startTime || a.dateAdded);
      const dateB = new Date(b.startTime || b.dateAdded);
      return dateB - dateA;
    });

    // Step 5: Apply pagination
    const startIndex = parseInt(skip);
    const endIndex = startIndex + parseInt(limit);
    const paginatedAppointments = filteredAppointments.slice(startIndex, endIndex);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: '✅ All bookings fetched successfully',
        data: {
          appointments: paginatedAppointments,
          total: filteredAppointments.length,
          returned: paginatedAppointments.length,
          skip: startIndex,
          limit: parseInt(limit)
        },
        meta: {
          calendarsFound: calendars.length,
          totalAppointments: allAppointments.length,
          filteredAppointments: filteredAppointments.length,
          method: methodUsed,
          locationId: LOCATION_ID
        }
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error('❌ Fetching all bookings failed:', message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Fetching all bookings failed',
        details: message
      })
    };
  }
};

// Helper function to chunk array into smaller pieces
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
