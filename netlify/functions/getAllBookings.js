const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Get valid access token from Supabase
    const accessToken = await getValidAccessToken();
    
    if (!accessToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    // Hardcoded location ID (from other files in the codebase)
    const locationId = '7LYI93XFo8j4nZfswlaz';
    
    console.log('🔄 Starting to fetch all bookings from GHL...');

    // Since GHL doesn't have a direct "list all appointments" endpoint,
    // we need to get all calendars first, then fetch events for each calendar
    console.log('🔄 Step 1: Fetching all calendars...');
    
    // Get all calendars in the location
    const calendarsResponse = await axios.get(
      `https://services.leadconnectorhq.com/calendars/?locationId=${locationId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-04-15',
          'Accept': 'application/json'
        }
      }
    );

    const calendars = calendarsResponse.data.calendars || calendarsResponse.data || [];
    console.log(`📅 Found ${calendars.length} calendars`);

    if (calendars.length === 0) {
      console.log('⚠️ No calendars found in this location');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          totalAppointments: 0,
          appointments: [],
          message: 'No calendars found in this location',
          fetchedAt: new Date().toISOString()
        })
      };
    }

    // Set date range - get appointments from 1 year ago to 1 year in future
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    const startDate = oneYearAgo.getTime();
    const endDate = oneYearFromNow.getTime();

    console.log('🔄 Step 2: Fetching calendar events for each calendar...');
    
    let allAppointments = [];
    
    // Process calendars in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < calendars.length; i += batchSize) {
      const calendarBatch = calendars.slice(i, i + batchSize);
      
      const batchPromises = calendarBatch.map(async (calendar) => {
        try {
          console.log(`📋 Fetching events for calendar: ${calendar.name} (${calendar.id})`);
          
          // Try the Get Calendar Events endpoint
          const eventsResponse = await axios.get(
            `https://services.leadconnectorhq.com/calendars/events?calendarId=${calendar.id}&startDate=${startDate}&endDate=${endDate}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Version': '2021-04-15',
                'Accept': 'application/json'
              }
            }
          );

          const eventsData = eventsResponse.data;
          const events = eventsData.events || eventsData.appointments || eventsData.data || [];
          
          console.log(`📋 Calendar ${calendar.name}: Found ${events.length} events`);
          console.log(`📋 Events response structure:`, Object.keys(eventsData));
          
          // Add calendar info to each event
          return events.map(event => ({
            ...event,
            calendarInfo: {
              id: calendar.id,
              name: calendar.name
            }
          }));
          
        } catch (error) {
          console.warn(`⚠️ Failed to fetch events for calendar ${calendar.id}:`, error.response?.data || error.message);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Flatten and add to all appointments
      for (const calendarEvents of batchResults) {
        allAppointments = allAppointments.concat(calendarEvents);
      }
      
      console.log(`🔄 Processed ${Math.min(i + batchSize, calendars.length)}/${calendars.length} calendars. Found ${allAppointments.length} total events so far.`);
    }

    console.log(`📊 Total appointments found: ${allAppointments.length}`);

    // Enrich appointments with contact information
    const enrichedAppointments = await Promise.all(
      allAppointments.map(async (appointment) => {
        try {
          // Fetch contact details if contactId exists
          if (appointment.contactId) {
            const contactResponse = await axios.get(
              `https://services.leadconnectorhq.com/contacts/${appointment.contactId}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Version': '2021-04-15',
                  'Accept': 'application/json'
                }
              }
            );
            
            const contact = contactResponse.data.contact || contactResponse.data;
            
            return {
              ...appointment,
              contactInfo: {
                id: contact.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone
              }
            };
          }
          
          return appointment;
        } catch (error) {
          console.warn(`⚠️ Failed to fetch contact details for appointment ${appointment.id}:`, error.response?.data || error.message);
          return appointment;
        }
      })
    );

    console.log(`✅ Completed! Found ${allAppointments.length} total appointments.`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        totalAppointments: enrichedAppointments.length,
        totalCalendars: calendars.length,
        appointments: enrichedAppointments,
        fetchedAt: new Date().toISOString(),
        dateRange: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString()
        }
      })
    };

  } catch (error) {
    console.error('❌ Error fetching all bookings from GHL:', error.response?.data || error.message);
    
    return {
      statusCode: error.response?.status || 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to fetch all bookings from GHL',
        details: error.response?.data || error.message
      })
    };
  }
};
