const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Removed external slot fetching; using static slot generation instead

function timeToMinutes(timeString) {
  const [time, modifier] = timeString.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isWithinRange(minutes, start, end) {
  return minutes >= start && minutes <= end;
}

// Build static 24/7 base slots for the given days at a fixed interval (in minutes)
function buildStaticSlots(days, intervalMinutes = 15) {
  const out = {};
  for (const day of days) {
    const dateKey = day.toISOString().split("T")[0];
    const slots = [];
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + intervalMinutes * 60000)) {
      // Keep same shape as GHL input: epoch milliseconds inside per-day buckets
      slots.push(t.getTime());
    }

    out[dateKey] = { slots };
  }
  return out;
}

exports.handler = async function (event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    // Access token is no longer required since we now build static base slots

    const { calendarId, userId, date, serviceDuration } = event.queryStringParameters || {};
    if (!calendarId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "calendarId is required" })
      };
    }

    // Parse service duration (in minutes), default to 30 if not provided
    const serviceDurationMinutes = serviceDuration ? parseInt(serviceDuration) : 30;

    let startDate = new Date();
    if (date) {
      const parts = date.split("-");
      if (parts.length === 3) {
        startDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }

    const totalDays = 30;
    const daysToCheck = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      daysToCheck.push(d);
    }

    const startOfRange = new Date(daysToCheck[0].getFullYear(), daysToCheck[0].getMonth(), daysToCheck[0].getDate(), 0, 0, 0);
    const endOfRange = new Date(daysToCheck[daysToCheck.length - 1].getFullYear(), daysToCheck[daysToCheck.length - 1].getMonth(), daysToCheck[daysToCheck.length - 1].getDate(), 23, 59, 59);

    // Build static 24/7 base slots for the next 30 days (30-minute interval)
    const slotsData = buildStaticSlots(daysToCheck, 30);

    // Fetch business hours
    const { data: businessHoursData, error: bhError } = await supabase
      .from("business_hours")
      .select("*")
      .eq("is_open", true);
    if (bhError) throw new Error("Failed to fetch business hours");

    const businessHoursMap = {};
    businessHoursData.forEach(item => {
      businessHoursMap[item.day_of_week] = item;
    });

    // Fetch barber hours
    let barberHoursMap = {};
    let barberWeekends = [];
    let barberWeekendIndexes = [];

    if (userId) {
      const { data: barberData, error: barberError } = await supabase
        .from("barber_hours")
        .select("*")
        .eq("ghl_id", userId)
        .single();
      if (barberError) throw new Error("Failed to fetch barber hours");

      // Parse weekend_days
      if (barberData.weekend_days) {
        try {
          let weekendString = barberData.weekend_days.replace(/^['"]|['"]$/g, '');
          if (weekendString.includes('{') && weekendString.includes('}')) {
            weekendString = weekendString.replace(/^['"]*\{/, '[').replace(/\}['"]*.*$/, ']').replace(/\\"/g, '"');
          }
          barberWeekends = JSON.parse(weekendString);
        } catch (e) {
          console.error("Failed to parse weekend_days:", e.message);
          barberWeekends = [];
        }
      }

      const dayNameToIndex = { "Sunday":0,"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6 };
      barberWeekendIndexes = barberWeekends.map(day => dayNameToIndex[day]).filter(v => v !== undefined);

      barberHoursMap = {
        0: { start: parseInt(barberData["Sunday/Start Value"]) || 0, end: parseInt(barberData["Sunday/End Value"]) || 0 },
        1: { start: parseInt(barberData["Monday/Start Value"]) || 0, end: parseInt(barberData["Monday/End Value"]) || 0 },
        2: { start: parseInt(barberData["Tuesday/Start Value"]) || 0, end: parseInt(barberData["Tuesday/End Value"]) || 0 },
        3: { start: parseInt(barberData["Wednesday/Start Value"]) || 0, end: parseInt(barberData["Wednesday/End Value"]) || 0 },
        4: { start: parseInt(barberData["Thursday/Start Value"]) || 0, end: parseInt(barberData["Thursday/End Value"]) || 0 },
        5: { start: parseInt(barberData["Friday/Start Value"]) || 0, end: parseInt(barberData["Friday/End Value"]) || 0 },
        6: { start: parseInt(barberData["Saturday/Start Value"]) || 0, end: parseInt(barberData["Saturday/End Value"]) || 0 }
      };
    }

    // Fetch time off
    let timeOffList = [];
    if (userId) {
      const { data: timeOffData } = await supabase.from("time_off").select("*").eq("ghl_id", userId);
      timeOffList = (timeOffData || []).map(item => ({
        start: new Date(item["Event/Start"]),
        end: new Date(item["Event/End"])
      }));
    }
    const isDateInTimeOff = (date) => {
      for (const period of timeOffList) {
        const start = new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate());
        const end = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate());
        if (date >= start && date < end) return true;
      }
      return false;
    };

    // Fetch time blocks
    let timeBlockList = [];
    if (userId) {
      const { data: blockData } = await supabase.from("time_block").select("*").eq("ghl_id", userId);
      console.log(`🔍 Fetched ${blockData?.length || 0} time blocks for user ${userId}`);
      
      timeBlockList = (blockData || []).map(item => {
        // Handle the recurring field which might have quotes around "true"
        const recurringRaw = item["Block/Recurring"];
        const recurring = recurringRaw === true || 
                         recurringRaw === "true" || 
                         recurringRaw === "\"true\"" ||
                         String(recurringRaw).toLowerCase().replace(/['"]/g, '') === "true";
        
        let recurringDays = [];
        
        if (recurring && item["Block/Recurring Day"]) {
          // Parse comma-separated days like "Friday,Saturday,Monday,Wednesday,Thursday,Tuesday,Sunday"
          recurringDays = item["Block/Recurring Day"].split(',').map(day => day.trim());
        }
        
        const block = {
          start: parseInt(item["Block/Start"]),
          end: parseInt(item["Block/End"]),
          date: item["Block/Date"] ? item["Block/Date"] : null,
          recurring: recurring,
          recurringDays: recurringDays,
          name: item["Block/Name"] || "Time Block",
          // Force deployment update - VERSION 3.1 - FIXED RECURRING BLOCKS
          version: "3.1"
        };
        
        console.log(`📅 Time block: ${block.name}, recurring: ${block.recurring} (raw: ${recurringRaw}), days: [${block.recurringDays.join(',')}], array length: ${block.recurringDays.length}, time: ${block.start}-${block.end} minutes`);
        console.log(`📅 Full block object:`, JSON.stringify(block, null, 2));
        return block;
      });
    }

    // Fetch existing bookings to block already booked slots
    let existingBookings = [];
    if (userId) {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("restyle_bookings")
        .select("start_time, booking_duration, assigned_user_id, status, appointment_status")
        .eq("assigned_user_id", userId)
        .in("status", ["booked", "confirmed"])
        .in("appointment_status", ["confirmed", "pending"])
        .gte("start_time", startOfRange.toISOString())
        .lte("start_time", endOfRange.toISOString());
      
      if (bookingsError) {
        console.error("Failed to fetch existing bookings:", bookingsError);
      } else {
        existingBookings = (bookingsData || []).map(booking => {
          const startTime = new Date(booking.start_time);
          const duration = parseInt(booking.booking_duration) || 30;
          const endTime = new Date(startTime.getTime() + duration * 60000);
          
          // Convert to Denver timezone for debugging
          const startDenver = new Date(startTime.toLocaleString("en-US", { timeZone: "America/Denver" }));
          const endDenver = new Date(endTime.toLocaleString("en-US", { timeZone: "America/Denver" }));
          
          console.log(`📅 Booking: ${startTime.toISOString()} (UTC) → ${startDenver.toLocaleString()} (Denver) for ${duration}min`);
          
          return {
            startTime: startTime,
            duration: duration,
            endTime: endTime,
            startTimeDenver: startDenver,
            endTimeDenver: endDenver
          };
        });
        console.log(`📅 Fetched ${existingBookings.length} existing bookings for user ${userId}`);
      }
    }

    const isSlotBlocked = (slotDate, slotMinutes) => {
      for (const block of timeBlockList) {
        if (block.recurring) {
          // Check if current day matches any of the recurring days
          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const currentDayName = dayNames[slotDate.getDay()];
          
          // Handle both field names for backward compatibility
          let recurringDaysList = block.recurringDays || block.recurringDay;
          
          // Debug logging to see what we're working with
          console.log(`🔍 Debug - block.recurringDays:`, block.recurringDays);
          console.log(`🔍 Debug - block.recurringDay:`, block.recurringDay);
          console.log(`🔍 Debug - recurringDaysList:`, recurringDaysList);
          
          // If it's a string, split it into an array
          if (typeof recurringDaysList === 'string') {
            recurringDaysList = recurringDaysList.split(',').map(day => day.trim());
          }
          
          if (recurringDaysList && recurringDaysList.includes(currentDayName)) {
            console.log(`🔍 Checking time block: ${block.name}, slot: ${slotMinutes} minutes, block range: ${block.start}-${block.end} minutes`);
            if (isWithinRange(slotMinutes, block.start, block.end)) {
              console.log(`🚫 Slot blocked by recurring time_block: ${block.name} on ${currentDayName} at ${slotMinutes} minutes`);
              return true;
            } else {
              console.log(`✅ Slot NOT blocked: ${slotMinutes} is outside range ${block.start}-${block.end}`);
            }
          } else {
            console.log(`🔍 Day mismatch: current day ${currentDayName} not in recurring days:`, recurringDaysList);
          }
        } else if (block.date) {
          // Parse the block date properly
          let blockDate;
          try {
            const blockDateStr = block.date;
            if (blockDateStr.includes(',')) {
              // Format: '9/26/2025, 6:30:00 PM'
              const [datePart] = blockDateStr.split(',');
              const [month, day, year] = datePart.trim().split('/');
              blockDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else {
              blockDate = new Date(blockDateStr);
            }
            
            const blockDateOnly = new Date(blockDate.getFullYear(), blockDate.getMonth(), blockDate.getDate());
            const currDateOnly = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
            
            if (blockDateOnly.getTime() === currDateOnly.getTime() && isWithinRange(slotMinutes, block.start, block.end)) {
              console.log(`Slot blocked by specific time_block: ${block.name} on ${blockDateOnly.toDateString()}`);
              return true;
            }
          } catch (e) {
            console.warn(`Invalid time_block date format:`, block.date, e.message);
          }
        }
      }
      return false;
    };

    // Function to check if a slot conflicts with existing bookings
    const isSlotBooked = (slotDate, slotMinutes) => {
      for (const booking of existingBookings) {
        // Convert booking times to Denver timezone for comparison
        const bookingStartDenver = new Date(booking.startTime.toLocaleString("en-US", { timeZone: "America/Denver" }));
        const bookingEndDenver = new Date(booking.endTime.toLocaleString("en-US", { timeZone: "America/Denver" }));
        
        // Check if the booking is on the same date (in Denver timezone)
        const bookingDate = new Date(bookingStartDenver.getFullYear(), bookingStartDenver.getMonth(), bookingStartDenver.getDate());
        const slotDateOnly = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
        
        if (bookingDate.getTime() === slotDateOnly.getTime()) {
          // Convert booking times to minutes for comparison (in Denver timezone)
          const bookingStartMinutes = bookingStartDenver.getHours() * 60 + bookingStartDenver.getMinutes();
          const bookingEndMinutes = bookingEndDenver.getHours() * 60 + bookingEndDenver.getMinutes();
          
          // Check if the slot time conflicts with the booking time range
          if (slotMinutes >= bookingStartMinutes && slotMinutes < bookingEndMinutes) {
            console.log(`🚫 Slot blocked by existing booking: ${bookingStartDenver.toLocaleString()} - ${bookingEndDenver.toLocaleString()}, slot: ${slotMinutes} minutes`);
            return true;
          }
        }
      }
      return false;
    };

    const filteredSlots = {};
    for (const day of daysToCheck) {
      const dateKey = day.toISOString().split("T")[0];
      const dayOfWeek = day.getDay();

      const bh = businessHoursMap[dayOfWeek];
      if (!bh) continue;
      const openTime = bh.open_time;
      const closeTime = bh.close_time;

      let validSlots = slotsData[dateKey]?.slots || [];

      // Keep only slots that render to the same local (Denver) date as dateKey
      validSlots = validSlots.filter(slot => {
        const denverDate = new Date(new Date(slot).toLocaleString("en-US", { timeZone: "America/Denver" }));
        const y = denverDate.getFullYear();
        const m = String(denverDate.getMonth() + 1).padStart(2, "0");
        const d = String(denverDate.getDate()).padStart(2, "0");
        const denverKey = `${y}-${m}-${d}`;
        return denverKey === dateKey;
      });

      validSlots = validSlots.filter(slot => {
        const timeString = new Date(slot).toLocaleString("en-US", {
          timeZone: "America/Denver",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        });
        const minutes = timeToMinutes(timeString);
        // Only check if slot starts within business hours - service duration will be checked at barber level
        return minutes >= openTime && minutes <= closeTime;
      });

      if (userId) {
        // Skip barber weekend
        if (barberWeekendIndexes.includes(dayOfWeek)) continue;

        const barberHours = barberHoursMap[dayOfWeek];
        if (!barberHours || (barberHours.start === 0 && barberHours.end === 0)) continue;
        
        console.log(`📅 Barber hours for day ${dayOfWeek}: start=${barberHours.start}, end=${barberHours.end}, serviceDuration=${serviceDurationMinutes}min`);

        if (isDateInTimeOff(day)) continue;

        validSlots = validSlots.filter(slot => {
          const timeString = new Date(slot).toLocaleString("en-US", {
            timeZone: "America/Denver",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          });
          const minutes = timeToMinutes(timeString);
          const isBlocked = isSlotBlocked(day, minutes);
          const isBooked = isSlotBooked(day, minutes);
          
          if (isBlocked) {
            console.log(`🚫 Blocked slot: ${timeString} (${minutes} minutes) on ${day.toDateString()}`);
          }
          
          if (isBooked) {
            console.log(`🚫 Booked slot: ${timeString} (${minutes} minutes) on ${day.toDateString()}`);
          }
          
          // Apply service duration: ensure service can complete before barber end time
          // AND ensure slot starts at or after barber start time
          const serviceEndTime = minutes + serviceDurationMinutes;
          const withinRange = minutes >= barberHours.start && serviceEndTime <= barberHours.end;
          
          console.log(`🔍 Slot ${timeString} (${minutes} min): barberStart=${barberHours.start}, barberEnd=${barberHours.end}, serviceEnd=${serviceEndTime}, withinRange=${withinRange}, blocked=${isBlocked}, booked=${isBooked}`);
          
          return withinRange && !isBlocked && !isBooked;
        });
      }

      // Ensure ascending order of times (epoch ms)
      validSlots.sort((a, b) => a - b);

      if (validSlots.length > 0) {
        filteredSlots[dateKey] = validSlots.map(slot => new Date(slot).toLocaleString("en-US", {
          timeZone: "America/Denver",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        }));
      }
    }

    console.log(`📊 Final results: ${Object.keys(filteredSlots).length} days with slots, ${timeBlockList.length} time blocks processed, ${existingBookings.length} existing bookings blocked, serviceDuration=${serviceDurationMinutes}min - VERSION 3.9 - FIXED DOUBLE SERVICE DURATION FILTERING`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        calendarId,
        activeDay: "allDays",
        startDate: startDate.toISOString().split("T")[0],
        slots: filteredSlots,
        debug: userId ? {
          barberWeekends,
          barberWeekendIndexes,
          barberHoursMap,
          timeOffList,
          timeBlockList,
          existingBookings,
          debugVersion: "3.8 - FIXED START TIME FILTERING",
          serviceDurationMinutes: serviceDurationMinutes,
          timeBlockDebug: timeBlockList.map(block => ({
            ...block,
            recurringDaysType: typeof block.recurringDays,
            recurringDaysLength: block.recurringDays ? block.recurringDays.length : 0,
            fieldNames: Object.keys(block),
            // Ensure we show the correct field name in debug
            recurringDays: block.recurringDays,
            recurringDay: block.recurringDay
          }))
        } : undefined
      })
    };

  } catch (err) {
    console.error("❌ Error in WorkingSlots:", err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch working slots",
        details: err.message
      })
    };
  }
};
