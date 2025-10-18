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

    // Helper to pick the first defined/truthy value among possible key variants
    const pick = (...keys) => {
      for (const k of keys) {
        if (params[k] !== undefined && params[k] !== null && String(params[k]).length > 0) return params[k];
      }
      return undefined;
    };

    // Accept both camelCase and snake_case from frontend
    const contactId = pick("contactId", "contact_id");
    const calendarId = pick("calendarId", "calendar_id");
    const assignedUserId = pick("assignedUserId", "assigned_user_id");
    const startTime = pick("startTime", "start_time");
    const endTime = pick("endTime", "end_time");
    const title = pick("title");

    // Extras for DB enrichment
    const serviceName = pick("serviceName", "service_name");
    const serviceDurationRaw = pick("serviceDuration", "booking_duration");
    const servicePriceRaw = pick("servicePrice", "booking_price");
    const staffName = pick("staffName", "assigned_barber_name");
    const paymentStatus = pick("paymentStatus", "payment_status");
    const customerNameRaw = pick("customerName", "customer_name", "customer_name_");
    const customerFirstName = pick("customerFirstName", "first_name");
    const customerLastName = pick("customerLastName", "last_name");

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
    
    // 🕐 DEBUG: Just pass through the time as-is for now
    function convertToHighLevelTime(timeString) {
      if (!timeString) return timeString;
      
      console.log(`🕐 Original time received: ${timeString}`);
      console.log(`🕐 Passing through unchanged: ${timeString}`);
      
      return timeString;
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

    // Prepare enhanced data for DB insert (normalize names/types)
    const parsedDuration = serviceDurationRaw !== undefined && serviceDurationRaw !== null
      ? Number(serviceDurationRaw)
      : undefined;
    const parsedPrice = servicePriceRaw !== undefined && servicePriceRaw !== null
      ? Number(servicePriceRaw)
      : undefined;

    const customerName = customerNameRaw && String(customerNameRaw).trim().length > 0
      ? String(customerNameRaw).trim()
      : [customerFirstName, customerLastName].filter(Boolean).join(" ") || undefined;

    const enhancedData = {
      serviceName: serviceName || undefined,
      serviceDuration: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
      servicePrice: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
      staffName: staffName || undefined,
      paymentStatus: paymentStatus || undefined,
      customerName: customerName || undefined,
      // Ensure times are also available to DB if HL response lacks them
      startTime: highlevelStartTime,
      endTime: highlevelEndTime,
      assignedUserId: assignedUserId || undefined,
      apptId: undefined, // will be set after HL response if needed
    };

    let dbInsert = null;
    try {
      if (!newBooking || !newBooking.id) {
        throw new Error("Invalid booking data received from API");
      }
  // Pass enhancedData so Supabase gets extras even if frontend used camelCase
  // If your DB has an apptId column different from id, forward it explicitly
  const enhancedWithIds = { ...enhancedData, apptId: newBooking.id };
  dbInsert = await saveBookingToDB(newBooking, enhancedWithIds);
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
