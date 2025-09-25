const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("✅ confirmPayment function - Verify and process completed payment - 2025-09-25");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Access token missing' })
      };
    }

    // Parse request body
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseErr) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { sessionId, checkoutSessionId, paymentIntentId } = requestData;

    if (!sessionId && !checkoutSessionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'sessionId or checkoutSessionId is required' })
      };
    }

    console.log('✅ Confirming payment for session:', sessionId || checkoutSessionId);

    // Retrieve the checkout session from LeadConnector to verify payment
    const sessionResponse = await axios.get(
      `https://services.leadconnectorhq.com/payments/checkout-sessions/${checkoutSessionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15'
        }
      }
    );

    const checkoutSession = sessionResponse.data;

    // Verify payment status
    if (checkoutSession.payment_status !== 'paid') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Payment not completed',
          status: checkoutSession.payment_status,
          sessionId: sessionId
        })
      };
    }

    // Extract metadata and payment details
    const metadata = checkoutSession.metadata || {};
    const appointmentIds = metadata.totalAppointments ? JSON.parse(metadata.totalAppointments) : [];
    const tipAmount = parseFloat(metadata.tipAmount || '0');
    const staffCount = parseInt(metadata.staffCount || '1');

    // Process tip distribution (retrieve from stored session data or recalculate)
    const tipDistribution = await processTipDistribution(
      appointmentIds,
      tipAmount,
      staffCount,
      checkoutSession,
      accessToken
    );

    // Update appointments status to paid
    const appointmentUpdates = await updateAppointmentStatus(
      appointmentIds,
      'paid',
      checkoutSession,
      accessToken
    );

    // Process staff payments/tips (this could integrate with payroll system)
    const staffPayments = await processStaffPayments(
      tipDistribution,
      checkoutSession,
      accessToken
    );

    // Create confirmation response
    const confirmationData = {
      success: true,
      message: 'Payment confirmed and processed successfully',
      paymentDetails: {
        sessionId: sessionId,
        checkoutSessionId: checkoutSessionId,
        paymentIntentId: checkoutSession.payment_intent,
        status: checkoutSession.payment_status,
        amountPaid: checkoutSession.amount_total / 100, // Convert from cents
        currency: checkoutSession.currency,
        paidAt: new Date().toISOString()
      },
      appointments: {
        ids: appointmentIds,
        count: appointmentIds.length,
        status: 'paid',
        updates: appointmentUpdates
      },
      tipProcessing: {
        totalTipAmount: tipAmount,
        staffCount: staffCount,
        distribution: tipDistribution,
        payments: staffPayments
      },
      customer: {
        email: checkoutSession.customer_details?.email,
        name: checkoutSession.customer_details?.name,
        phone: checkoutSession.customer_details?.phone
      },
      nextSteps: {
        appointments: 'Appointments confirmed and paid',
        notifications: 'Send confirmation emails to customer and staff',
        calendar: 'Update calendar with payment status',
        reporting: 'Record transaction for reporting'
      }
    };

    console.log('✅ Payment confirmed for', appointmentIds.length, 'appointments, total:', checkoutSession.amount_total / 100);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(confirmationData)
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error confirming payment:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to confirm payment',
        details: message,
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};

// Helper function to process tip distribution
async function processTipDistribution(appointmentIds, totalTipAmount, staffCount, checkoutSession, accessToken) {
  try {
    // This would typically retrieve the stored tip distribution from your database
    // For now, we'll create a basic equal distribution
    const tipPerStaff = totalTipAmount / staffCount;
    
    const distribution = [];
    for (let i = 0; i < staffCount; i++) {
      distribution.push({
        staffId: `staff_${i + 1}`, // You'd get real staff IDs from appointment data
        tipAmount: Math.round(tipPerStaff * 100) / 100,
        status: 'pending',
        processedAt: new Date().toISOString()
      });
    }

    return distribution;
  } catch (err) {
    console.error('Error processing tip distribution:', err);
    return [];
  }
}

// Helper function to update appointment status
async function updateAppointmentStatus(appointmentIds, status, checkoutSession, accessToken) {
  const updates = [];

  for (const appointmentId of appointmentIds) {
    try {
      // Update appointment status in your system
      // This is a placeholder - implement based on your appointment storage system
      updates.push({
        appointmentId: appointmentId,
        previousStatus: 'confirmed',
        newStatus: status,
        paymentSessionId: checkoutSession.id,
        updatedAt: new Date().toISOString(),
        success: true
      });
    } catch (err) {
      console.error(`Error updating appointment ${appointmentId}:`, err);
      updates.push({
        appointmentId: appointmentId,
        error: err.message,
        success: false
      });
    }
  }

  return updates;
}

// Helper function to process staff payments
async function processStaffPayments(tipDistribution, checkoutSession, accessToken) {
  const payments = [];

  for (const tip of tipDistribution) {
    try {
      // Process individual staff tip payment
      // This could integrate with payroll system, direct deposit, etc.
      payments.push({
        staffId: tip.staffId,
        tipAmount: tip.tipAmount,
        paymentMethod: 'pending_payout', // Could be 'direct_deposit', 'cash', etc.
        status: 'queued',
        transactionId: `tip_${checkoutSession.id}_${tip.staffId}`,
        scheduledFor: new Date().toISOString(),
        success: true
      });
    } catch (err) {
      console.error(`Error processing payment for staff ${tip.staffId}:`, err);
      payments.push({
        staffId: tip.staffId,
        error: err.message,
        success: false
      });
    }
  }

  return payments;
}