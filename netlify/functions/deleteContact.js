const axios = require('axios');
const { getValidAccessToken } = require('../../supbase'); // unified helper for token

exports.handler = async function (event) {
  try {
    // Get a valid access token
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    // Extract contact ID from query parameters
    const contactId = event.queryStringParameters?.id;
    if (!contactId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing contact id parameter' })
      };
    }

    // Delete the contact via LeadConnectorHQ API
    const response = await axios.delete(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          Version: '2021-07-28'
        }
      }
    );

    // 🔄 Delete from Supabase contact table (ignore if not found)
    try {
      const { createClient } = require("@supabase/supabase-js");
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("restyle_contacts").delete().eq("id", contactId);
    } catch (e) {
      console.warn("⚠️ Supabase delete after deleteContact failed (ignoring):", e.message || e);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `✅ Contact ${contactId} deleted successfully`,
        response: response.data
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error('❌ Deleting contact failed:', message);

    return {
      statusCode: status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Deleting contact failed',
        details: message
      })
    };
  }
};
