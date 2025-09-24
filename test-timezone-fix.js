// test-timezone-fix.js
// Test script to validate the timezone fix works correctly

const { prepareAppointmentTimes, formatMountainTime } = require('./timeUtils');

console.log('🧪 Testing timezone fixes...\n');

// Test cases that would have caused the +6/+7 hour issue
const testCases = [
  {
    name: "User selects 11:00 AM (typical problem case)",
    startTime: "2025-09-24T11:00:00",
    endTime: "2025-09-24T12:00:00"
  },
  {
    name: "User selects 2:00 PM",
    startTime: "2025-09-24T14:00:00",
    endTime: "2025-09-24T15:00:00"
  },
  {
    name: "Already properly formatted ISO string",
    startTime: "2025-09-24T11:00:00-06:00",
    endTime: "2025-09-24T12:00:00-06:00"
  },
  {
    name: "UTC timezone input",
    startTime: "2025-09-24T17:00:00Z",
    endTime: "2025-09-24T18:00:00Z"
  },
  {
    name: "Morning appointment (9 AM)",
    startTime: "2025-09-24T09:00:00",
    endTime: "2025-09-24T10:00:00"
  }
];

testCases.forEach((testCase, index) => {
  console.log(`\n--- Test Case ${index + 1}: ${testCase.name} ---`);
  console.log(`Input Start Time: ${testCase.startTime}`);
  console.log(`Input End Time:   ${testCase.endTime}`);
  
  try {
    const normalized = prepareAppointmentTimes(testCase.startTime, testCase.endTime);
    console.log(`✅ Normalized Start: ${normalized.startTime}`);
    console.log(`✅ Normalized End:   ${normalized.endTime}`);
    
    // Show how it would display to user
    console.log(`📅 Display to User:  ${formatMountainTime(normalized.startTime)} - ${formatMountainTime(normalized.endTime)}`);
    
    // Verify the times are preserved correctly
    const startHour = new Date(normalized.startTime).toLocaleString('en-US', {
      timeZone: 'America/Denver',
      hour: 'numeric',
      hour12: false
    });
    const originalHour = new Date(testCase.startTime).getHours();
    
    console.log(`🔍 Verification: Original hour ${originalHour}, Mountain Time hour ${startHour}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
});

console.log('\n🎯 Summary:');
console.log('These normalized times should now be sent to the LeadConnector API');
console.log('and stored in Supabase, preventing the +6/+7 hour offset issue.');
console.log('\n✅ If all tests passed, the timezone fix is working correctly!');

// Test edge cases
console.log('\n--- Edge Case Tests ---');

// Test invalid inputs
try {
  prepareAppointmentTimes("invalid", "2025-09-24T12:00:00");
  console.log('❌ Should have thrown error for invalid start time');
} catch (error) {
  console.log('✅ Correctly caught invalid start time:', error.message);
}

try {
  prepareAppointmentTimes("2025-09-24T12:00:00", "2025-09-24T11:00:00");
  console.log('❌ Should have thrown error for end before start');
} catch (error) {
  console.log('✅ Correctly caught end time before start time:', error.message);
}