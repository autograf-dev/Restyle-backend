const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("👤 getCustomerInfo function - Enhanced customer lookup with contact ID - 2025-09-26");

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

    const contactId = event.queryStringParameters?.id;
    const email = event.queryStringParameters?.email;
    const phone = event.queryStringParameters?.phone;

    // Must provide at least one identifier
    if (!contactId && !email && !phone) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Contact identifier required',
          message: 'Provide at least one: id, email, or phone parameter'
        })
      };
    }

    let customerData = null;

    // Method 1: Direct contact fetch by ID (fastest)
    if (contactId) {
      console.log('👤 Fetching customer by contact ID:', contactId);
      
      try {
        const response = await axios.get(
          `https://services.leadconnectorhq.com/contacts/${contactId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Version: '2021-04-15'
            }
          }
        );

        customerData = response.data.contact;
      } catch (err) {
        if (err.response?.status === 404) {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: 'Contact not found',
              contactId: contactId
            })
          };
        }
        throw err; // Re-throw for general error handling
      }
    }

    // Method 2: Search by email or phone if no ID provided
    if (!customerData && (email || phone)) {
      console.log('👤 Searching customer by', email ? 'email' : 'phone');
      
      const searchQuery = email || phone;
      const searchResponse = await axios.post(
        'https://services.leadconnectorhq.com/contacts/search',
        {
          locationId: '7LYI93XFo8j4nZfswlaz',
          query: searchQuery,
          page: 1,
          pageLimit: 5
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28'
          }
        }
      );

      const searchResults = searchResponse.data.contacts || [];
      
      // Find exact match
      if (email) {
        customerData = searchResults.find(contact => 
          contact.email && contact.email.toLowerCase() === email.toLowerCase()
        );
      } else if (phone) {
        // Normalize phone numbers for comparison
        const normalizedPhone = phone.replace(/\D/g, '');
        customerData = searchResults.find(contact => 
          contact.phone && contact.phone.replace(/\D/g, '') === normalizedPhone
        );
      }

      if (!customerData && searchResults.length > 0) {
        // If no exact match, return the first result as a suggestion
        customerData = searchResults[0];
      }

      if (!customerData) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ 
            error: 'Customer not found',
            searchQuery: searchQuery,
            searchResults: searchResults.length
          })
        };
      }
    }

    // Format customer information for frontend
    const formattedCustomer = {
      id: customerData.id,
      contactId: customerData.id, // Alias for clarity
      name: customerData.name || `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim() || 'No Name',
      firstName: customerData.firstName || '',
      lastName: customerData.lastName || '',
      email: customerData.email || '',
      phone: customerData.phone || '',
      locationId: customerData.locationId,
      
      // Additional useful fields
      dateAdded: customerData.dateAdded,
      source: customerData.source,
      tags: customerData.tags || [],
      customFields: customerData.customFields || [],
      
      // Address information if available
      address: customerData.address1 ? {
        street: customerData.address1,
        city: customerData.city,
        state: customerData.state,
        postalCode: customerData.postalCode,
        country: customerData.country
      } : null,

      // Full name variations for different use cases
      displayName: customerData.name || 
                  `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim() ||
                  customerData.email || 
                  customerData.phone || 
                  'Unknown Customer',
      
      // Formatted phone for display
      formattedPhone: formatPhoneNumber(customerData.phone),
      
      // Contact preferences
      dnd: customerData.dnd || false,
      dndSettings: customerData.dndSettings || {},
      
      // Last activity
      lastActivity: customerData.lastActivity,
      dateUpdated: customerData.dateUpdated
    };

    console.log('👤 Customer found:', formattedCustomer.displayName);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        customer: formattedCustomer,
        lookupMethod: contactId ? 'direct_id' : (email ? 'email_search' : 'phone_search'),
        message: 'Customer information retrieved successfully'
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error fetching customer info:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to fetch customer information',
        details: message,
        debugInfo: {
          status: status,
          endpoint: 'getCustomerInfo',
          parameters: {
            contactId: event.queryStringParameters?.id,
            hasEmail: !!event.queryStringParameters?.email,
            hasPhone: !!event.queryStringParameters?.phone
          }
        }
      })
    };
  }
};

// Helper function to format phone numbers
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Format based on length
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  } else {
    return phone; // Return original if can't format
  }
}