// timeUtils.js - Centralized time handling utilities
// This ensures consistent timezone handling across the entire backend system

/**
 * Converts a time string to proper ISO format with Mountain Time (America/Denver) timezone
 * This function handles various input formats and ensures consistent output
 * 
 * @param {string} timeInput - Input time string (could be various formats)
 * @param {string} targetTimezone - Target timezone (default: America/Denver)
 * @returns {string} - ISO string with proper timezone
 */
function normalizeToMountainTime(timeInput, targetTimezone = 'America/Denver') {
  if (!timeInput) {
    throw new Error('Time input is required');
  }

  try {
    let date;
    
    // Handle different input formats
    if (typeof timeInput === 'string') {
      // If it's already an ISO string with timezone, use it as-is but convert to Mountain Time
      if (timeInput.includes('T') && (timeInput.includes('Z') || timeInput.includes('+') || timeInput.includes('-'))) {
        date = new Date(timeInput);
      } else {
        // If it's a plain date string like "2025-09-24T11:00:00", assume it's ALREADY in Mountain Time
        date = new Date(timeInput);
        
        // Check if the date is valid
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date format: ${timeInput}`);
        }
      }
    } else {
      date = new Date(timeInput);
    }

    // Validate the date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${timeInput}`);
    }

    // If the input doesn't have timezone info, treat it as already in Mountain Time
    if (typeof timeInput === 'string' && timeInput.includes('T') && 
        !timeInput.includes('Z') && !timeInput.includes('+') && !timeInput.includes('-')) {
      
      // Input is like "2025-09-24T11:00:00" - assume it's Mountain Time
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      
      // Create a new date object and format it with Mountain timezone offset
      const mountainDate = new Date(year, month, day, hours, minutes, seconds);
      const tzOffset = getMountainTimezoneString(mountainDate);
      
      // Format as ISO string with Mountain Time offset
      const isoString = `${mountainDate.getFullYear()}-${String(mountainDate.getMonth() + 1).padStart(2, '0')}-${String(mountainDate.getDate()).padStart(2, '0')}T${String(mountainDate.getHours()).padStart(2, '0')}:${String(mountainDate.getMinutes()).padStart(2, '0')}:${String(mountainDate.getSeconds()).padStart(2, '0')}.000${tzOffset}`;
      
      return isoString;
    }
    
    // For inputs with timezone info, convert to Mountain Time
    const mountainTimeString = date.toLocaleString("sv-SE", { 
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const [datePart, timePart] = mountainTimeString.split(' ');
    const tzOffset = getMountainTimezoneString(date);
    
    return `${datePart}T${timePart}.000${tzOffset}`;

  } catch (error) {
    console.error('Error normalizing time to Mountain Time:', error.message);
    throw new Error(`Failed to normalize time "${timeInput}": ${error.message}`);
  }
}

/**
 * Gets the Mountain Time timezone offset in milliseconds for a given date
 * Accounts for Daylight Saving Time automatically
 * 
 * @param {Date} date - The date to get the offset for
 * @returns {number} - Offset in milliseconds
 */
function getMountainTimezoneOffset(date) {
  // Create two dates: one in UTC and one in Mountain Time
  const utcDate = new Date(date.toISOString());
  const mountainDate = new Date(date.toLocaleString("sv-SE", { timeZone: "America/Denver" }));
  
  return utcDate.getTime() - mountainDate.getTime();
}

/**
 * Gets the Mountain Time timezone string (e.g., "-07:00" or "-06:00")
 * Automatically accounts for Daylight Saving Time
 * 
 * @param {Date} date - The date to get the timezone string for
 * @returns {string} - Timezone offset string
 */
function getMountainTimezoneString(date) {
  // Use Intl.DateTimeFormat to get the timezone offset
  const timeZoneOffset = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Denver',
    timeZoneName: 'longOffset'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;

  if (timeZoneOffset && timeZoneOffset.startsWith('GMT')) {
    // Convert GMT-7 to -07:00 format
    const offset = timeZoneOffset.replace('GMT', '');
    if (offset.includes('-')) {
      const hours = Math.abs(parseInt(offset));
      return `-${hours.toString().padStart(2, '0')}:00`;
    } else if (offset.includes('+')) {
      const hours = parseInt(offset);
      return `+${hours.toString().padStart(2, '0')}:00`;
    }
  }
  
  // Fallback: determine if we're in DST
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const janOffset = jan.getTimezoneOffset();
  const julOffset = jul.getTimezoneOffset();
  const isDST = date.getTimezoneOffset() < Math.max(janOffset, julOffset);
  
  // Mountain Time: MST is UTC-7, MDT is UTC-6
  return isDST ? '-06:00' : '-07:00';
}

/**
 * Validates that a time string is properly formatted for API consumption
 * 
 * @param {string} timeString - The time string to validate
 * @returns {boolean} - True if valid
 */
function isValidISOString(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    return false;
  }
  
  try {
    const date = new Date(timeString);
    return !isNaN(date.getTime()) && timeString.includes('T');
  } catch {
    return false;
  }
}

/**
 * Formats a date to Mountain Time for display purposes
 * 
 * @param {string|Date} dateInput - Input date
 * @returns {string} - Formatted date string
 */
function formatMountainTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Ensures start and end times are properly formatted for API calls
 * This is the main function that should be used before making any booking API calls
 * 
 * @param {string} startTime - Start time string
 * @param {string} endTime - End time string
 * @returns {object} - Object with normalized startTime and endTime
 */
function prepareAppointmentTimes(startTime, endTime) {
  if (!startTime || !endTime) {
    throw new Error('Both startTime and endTime are required');
  }

  try {
    const normalizedStart = normalizeToMountainTime(startTime);
    const normalizedEnd = normalizeToMountainTime(endTime);

    // Validate that end time is after start time
    if (new Date(normalizedEnd) <= new Date(normalizedStart)) {
      throw new Error('End time must be after start time');
    }

    console.log('✅ Time normalization successful:');
    console.log(`   Original start: ${startTime} → Normalized: ${normalizedStart}`);
    console.log(`   Original end: ${endTime} → Normalized: ${normalizedEnd}`);

    return {
      startTime: normalizedStart,
      endTime: normalizedEnd
    };

  } catch (error) {
    console.error('❌ Failed to prepare appointment times:', error.message);
    throw error;
  }
}

module.exports = {
  normalizeToMountainTime,
  getMountainTimezoneOffset,
  getMountainTimezoneString,
  isValidISOString,
  formatMountainTime,
  prepareAppointmentTimes
};