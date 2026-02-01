const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------- CONSTANTS & HELPERS --------------------
const TARGET_TZ = "America/Edmonton";

/** format YYYY-MM-DD for a Date in TARGET_TZ (no parsing of localized strings) */
function ymdInTZ(date) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

/** minutes since local midnight in TARGET_TZ for a Date */
function minutesInTZ(date) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const hh = parseInt(parts.find(p => p.type === "hour").value, 10);
  const mm = parseInt(parts.find(p => p.type === "minute").value, 10);
  return hh * 60 + mm;
}

/** display like "06:30 PM" given minutes since local midnight */
function displayFromMinutes(mins) {
  let h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** parse "hh:mm AM/PM" -> minutes; used only for your existing debug lines */
function timeToMinutes(timeString) {
  const [time, modifier] = timeString.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** weekday index (0=Sunday..6=Saturday) in TARGET_TZ for a Date */
function dayOfWeekInTZ(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TARGET_TZ,
    weekday: "long",
  });
  const name = dtf.format(date);
  const map = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  return map[name];
}

/** today's date at midnight for TARGET_TZ */
function tzTodayDate() {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(new Date());
  const y = parseInt(parts.find(p => p.type === "year").value, 10);
  const m = parseInt(parts.find(p => p.type === "month").value, 10);
  const d = parseInt(parts.find(p => p.type === "day").value, 10);
  return new Date(y, m - 1, d);
}

// Note: use end-exclusive for blocks to allow immediate post-break slot
function isWithinRangeExclusiveEnd(minutes, start, end) {
  return minutes >= start && minutes < end;
}

/** Build static per-day slot MINUTES (0..1430 step) — no epochs, no UTC */
function buildStaticSlotsMinutes(days, intervalMinutes = 30) {
  const out = {};
  for (const day of days) {
    const dateKey = ymdInTZ(day);
    const minutes = [];
    for (let t = 0; t <= 23 * 60 + 59; t += intervalMinutes) {
      minutes.push(t);
    }
    out[dateKey] = { minutes };
  }
  return out;
}

// -------------------- MAIN HANDLER --------------------
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
    const { calendarId, userId, date, serviceDuration, debug } = event.queryStringParameters || {};
    const verboseDebug = debug === "1" || debug === "true";
    const debugLog = (...args) => {
      if (verboseDebug) console.log(...args);
    };
    if (!calendarId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "calendarId is required" })
      };
    }

    const serviceDurationMinutes = serviceDuration ? parseInt(serviceDuration) : 30;

      let startDate = tzTodayDate();
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

    const startOfRange = new Date(
      daysToCheck[0].getFullYear(),
      daysToCheck[0].getMonth(),
      daysToCheck[0].getDate(), 0, 0, 0
    );
    const endOfRange = new Date(
      daysToCheck[daysToCheck.length - 1].getFullYear(),
      daysToCheck[daysToCheck.length - 1].getMonth(),
      daysToCheck[daysToCheck.length - 1].getDate(), 23, 59, 59
    );

    // Build 30-min grid in LOCAL minutes
    const slotsData = buildStaticSlotsMinutes(daysToCheck, 30);

    // ---- business hours
    const { data: businessHoursData, error: bhError } = await supabase
      .from("business_hours")
      .select("*")
      .eq("is_open", true);
    if (bhError) throw new Error("Failed to fetch business hours");

    const businessHoursMap = {};
    businessHoursData.forEach(item => {
      // coerce to numbers for safety
      item.open_time = Number(item.open_time);
      item.close_time = Number(item.close_time);
      businessHoursMap[item.day_of_week] = item;
    });

    // ---- barber hours
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

      if (barberData.weekend_days) {
        try {
          let weekendString = barberData.weekend_days.replace(/^["']|["']$/g, '');
          if (weekendString.includes('{') && weekendString.includes('}')) {
            weekendString = weekendString
              .replace(/^["']*\{/, '[')
              .replace(/\}["']*.*$/, ']')
              .replace(/\\"/g, '"');
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

    // ---- time off
    let timeOffList = [];
    if (userId) {
      const { data: timeOffData } = await supabase.from("time_off").select("*").eq("ghl_id", userId);
      timeOffList = (timeOffData || []).map(item => ({
        start: new Date(item["Event/Start"]),
        end: new Date(item["Event/End"])
      }));
    }
    const isDateInTimeOff = (date) => {
      const dayKey = ymdInTZ(date); // YYYY-MM-DD in TARGET_TZ
      for (const period of timeOffList) {
        const startKey = ymdInTZ(period.start);
        const endKey = ymdInTZ(period.end);
        if (dayKey >= startKey && dayKey < endKey) return true; // end exclusive
      }
      return false;
    };

    // ---- time blocks (indexed by date for O(1) lookup)
    let recurringBlocks = [];  // blocks that apply to any day
    let dateBlocksMap = {};    // non-recurring blocks indexed by YYYY-MM-DD
    if (userId) {
      const { data: blockData } = await supabase.from("time_block").select("*").eq("ghl_id", userId);
      debugLog(`🔍 Fetched ${blockData?.length || 0} time blocks for user ${userId}`);
      (blockData || []).forEach(item => {
        const recurringRaw = item["Block/Recurring"];
        const recurring = recurringRaw === true || 
                          recurringRaw === "true" || 
                          recurringRaw === "\"true\"" ||
                          String(recurringRaw).toLowerCase().replace(/["']/g, '') === "true";
        let recurringDays = [];
        if (recurring && item["Block/Recurring Day"]) {
          recurringDays = item["Block/Recurring Day"].split(',').map(day => day.trim());
        }
        const block = {
          start: parseInt(item["Block/Start"]),
          end: parseInt(item["Block/End"]),
          date: item["Block/Date"] ? item["Block/Date"] : null,
          recurring,
          recurringDays,
          name: item["Block/Name"] || "Time Block",
          version: "3.1"
        };
        debugLog(`📅 Time block: ${block.name}, recurring: ${block.recurring} (raw: ${recurringRaw}), days: [${block.recurringDays.join(',')}], array length: ${block.recurringDays.length}, time: ${block.start}-${block.end} minutes`);
        
        if (block.recurring) {
          recurringBlocks.push(block);
        } else if (block.date) {
          // Index non-recurring blocks by date key for O(1) lookup
          try {
            const blockDateKey = ymdInTZ(new Date(block.date));
            if (!dateBlocksMap[blockDateKey]) dateBlocksMap[blockDateKey] = [];
            dateBlocksMap[blockDateKey].push(block);
          } catch (e) {
            console.warn(`Invalid time_block date format:`, block.date, e.message);
          }
        }
      });
      debugLog(`📅 Indexed: ${recurringBlocks.length} recurring blocks, ${Object.keys(dateBlocksMap).length} dates with non-recurring blocks`);
    }

    // ---- existing bookings (indexed by date for O(1) lookup)
    let bookingsMap = {};
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
        // Index bookings by date for O(1) lookup instead of iterating all bookings per slot
        (bookingsData || []).forEach(booking => {
          const startTime = new Date(booking.start_time);
          const duration = parseInt(booking.booking_duration) || 30;
          const endTime = new Date(startTime.getTime() + duration * 60000);
          const startDayKey = ymdInTZ(startTime);
          const startMinutes = minutesInTZ(startTime);
          const endMinutes = minutesInTZ(endTime);
          debugLog(`📅 Booking: ${startTime.toISOString()} → ${startDayKey} ${Math.floor(startMinutes/60)}:${String(startMinutes%60).padStart(2,"0")}–${Math.floor(endMinutes/60)}:${String(endMinutes%60).padStart(2,"0")} (${TARGET_TZ}) for ${duration}min`);
          
          if (!bookingsMap[startDayKey]) bookingsMap[startDayKey] = [];
          bookingsMap[startDayKey].push({ startMinutes, endMinutes });
        });
        debugLog(`📅 Indexed ${bookingsData?.length || 0} existing bookings across ${Object.keys(bookingsMap).length} days`);
      }
    }

    // duration-aware overlap: true if [mins, mins+dur) overlaps any booking [start, end)
    // Now O(bookings_on_that_day) instead of O(all_bookings)
    const isSlotBooked = (slotDate, slotMinutes, durMinutes) => {
      const slotDayKey = ymdInTZ(slotDate);
      const slotEnd = slotMinutes + durMinutes;
      const dayBookings = bookingsMap[slotDayKey] || [];
      for (const booking of dayBookings) {
        if (slotMinutes < booking.endMinutes && slotEnd > booking.startMinutes) {
          return true;
        }
      }
      return false;
    };

    // Now O(recurring_blocks + blocks_on_that_day) instead of O(all_blocks)
    const isSlotBlocked = (slotDate, slotMinutes, currentDayName, slotDayKey) => {
      // Check recurring blocks
      for (const block of recurringBlocks) {
        let recurringDaysList = block.recurringDays || block.recurringDay;
        if (typeof recurringDaysList === 'string') {
          recurringDaysList = recurringDaysList.split(',').map(day => day.trim());
        }
        if (recurringDaysList && recurringDaysList.includes(currentDayName)) {
          if (isWithinRangeExclusiveEnd(slotMinutes, block.start, block.end)) return true;
        }
      }
      // Check non-recurring blocks for this specific date (O(1) lookup)
      const dayBlocks = dateBlocksMap[slotDayKey] || [];
      for (const block of dayBlocks) {
        if (isWithinRangeExclusiveEnd(slotMinutes, block.start, block.end)) return true;
      }
      return false;
    };

    // -------------------- FILTERING --------------------
    const filteredSlots = {};
    for (const day of daysToCheck) {
      const dateKey = ymdInTZ(day);
      const dayOfWeek = dayOfWeekInTZ(day);

      const bh = businessHoursMap[dayOfWeek];
      if (!bh) continue;
      const openTime = bh.open_time;
      const closeTime = bh.close_time;

      debugLog(`🕐 Business hours for day ${dayOfWeek}: open=${openTime}, close=${closeTime}, serviceDuration=${serviceDurationMinutes}min`);

      // start from local-minute grid
      let validMins = (slotsData[dateKey]?.minutes || []).slice();

      // store-level filter
      validMins = validMins.filter(mins => {
        const serviceEndTime = mins + serviceDurationMinutes;
        if (!userId) {
          const allowed = mins >= openTime && serviceEndTime <= closeTime;
          if (allowed === false) {
            const dbg = displayFromMinutes(mins);
            debugLog(`🔍 Store-level filtering: slot=${dbg} (${mins}min), serviceEnd=${serviceEndTime}, businessClose=${closeTime}, allowed=${allowed}`);
          }
          return allowed;
        } else {
          return mins >= openTime && mins <= closeTime;
        }
      });

      if (userId) {
        if (barberWeekendIndexes.includes(dayOfWeek)) continue;
        const barberHours = barberHoursMap[dayOfWeek];
        if (!barberHours || (barberHours.start === 0 && barberHours.end === 0)) continue;
        if (isDateInTimeOff(day)) continue;

        // Pre-compute day info once per day instead of per slot
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const currentDayName = dayNames[dayOfWeek];
        const slotDayKey = dateKey;
        
        validMins = validMins.filter(mins => {
          const isBlocked = isSlotBlocked(day, mins, currentDayName, slotDayKey);
          const isBooked = isSlotBooked(day, mins, serviceDurationMinutes);
          const serviceEndTime = mins + serviceDurationMinutes;
          const withinRange = mins >= barberHours.start && serviceEndTime <= barberHours.end;
          const dbg = displayFromMinutes(mins);
          debugLog(`🔍 Slot ${dbg} (${mins} min): barberStart=${barberHours.start}, barberEnd=${barberHours.end}, serviceEnd=${serviceEndTime}, withinRange=${withinRange}, blocked=${isBlocked}, booked=${isBooked}`);
          return withinRange && !isBlocked && !isBooked;
        });
      }

      validMins.sort((a,b) => a - b);
      if (validMins.length > 0) {
        filteredSlots[dateKey] = validMins.map(displayFromMinutes);
      }
    }

    console.log(`📊 Final results: ${Object.keys(filteredSlots).length} days with slots, ${recurringBlocks.length} recurring + ${Object.keys(dateBlocksMap).length} date-specific blocks, ${Object.keys(bookingsMap).length} days with bookings, serviceDuration=${serviceDurationMinutes}min - TZ=${TARGET_TZ}`);

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
          recurringBlocks,
          dateBlocksMap,
          bookingsMap,
          debugVersion: "3.13.1 - local-minute grid w/ duration & exclusive block end",
          serviceDurationMinutes: serviceDurationMinutes,
          targetTimeZone: TARGET_TZ
        } : undefined
      })
    };

  } catch (err) {
    console.error("❌ Error in staffSlotss:", err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch working slots (staffSlotss)",
        details: err.message
      })
    };
  }
};