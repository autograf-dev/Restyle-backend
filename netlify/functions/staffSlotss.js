const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------- CONSTANTS & HELPERS --------------------
const TARGET_TZ = "America/Edmonton";

function ymdInTZ(date) {
  const d = new Date(date.toLocaleString("en-CA", { timeZone: TARGET_TZ }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeStringInTZ(epochMs) {
  return new Date(epochMs).toLocaleString("en-US", {
    timeZone: TARGET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

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

// Build static 24/7 base slots
function buildStaticSlots(days, intervalMinutes = 15) {
  const out = {};
  for (const day of days) {
    const dateKey = ymdInTZ(day);
    const slots = [];
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + intervalMinutes * 60000)) {
      slots.push(t.getTime());
    }
    out[dateKey] = { slots };
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
    const { calendarId, userId, date, serviceDuration } = event.queryStringParameters || {};
    if (!calendarId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "calendarId is required" })
      };
    }

    const serviceDurationMinutes = serviceDuration ? parseInt(serviceDuration) : 30;

    let startDate = new Date();
    if (date) {
      const parts = date.split("-");
      if (parts.length === 3)
        startDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
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

    const slotsData = buildStaticSlots(daysToCheck, 30);

    // ---------------- BUSINESS HOURS ----------------
    const { data: businessHoursData, error: bhError } = await supabase
      .from("business_hours")
      .select("*")
      .eq("is_open", true);
    if (bhError) throw new Error("Failed to fetch business hours");

    const businessHoursMap = {};
    businessHoursData.forEach(item => (businessHoursMap[item.day_of_week] = item));

    // ---------------- BARBER HOURS ----------------
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
          let weekendString = barberData.weekend_days.replace(/^['"]|['"]$/g, "");
          if (weekendString.includes("{") && weekendString.includes("}")) {
            weekendString = weekendString
              .replace(/^['"]*\{/, "[")
              .replace(/\}['"]*.*$/, "]")
              .replace(/\\"/g, '"');
          }
          barberWeekends = JSON.parse(weekendString);
        } catch (e) {
          console.error("Failed to parse weekend_days:", e.message);
          barberWeekends = [];
        }
      }

      const dayNameToIndex = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6
      };
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

    // ---------------- TIME OFF ----------------
    let timeOffList = [];
    if (userId) {
      const { data: timeOffData } = await supabase.from("time_off").select("*").eq("ghl_id", userId);
      timeOffList = (timeOffData || []).map(item => ({
        start: new Date(item["Event/Start"]),
        end: new Date(item["Event/End"])
      }));
    }
    const isDateInTimeOff = date => {
      for (const period of timeOffList) {
        const start = new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate());
        const end = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate());
        if (date >= start && date < end) return true;
      }
      return false;
    };

    // ---------------- TIME BLOCKS ----------------
    let timeBlockList = [];
    if (userId) {
      const { data: blockData } = await supabase.from("time_block").select("*").eq("ghl_id", userId);
      console.log(`🔍 Fetched ${blockData?.length || 0} time blocks for user ${userId}`);
      timeBlockList = (blockData || []).map(item => {
        const recurringRaw = item["Block/Recurring"];
        const recurring =
          recurringRaw === true ||
          recurringRaw === "true" ||
          recurringRaw === "\"true\"" ||
          String(recurringRaw).toLowerCase().replace(/['"]/g, "") === "true";
        let recurringDays = [];
        if (recurring && item["Block/Recurring Day"]) {
          recurringDays = item["Block/Recurring Day"].split(",").map(day => day.trim());
        }
        return {
          start: parseInt(item["Block/Start"]),
          end: parseInt(item["Block/End"]),
          date: item["Block/Date"] ? item["Block/Date"] : null,
          recurring,
          recurringDays,
          name: item["Block/Name"] || "Time Block",
          version: "3.1"
        };
      });
    }

    const isSlotBlocked = (slotDate, slotMinutes) => {
      for (const block of timeBlockList) {
        if (block.recurring) {
          const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          const currentDayName = dayNames[slotDate.getDay()];
          let recurringDaysList = block.recurringDays || block.recurringDay;
          if (typeof recurringDaysList === "string")
            recurringDaysList = recurringDaysList.split(",").map(day => day.trim());
          if (recurringDaysList && recurringDaysList.includes(currentDayName)) {
            if (isWithinRange(slotMinutes, block.start, block.end)) return true;
          }
        } else if (block.date) {
          try {
            let blockDate = new Date(block.date);
            const blockDateOnly = new Date(blockDate.getFullYear(), blockDate.getMonth(), blockDate.getDate());
            const currDateOnly = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
            if (blockDateOnly.getTime() === currDateOnly.getTime() && isWithinRange(slotMinutes, block.start, block.end))
              return true;
          } catch (e) {
            console.warn("Invalid time_block date format:", block.date, e.message);
          }
        }
      }
      return false;
    };

    // ---------------- EXISTING BOOKINGS ----------------
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
      if (!bookingsError && bookingsData) {
        existingBookings = bookingsData.map(booking => {
          const startTime = new Date(booking.start_time);
          const duration = parseInt(booking.booking_duration) || 30;
          const endTime = new Date(startTime.getTime() + duration * 60000);
          const startLocal = new Date(startTime.toLocaleString("en-US", { timeZone: TARGET_TZ }));
          const endLocal = new Date(endTime.toLocaleString("en-US", { timeZone: TARGET_TZ }));
          return { startTime, endTime, startLocal, endLocal };
        });
      }
    }

    const isSlotBooked = (slotDate, slotMinutes) => {
      for (const booking of existingBookings) {
        const bookingDate = new Date(booking.startLocal.getFullYear(), booking.startLocal.getMonth(), booking.startLocal.getDate());
        const slotDateOnly = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
        if (bookingDate.getTime() === slotDateOnly.getTime()) {
          const bookingStartMinutes = booking.startLocal.getHours() * 60 + booking.startLocal.getMinutes();
          const bookingEndMinutes = booking.endLocal.getHours() * 60 + booking.endLocal.getMinutes();
          if (slotMinutes >= bookingStartMinutes && slotMinutes < bookingEndMinutes) return true;
        }
      }
      return false;
    };

    // ---------------- FILTERING ----------------
    const filteredSlots = {};
    for (const day of daysToCheck) {
      const dateKey = ymdInTZ(day);
      const dayOfWeek = day.getDay();
      const bh = businessHoursMap[dayOfWeek];
      if (!bh) continue;
      const openTime = bh.open_time;
      const closeTime = bh.close_time;

      let validSlots = slotsData[dateKey]?.slots || [];
      validSlots = validSlots.filter(slot => ymdInTZ(new Date(slot)) === dateKey);

      validSlots = validSlots.filter(slot => {
        const timeString = timeStringInTZ(slot);
        const minutes = timeToMinutes(timeString);
        const serviceEndTime = minutes + serviceDurationMinutes;
        if (!userId) return minutes >= openTime && serviceEndTime <= closeTime;
        else return minutes >= openTime && minutes <= closeTime;
      });

      if (userId) {
        if (barberWeekendIndexes.includes(dayOfWeek)) continue;
        const barberHours = barberHoursMap[dayOfWeek];
        if (!barberHours || (barberHours.start === 0 && barberHours.end === 0)) continue;
        if (isDateInTimeOff(day)) continue;

        validSlots = validSlots.filter(slot => {
          const timeString = timeStringInTZ(slot);
          const minutes = timeToMinutes(timeString);
          const isBlocked = isSlotBlocked(day, minutes);
          const isBooked = isSlotBooked(day, minutes);
          const serviceEndTime = minutes + serviceDurationMinutes;
          const withinRange = minutes >= barberHours.start && serviceEndTime <= barberHours.end;
          return withinRange && !isBlocked && !isBooked;
        });
      }

      validSlots.sort((a, b) => a - b);
      if (validSlots.length > 0)
        filteredSlots[dateKey] = validSlots.map(slot => timeStringInTZ(slot));
    }

    // ---------------- RESPONSE ----------------
    console.log(
      `📊 Final results: ${Object.keys(filteredSlots).length} days, ${timeBlockList.length} blocks, ${existingBookings.length} bookings, serviceDuration=${serviceDurationMinutes}min (TZ=${TARGET_TZ})`
    );

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
          serviceDurationMinutes,
          targetTimeZone: TARGET_TZ
        } : undefined
      })
    };
  } catch (err) {
    console.error("❌ Error in staffSlots:", err.message);
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