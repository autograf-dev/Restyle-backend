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

    // Step 1: Fetch all contacts with pagination
    let allContacts = [];
    let startAfter = null;
    let page = 1;
    
    do {
      console.log(`📄 Fetching contacts page ${page}...`);
      
      let contactUrl = `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=100`;
      if (startAfter) {
        contactUrl += `&startAfter=${startAfter}`;
      }

      const contactResponse = await axios.get(contactUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-04-15',
          'Accept': 'application/json'
        }
      });

      const contactData = contactResponse.data;
      const contacts = contactData.contacts || [];
      
      allContacts = allContacts.concat(contacts);
      
      // Check if there's a next page
      startAfter = contactData.meta?.nextPageStartAfter || null;
      page++;
      
      console.log(`✅ Fetched ${contacts.length} contacts from page ${page - 1}. Total so far: ${allContacts.length}`);
      
    } while (startAfter);

    console.log(`📊 Total contacts found: ${allContacts.length}`);

    // Step 2: Fetch appointments for each contact
    let allAppointments = [];
    let processedContacts = 0;
    
    // Process contacts in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < allContacts.length; i += batchSize) {
      const batch = allContacts.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (contact) => {
        try {
          const appointmentUrl = `https://services.leadconnectorhq.com/contacts/${contact.id}/appointments`;
          
          const appointmentResponse = await axios.get(appointmentUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Version': '2021-04-15',
              'Accept': 'application/json'
            }
          });

          const appointments = appointmentResponse.data.appointments || [];
          
          // Add contact info to each appointment for context
          return appointments.map(appointment => ({
            ...appointment,
            contactInfo: {
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone
            }
          }));
          
        } catch (error) {
          // Log but don't fail the entire operation for individual contact errors
          console.warn(`⚠️ Failed to fetch appointments for contact ${contact.id}:`, error.response?.data || error.message);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Flatten the results
      for (const contactAppointments of batchResults) {
        allAppointments = allAppointments.concat(contactAppointments);
      }
      
      processedContacts += batch.length;
      console.log(`🔄 Processed ${processedContacts}/${allContacts.length} contacts. Found ${allAppointments.length} total appointments so far.`);
    }

    console.log(`✅ Completed! Found ${allAppointments.length} total appointments across ${allContacts.length} contacts.`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        totalAppointments: allAppointments.length,
        totalContacts: allContacts.length,
        appointments: allAppointments,
        fetchedAt: new Date().toISOString()
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
