const axios = require("axios");
const { getValidAccessToken } = require("../../supbase");
const { saveBookingToDB } = require("../../supabaseAppointments");

console.log("📅 bookAppointment function - updated 2025-08-27");

exports.handler = async function (event) {
  try {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Access token missing" }),
      };
    }

    const params = event.queryStringParameters || {};
    const { contactId, calendarId, assignedUserId, startTime, endTime, title } = params;

    if (!contactId || !calendarId || !startTime || !endTime) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing required parameters: contactId, calendarId, startTime, endTime",
        }),
      };
    }

    // 🕐 DEBUG: Log what we're sending to HighLevel
    console.log('🕐 HighLevel API Debug - Frontend sent times:');
    console.log('🕐 StartTime received:', startTime);
    console.log('🕐 EndTime received:', endTime);
    
    // 🕐 HIGHLEVEL TIMEZONE FIX: Convert times to what HighLevel expects
    function convertToHighLevelTime(timeString) {
      if (!timeString) return timeString;
      
      console.log(`🕐 Original time received: ${timeString}`);
      
      // Parse the incoming time
      const incomingDate = new Date(timeString);
      console.log(`🕐 Parsed as Date: ${incomingDate.toString()}`);
      console.log(`🕐 UTC representation: ${incomingDate.toISOString()}`);
      
      // HighLevel shows 1 hour earlier, so we need to ADD 1 hour to compensate
      const adjustedDate = new Date(incomingDate.getTime() + (1 * 60 * 60 * 1000)); // Add 1 hour
      
      console.log(`🕐 Adjusted for HighLevel (added 1 hour): ${adjustedDate.toISOString()}`);
      return adjustedDate.toISOString();
    }
    
    const highlevelStartTime = convertToHighLevelTime(startTime);
    const highlevelEndTime = convertToHighLevelTime(endTime);
    
    console.log('🕐 Final times for HighLevel API:');
    console.log('🕐 StartTime for HighLevel:', highlevelStartTime);
    console.log('🕐 EndTime for HighLevel:', highlevelEndTime);
    
    const payload = {
      title: title || "Booking from Restyle website",
      meetingLocationType: "custom",
      meetingLocationId: "custom_0",
      overrideLocationConfig: true,
      appointmentStatus: "confirmed",
      address: "Zoom",
      ignoreDateRange: true,
      toNotify: true,
      ignoreFreeSlotValidation: true,
      calendarId,
      locationId: "7LYI93XFo8j4nZfswlaz",
      contactId,
      startTime: highlevelStartTime, // ✅ Use UTC time for HighLevel
      endTime: highlevelEndTime,     // ✅ Use UTC time for HighLevel
    };

    console.log('🕐 Final payload for HighLevel API:', JSON.stringify({ startTime: payload.startTime, endTime: payload.endTime }, null, 2));

    if (assignedUserId) {
      payload.assignedUserId = assignedUserId;
    }

    // 📅 Create appointment
    const response = await axios.post(
      "https://services.leadconnectorhq.com/calendars/events/appointments",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-04-15",
          "Content-Type": "application/json",
        },
      }
    );

    const newBooking = response.data || null;
    console.log("📅 Extracted booking:", newBooking);

    let dbInsert = null;
    try {
      if (!newBooking || !newBooking.id) {
        throw new Error("Invalid booking data received from API");
      }
      
      dbInsert = await saveBookingToDB(newBooking);
    } catch (dbError) {
      console.error("❌ DB save failed:", dbError.message);
      console.error("❌ Booking data that failed:", JSON.stringify(newBooking, null, 2));
      dbInsert = { error: dbError.message };
    }

    // 🔗 Build website link for this contact
    const websiteUrl = `https://restyle-93b772.webflow.io/bookings?id=${contactId}`;

    // 🌐 Call your own updatecustomer function to update contact’s website
    let websiteUpdate = null;
    try {
      const updateRes = await axios.get(
        `https://restyle-api.netlify.app/.netlify/functions/updatecustomer?id=${contactId}&website=${encodeURIComponent(
          websiteUrl
        )}`
      );
      websiteUpdate = updateRes.data;
      console.log("✅ Website updated:", websiteUpdate);
    } catch (updateErr) {
      console.error("❌ Failed to update website:", updateErr.response?.data || updateErr.message);
      websiteUpdate = { error: updateErr.message };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "✅ Booking success",
        response: response.data,
        dbInsert,
        websiteUpdate,
      }),
    };
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Booking failed:", message);

    return {
      statusCode: status,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Booking failed",
        details: message,
      }),
    };
  }
};
