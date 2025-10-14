const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------- TIMEZONE CONSTANTS & HELPERS --------------------
const TARGET_TZ = "America/Edmonton";

// stable Y-M-D in TARGET_TZ (no localized string parsing)
const dtfYMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: TARGET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// stable Y-M-D-H-M in TARGET_TZ (24h for minute math)
const dtfYMDHM = new Intl.DateTimeFormat("en-CA", {
  timeZone: TARGET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// display string for final payload (“09:00 AM” etc.)
function timeStringInTZ(epochMs) {
  return new Date(epochMs).toLocaleString("en-US", {
    timeZone: TARGET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// YYYY-MM-DD for a Date/epoch in TARGET_TZ
function ymdInTZ(dateOrEpoch) {
  const d = typeof dateOrEpoch === "number" ? new Date(dateOrEpoch) : dateOrEpoch;
  const parts = dtfYMD.formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d2 = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d2}`;
}

// Minutes since local midnight in TARGET_TZ for a Date
function minutesInTZ(date) {
  const parts = dtfYMDHM.formatToParts(date);
  const hh = parseInt(parts.find(p => p.type === "hour").value, 10);
  const mm = parseInt(parts.find(p => p.type === "minute").value, 10);
  return hh * 60 + mm;
}

// Minutes since local midnight in TARGET_TZ for an epoch ms
function minutesFromEpochInTZ(epochMs) {
  return minutesInTZ(new Date(epochMs));
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

// Build static 24/7 base slots for the given days at a fixed interval (in minutes)
function buildStaticSlots(days, intervalMinutes = 15) {
  const out = {};
  for (const day of days) {
    const dateKey = ymdInTZ(day);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
        body: JSON.stringify({ error: "calendarId is required" }),
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

    const startOfRange = new Date(
      daysToCheck[0].getFullYear(),
      daysToCheck[0].getMonth(),
      daysToCheck[0].getDate(),
      0, 0, 0
    );
    const endOfRange = new Date(
      daysToCheck[daysToCheck.length - 1].getFullYear(),
      daysToCheck[daysToCheck.length - 1].getMonth(),
      daysToCheck[daysToCheck.length - 1].getDate(),
      23, 59, 59
    );

    // Build static 24/7 base slots for the next 30 days (30-minute interval)
    const slotsData = buildStaticSlots(daysToCheck, 30);

    // Fetch business hours
    const { data: businessHoursData, error: bhError } = await supabase
      .from("business_hours")
      .select("*")
      .eq("is_open", true);
    if (bhError) throw new Error("Failed to fetch business hours");

    const businessHoursMap = {};
    businessHoursData.forEach((item) => {
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
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };
      barberWeekendIndexes = barberWeekends
        .map((day) => dayNameToIndex[day])
        .filter((v) => v !== undefined);

      barberHoursMap = {
        0: { start: parseInt(barberData["Sunday/Start Value"]) || 0, end: parseInt(barberData["Sunday/End Value"]) || 0 },
        1: { start: parseInt(barberData["Monday/Start Value"]) || 0, end: parseInt(barberData["Monday/End Value"]) || 0 },
        2: { start: parseInt(barberData["Tuesday/Start Value"]) || 0, end: parseInt(barberData["Tuesday/End Value"]) || 0 },
        3: { start: parseInt(barberData["Wednesday/Start Value"]) || 0, end: parseInt(barberData["Wednesday/End Value"]) || 0 },
        4: { start: parseInt(barberData["Thursday/Start Value"]) || 0, end: parseInt(barberData["Thursday/End Value"]) || 0 },
        5: { start: parseInt(barberData["Friday/Start Value"]) || 0, end: parseInt(barberData["Friday/End Value"]) || 0 },
        6: { start: parseInt(barberData["Saturday/Start Value"]) || 0, end: parseInt(barberData["Saturday/End Value"]) || 0 },
      };
    }

    // Fetch time off
    let timeOffList = [];
    if (userId) {
      const { data: timeOffData } = await supabase.from("time_off").select("*").eq("ghl_id", userId);
      timeOffList = (timeOffData || []).map((item) => ({
        start: new Date(item["Event/Start"]),
        end: new Date(item["Event/End"]),
      }));
    }
    const isDateInTimeOff = (date) => {
      for (const period of timeOffList) {
        const start = new Date(
          period.start.getFullYear(),
          period.start.getMonth(),
          period.start.getDate()
        );
        const end = new Date(
          period.end.getFullYear(),
          period.end.getMonth(),
          period.end.getDate()
        );
        if (date >= start && date < end) return true;
      }
      return false;
    };

    // Fetch time blocks
    let timeBlockList = [];
    if (userId) {
      const { data: blockData } = await supabase.from("time_block").select("*").eq("ghl_id", userId);
      console.log(`🔍 Fetched ${blockData?.length || 0} time blocks for user ${userId}`);

      timeBlockList = (blockData || []).map((item) => {
        const recurringRaw = item["Block/Recurring"];
        const recurring =
          recurringRaw === true ||
          recurringRaw === "true" ||
          recurringRaw === '"true"' ||
          String(recurringRaw).toLowerCase().replace(/['"]/g, "") === "true";

        let recurringDays = [];
        if (recurring && item["Block/Recurring Day"]) {
          // "Friday,Saturday,Monday,Wednesday,Thursday,Tuesday,Sunday"
          recurringDays = item["Block/Recurring Day"].split(",").map((day) => day.trim());
        }

        const block = {
          start: parseInt(item["Block/Start"]),
          end: parseInt(item["Block/End"]),
          date: item["Block/Date"] ? item["Block/Date"] : null,
          recurring,
          recurringDays,
          name: item["Block/Name"] || "Time Block",
          // Force deployment update - VERSION 3.1 - FIXED RECURRING BLOCKS
          version: "3.1",
        };

        console.log(
          `📅 Time block: ${block.name}, recurring: ${block.recurring} (raw: ${recurringRaw}), days: [${block.recurringDays.join(
            ","
          )}], array length: ${block.recurringDays.length}, time: ${block.start}-${block.end} minutes`
        );
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
        existingBookings = (bookingsData || []).map((booking) => {
          const startTime = new Date(booking.start_time);
          const duration = parseInt(booking.booking_duration) || 30;
          const endTime = new Date(startTime.getTime() + duration * 60000);

          // DON’T parse localized strings — derive parts in TZ
          const startDayKey = ymdInTZ(startTime);
          const endDayKey = ymdInTZ(endTime);
          const startMinutes = minutesInTZ(startTime);
          const endMinutes = minutesInTZ(endTime);

          console.log(
            `📅 Booking: ${startTime.toISOString()} (UTC) → ${startDayKey} ${Math.floor(
              startMinutes / 60
            )}:${String(startMinutes % 60).padStart(2, "0")}–${Math.floor(endMinutes / 60)}:${String(
              endMinutes % 60
            ).padStart(2, "0")} (${TARGET_TZ}) for ${duration}min`
          );

          return {
            startTime,
            endTime,
            startDayKey,
            endDayKey,
            startMinutes,
            endMinutes,
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

          let recurringDaysList = block.recurringDays || block.recurringDay;
          if (typeof recurringDaysList === "string") {
            recurringDaysList = recurringDaysList.split(",").map((day) => day.trim());
          }

          if (recurringDaysList && recurringDaysList.includes(currentDayName)) {
            if (isWithinRange(slotMinutes, block.start, block.end)) {
              return true;
            }
          }
        } else if (block.date) {
          // Compare by YMD to avoid timezone parsing issues
          let blockDateOnlyKey;
          try {
            blockDateOnlyKey = ymdInTZ(new Date(block.date));
          } catch (e) {
            console.warn(`Invalid time_block date format:`, block.date, e.message);
          }
          const currDateOnlyKey = ymdInTZ(slotDate);
          if (blockDateOnlyKey && blockDateOnlyKey === currDateOnlyKey && isWithinRange(slotMinutes, block.start, block.end)) {
            return true;
          }
        }
      }
      return false;
    };

    // Function to check if a slot conflicts with existing bookings
    const isSlotBooked = (slotDate, slotMinutes) => {
      const slotDayKey = ymdInTZ(slotDate);
      for (const booking of existingBookings) {
        if (booking.startDayKey === slotDayKey) {
          if (slotMinutes >= booking.startMinutes && slotMinutes < booking.endMinutes) {
            return true;
          }
        }
      }
      return false;
    };

    const filteredSlots = {};
    for (const day of daysToCheck) {
      const dateKey = ymdInTZ(day); // <<< never NaN now
      const dayOfWeek = day.getDay();

      const bh = businessHoursMap[dayOfWeek];
      if (!bh) continue;
      const openTime = bh.open_time;
      const closeTime = bh.close_time;

      console.log(
        `🕐 Business hours for day ${dayOfWeek}: open=${openTime}, close=${closeTime}, serviceDuration=${serviceDurationMinutes}min`
      );

      let validSlots = slotsData[dateKey]?.slots || [];

      // Keep only slots that render to the same local date as dateKey (in TARGET_TZ)
      validSlots = validSlots.filter((slot) => ymdInTZ(slot) === dateKey);

      // Store-level filtering
      validSlots = validSlots.filter((slot) => {
        // Use display string for debug + parsing (safe)
        const timeString = timeStringInTZ(slot);
        const minutes = timeToMinutes(timeString);

        const serviceEndTime = minutes + serviceDurationMinutes;

        if (!userId) {
          const allowed = minutes >= openTime && serviceEndTime <= closeTime;
          console.log(
            `🔍 Store-level filtering: slot=${timeString} (${minutes}min), serviceEnd=${serviceEndTime}, businessClose=${closeTime}, allowed=${allowed}`
          );
          return allowed;
        } else {
          // Only check if slot starts within business hours - service duration will be checked at barber level instead
          return minutes >= openTime && minutes <= closeTime;
        }
      });

      if (userId) {
        // Skip barber weekend
        if (barberWeekendIndexes.includes(dayOfWeek)) continue;

        const barberHours = barberHoursMap[dayOfWeek];
        if (!barberHours || (barberHours.start === 0 && barberHours.end === 0)) continue;

        if (isDateInTimeOff(day)) continue;

        validSlots = validSlots.filter((slot) => {
          const timeString = timeStringInTZ(slot);
          const minutes = timeToMinutes(timeString);

          const isBlocked = isSlotBlocked(day, minutes);
          const isBooked = isSlotBooked(day, minutes);

          // Apply service duration: ensure service can complete before barber end time
          // AND ensure slot starts at or after barber start time
          const serviceEndTime = minutes + serviceDurationMinutes;
          const withinRange = minutes >= barberHours.start && serviceEndTime <= barberHours.end;

          console.log(
            `🔍 Slot ${timeString} (${minutes} min): barberStart=${barberHours.start}, barberEnd=${barberHours.end}, serviceEnd=${serviceEndTime}, withinRange=${withinRange}, blocked=${isBlocked}, booked=${isBooked}`
          );

          return withinRange && !isBlocked && !isBooked;
        });
      }

      // Ensure ascending order of times (epoch ms)
      validSlots.sort((a, b) => a - b);

      if (validSlots.length > 0) {
        filteredSlots[dateKey] = validSlots.map((slot) =>
          timeStringInTZ(slot)
        );
      }
    }

    console.log(
      `📊 Final results: ${Object.keys(filteredSlots).length} days with slots, ${timeBlockList.length} time blocks processed, ${existingBookings.length} existing bookings blocked, serviceDuration=${serviceDurationMinutes}min - TZ=${TARGET_TZ}`
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        calendarId,
        activeDay: "allDays",
        startDate: startDate.toISOString().split("T")[0],
        slots: filteredSlots,
        debug: userId
          ? {
              barberWeekends,
              barberWeekendIndexes,
              barberHoursMap,
              timeOffList,
              timeBlockList,
              existingBookings,
              debugVersion: "3.12 - TZ fix w/ formatToParts (no localized parsing)",
              serviceDurationMinutes: serviceDurationMinutes,
              targetTimeZone: TARGET_TZ,
            }
          : undefined,
      }),
    };
  } catch (err) {
    console.error("❌ Error in WorkingSlots:", err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch working slots",
        details: err.message,
      }),
    };
  }
};