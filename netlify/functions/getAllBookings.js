const { createClient } = require("@supabase/supabase-js")

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  }
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" }
  }

  try {
    console.log('🔄 Fetching all bookings from Supabase...')

    // Simply fetch all bookings from the restyle_bookings table
    const { data, error } = await supabase
      .from("restyle_bookings")
      .select("*")
      .order("id", { ascending: false }) // Order by newest id first

    if (error) {
      console.error("❌ Supabase error:", error)
      return { 
        statusCode: 500, 
        headers: corsHeaders(), 
        body: JSON.stringify({ error: error.message }) 
      }
    }

    console.log(`✅ Found ${data.length} total bookings in Supabase`)

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        totalBookings: data.length,
        bookings: data,
        fetchedAt: new Date().toISOString()
      })
    }

  } catch (err) {
    console.error("❌ getAllBookings.js failed:", err)
    return { 
      statusCode: 500, 
      headers: corsHeaders(), 
      body: JSON.stringify({ error: err.message }) 
    }
  }
}
