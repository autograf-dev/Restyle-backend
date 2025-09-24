const axios = require("axios");
const { getValidAccessToken } = require("../../supbase");
const { saveBookingToDB } = require("../../supabaseAppointments");

console.log("📅 bookAppointment function - updated 2025-09-24 debugging timezone issues");

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

    // 🕐 CRITICAL DEBUG: Log all time-related data
    console.log('🕐 === TIME DEBUG INFO ===');
    console.log('🕐 Original startTime received:', startTime);
    console.log('🕐 Original endTime received:', endTime);
    console.log('🕐 startTime type:', typeof startTime);
    console.log('🕐 endTime type:', typeof endTime);
    
    // Parse the times to understand their format
    if (startTime) {
      const startDate = new Date(startTime);
      console.log('🕐 Parsed startTime as Date:', startDate);
      console.log('🕐 StartTime in UTC:', startDate.toISOString());
      console.log('🕐 StartTime in Denver:', startDate.toLocaleString('en-US', { timeZone: 'America/Denver' }));
      console.log('🕐 StartTime in Edmonton:', startDate.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
    }
    
    if (endTime) {
      const endDate = new Date(endTime);
      console.log('🕐 Parsed endTime as Date:', endDate);
      console.log('🕐 EndTime in UTC:', endDate.toISOString());
      console.log('🕐 EndTime in Denver:', endDate.toLocaleString('en-US', { timeZone: 'America/Denver' }));
      console.log('🕐 EndTime in Edmonton:', endDate.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
    }
    console.log('🕐 === END TIME DEBUG ===');

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
      startTime, // ✅ Use original time temporarily
      endTime,   // ✅ Use original time temporarily
    };

    console.log('📝 Payload being sent to API:', JSON.stringify(payload, null, 2));

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
    console.log("📅 Full API Response:", JSON.stringify(response.data, null, 2));
    console.log("📅 Extracted booking:", newBooking);
    
    // 🕐 Check if API response contains time fields
    if (newBooking) {
      console.log('🕐 === API RESPONSE TIME CHECK ===');
      console.log('🕐 Response startTime:', newBooking.startTime);
      console.log('🕐 Response endTime:', newBooking.endTime);
      console.log('🕐 Response available fields:', Object.keys(newBooking));
      console.log('🕐 === END API TIME CHECK ===');
    }

    let dbInsert = null;
    try {
      if (!newBooking) {
        throw new Error("No booking data received from API");
      }
      if (!newBooking.id) {
        console.log("📅 Available fields in response:", Object.keys(newBooking));
        throw new Error("No booking ID found in API response");
      }
      console.log("📅 Attempting to save booking with ID:", newBooking.id);
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
