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

    // Approach 1: Try to get appointments directly from calendars/events/appointments
    try {
      console.log('🔍 Trying direct appointments endpoint...');
      
      // Calculate date range (last 6 months to next 6 months)
      const now = new Date();
      const startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 6);
      const endDate = new Date(now);
      endDate.setMonth(now.getMonth() + 6);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const appointmentsResponse = await axios.get(
        `https://services.leadconnectorhq.com/calendars/events/appointments?locationId=${LOCATION_ID}&startDate=${startDateStr}&endDate=${endDateStr}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            Version: '2021-04-15'
          }
        }
      );

      if (appointmentsResponse.data && appointmentsResponse.data.events) {
        allAppointments.push(...appointmentsResponse.data.events);
        console.log(`✅ Direct method: Found ${appointmentsResponse.data.events.length} appointments`);
      }
    } catch (directErr) {
      console.log('⚠️ Direct appointments endpoint failed:', directErr.response?.data || directErr.message);
      
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
          method: allAppointments.length > 0 ? 'direct' : 'contacts_fallback'
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
