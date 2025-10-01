const axios = require("axios");
const { getValidAccessToken } = require("../../supbase");
const { saveBookingToDB } = require("../../supabaseAppointments");

console.log("📅 bookAppointment function - updated 2025-10-03");

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
    const { 
      contactId, 
      calendarId, 
      assignedUserId, 
      startTime, 
      endTime, 
      title,
      // New enhanced parameters from frontend
      serviceName,
      servicePrice,
      serviceDuration,
      staffName,
      customerFirstName,
      customerLastName
    } = params;

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
    
    const highlevelStartTime = startTime;
    const highlevelEndTime = endTime;
    
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
      startTime: highlevelStartTime,
      endTime: highlevelEndTime,
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
    console.log("📅 Extracted booking from HighLevel API:", newBooking);

    // ✅ CRITICAL FIX: Add startTime and endTime to the booking object
    // since HighLevel API doesn't return them in the response
    newBooking.startTime = startTime;
    newBooking.endTime = endTime;
    
    console.log("✅ Added startTime and endTime to booking object:");
    console.log("   startTime:", newBooking.startTime);
    console.log("   endTime:", newBooking.endTime);

    // 📝 Prepare enhanced data for Supabase
    const customerName = `${customerFirstName || ''} ${customerLastName || ''}`.trim() || null;
    
    const enhancedData = {
      serviceName: serviceName || null,
      servicePrice: servicePrice ? parseFloat(servicePrice) : null,
      serviceDuration: serviceDuration ? parseInt(serviceDuration) : null,
      staffName: staffName || null,
      customerName: customerName,
      paymentStatus: null, // Will be blank for now as requested
    };

    console.log("📝 Enhanced data to save:", JSON.stringify(enhancedData, null, 2));

    let dbInsert = null;
    try {
      if (!newBooking || !newBooking.id) {
        throw new Error("Invalid booking data received from API");
      }
      
      // Pass enhanced data as second parameter
      dbInsert = await saveBookingToDB(newBooking, enhancedData);
      console.log("✅ DB Insert successful:", dbInsert);
    } catch (dbError) {
      console.error("❌ DB save failed:", dbError.message);
      console.error("❌ Booking data that failed:", JSON.stringify(newBooking, null, 2));
      dbInsert = { error: dbError.message };
    }

    // 🔗 Build website link for this contact
    const websiteUrl = `https://restyle-93b772.webflow.io/bookings?id=${contactId}`;

    // 🌐 Call your own updatecustomer function to update contact's website
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