const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("💰 getPaymentStatus function - Retrieve payment and tip status - 2025-09-25");

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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' })
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

    const checkoutSessionId = event.queryStringParameters?.sessionId;
    const appointmentId = event.queryStringParameters?.appointmentId;

    if (!checkoutSessionId && !appointmentId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'sessionId or appointmentId is required' })
      };
    }

    console.log('💰 Retrieving payment status for:', checkoutSessionId || `appointment ${appointmentId}`);

    let paymentDetails = {};

    if (checkoutSessionId) {
      // Get checkout session details from LeadConnector
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
      const metadata = checkoutSession.metadata || {};

      paymentDetails = {
        sessionId: checkoutSessionId,
        paymentStatus: checkoutSession.payment_status,
        sessionStatus: checkoutSession.status,
        amountTotal: checkoutSession.amount_total / 100, // Convert from cents
        currency: checkoutSession.currency,
        customer: checkoutSession.customer_details,
        createdAt: new Date(checkoutSession.created * 1000).toISOString(),
        expiresAt: checkoutSession.expires_at ? new Date(checkoutSession.expires_at * 1000).toISOString() : null,
        paymentIntent: checkoutSession.payment_intent,
        appointments: {
          ids: metadata.totalAppointments ? JSON.parse(metadata.totalAppointments) : [],
          count: parseInt(metadata.appointmentCount || '0')
        },
        tips: {
          totalAmount: parseFloat(metadata.tipAmount || '0'),
          staffCount: parseInt(metadata.staffCount || '0'),
          distribution: calculateTipDistribution(
            parseFloat(metadata.tipAmount || '0'),
            parseInt(metadata.staffCount || '1')
          )
        }
      };
    }

    // If appointment ID is provided, get appointment-specific payment info
    if (appointmentId) {
      // This would query your appointment database
      const appointmentPaymentInfo = await getAppointmentPaymentInfo(appointmentId);
      paymentDetails.appointmentInfo = appointmentPaymentInfo;
    }

    // Get detailed line items if session exists
    if (checkoutSessionId) {
      try {
        const lineItemsResponse = await axios.get(
          `https://services.leadconnectorhq.com/payments/checkout-sessions/${checkoutSessionId}/line_items`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Version: '2021-04-15'
            }
          }
        );

        paymentDetails.lineItems = lineItemsResponse.data.data || [];
      } catch (lineItemError) {
        console.log('⚠️ Could not retrieve line items:', lineItemError.message);
        paymentDetails.lineItems = [];
      }
    }

    console.log('💰 Payment status retrieved:', paymentDetails.paymentStatus || 'unknown');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        paymentDetails: paymentDetails,
        summary: {
          status: paymentDetails.paymentStatus || 'unknown',
          totalAmount: paymentDetails.amountTotal || 0,
          appointmentCount: paymentDetails.appointments?.count || 0,
          tipAmount: paymentDetails.tips?.totalAmount || 0,
          isPaid: paymentDetails.paymentStatus === 'paid'
        }
      })
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error retrieving payment status:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to retrieve payment status',
        details: message,
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message)
        }
      })
    };
  }
};

// Helper function to calculate tip distribution
function calculateTipDistribution(totalTipAmount, staffCount) {
  if (totalTipAmount <= 0 || staffCount <= 0) {
    return [];
  }

  const tipPerStaff = totalTipAmount / staffCount;
  const distribution = [];

  for (let i = 0; i < staffCount; i++) {
    distribution.push({
      staffIndex: i + 1,
      tipAmount: Math.round(tipPerStaff * 100) / 100,
      percentage: Math.round((100 / staffCount) * 100) / 100
    });
  }

  return distribution;
}

// Helper function to get appointment payment info
async function getAppointmentPaymentInfo(appointmentId) {
  // This would query your appointment database for payment information
  // Placeholder implementation
  return {
    appointmentId: appointmentId,
    paymentStatus: 'pending', // or 'paid', 'failed', 'expired'
    serviceName: 'Service Name',
    staffAssigned: 'Staff Name',
    servicePrice: 0,
    tipAmount: 0,
    totalPaid: 0,
    paidAt: null,
    paymentMethod: null,
    transactionId: null
  };
}