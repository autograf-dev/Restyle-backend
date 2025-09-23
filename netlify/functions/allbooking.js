// netlify/functions/bookings.js
const { createClient } = require("@supabase/supabase-js")
const axios = require("axios")
const { getValidAccessToken } = require("../../supbase") // helper for GHL OAuth token

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" }
  }

  try {
    const method = event.httpMethod

    // GET /bookings → all Supabase + GHL
    if (method === "GET") {
      // Supabase
      const { data: sbBookings, error: sbError } = await supabase
        .from("restyle_bookings")
        .select("*")
        .order("id", { ascending: false })

      if (sbError) {
        console.error("❌ Supabase error (GET):", sbError)
        return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: sbError.message }) }
      }

      // GHL
      let ghlBookings = []
      try {
        const token = await getValidAccessToken()
        const ghlRes = await axios.get(
          "https://services.leadconnectorhq.com/calendars/events/appointments",
          {
            headers: { Authorization: `Bearer ${token}`, Version: "2021-04-15" },
          }
        )
        ghlBookings = ghlRes.data?.appointments || []
      } catch (ghlErr) {
        console.error("❌ GHL fetch error:", ghlErr.response?.data || ghlErr.message)
      }

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          supabase: sbBookings || [],
          ghl: ghlBookings || [],
        }),
      }
    }

    // DELETE /bookings { id, ghl_id }
    if (method === "DELETE") {
      let body = {}
      try {
        body = JSON.parse(event.body || "{}")
      } catch (e) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) }
      }

      const { id, ghl_id } = body
      if (!id) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Missing required field: id" }) }
      }

      // Try to delete from GHL first if ghl_id provided
      if (ghl_id) {
        try {
          const token = await getValidAccessToken()
          await axios.delete(
            `https://services.leadconnectorhq.com/calendars/events/appointments/${ghl_id}`,
            {
              headers: { Authorization: `Bearer ${token}`, Version: "2021-04-15" },
            }
          )
          console.log(`✅ Deleted appointment ${ghl_id} from GHL`)
        } catch (ghlDelErr) {
          console.error("⚠️ Failed to delete in GHL:", ghlDelErr.response?.data || ghlDelErr.message)
          // continue to Supabase delete anyway
        }
      }

      // Delete from Supabase
      const { error: delErr } = await supabase.from("restyle_bookings").delete().eq("id", id)
      if (delErr) {
        console.error("❌ Supabase delete error:", delErr)
        return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: delErr.message }) }
      }

      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err) {
    console.error("❌ bookings.js failed:", err)
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) }
  }
}
