const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("🛒 createPaymentSession function - LeadConnector Checkout Session - 2025-09-25");

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

    const {
      paymentSessionData,  // Data from initializePayment
      successUrl,          // Frontend success URL
      cancelUrl,           // Frontend cancel URL
      paymentMethods = ['card'], // Payment methods allowed
      locationId = '7LYI93XFo8j4nZfswlaz'
    } = requestData;

    if (!paymentSessionData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'paymentSessionData is required' })
      };
    }

    if (!successUrl || !cancelUrl) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'successUrl and cancelUrl are required' })
      };
    }

    console.log('🛒 Creating payment session for:', paymentSessionData.pricing.totalAmount, 'CAD');

    // Prepare LeadConnector payment session payload
    const paymentPayload = {
      locationId: locationId,
      mode: 'payment',
      currency: 'CAD',
      customer: {
        email: paymentSessionData.customerInfo.email,
        name: paymentSessionData.customerInfo.name || paymentSessionData.customerInfo.firstName + ' ' + paymentSessionData.customerInfo.lastName,
        phone: paymentSessionData.customerInfo.phone
      },
      line_items: paymentSessionData.lineItems,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&payment_status=success`,
      cancel_url: `${cancelUrl}?session_id={CHECKOUT_SESSION_ID}&payment_status=cancelled`,
      payment_method_types: paymentMethods,
      metadata: {
        sessionId: paymentSessionData.sessionId,
        appointmentCount: paymentSessionData.appointments.length.toString(),
        totalAppointments: JSON.stringify(paymentSessionData.appointments.map(a => a.appointmentId)),
        tipAmount: paymentSessionData.pricing.tipAmount.toString(),
        staffCount: paymentSessionData.tipDistribution.length.toString(),
        createdBy: 'restyle-booking-system'
      },
      // Enable automatic tax calculation if needed
      automatic_tax: {
        enabled: false // We're calculating taxes manually
      },
      // Set expiration (optional - default is 24 hours)
      expires_at: Math.floor((Date.now() + (24 * 60 * 60 * 1000)) / 1000), // 24 hours from now
      // Custom fields for appointment tracking
      custom_fields: [
        {
          key: 'appointment_ids',
          label: 'Appointment IDs',
          type: 'text',
          optional: true
        },
        {
          key: 'special_instructions',
          label: 'Special Instructions',
          type: 'text',
          optional: true
        }
      ]
    };

    console.log('🛒 Sending payment request to LeadConnector...');

    // Create payment session with LeadConnector
    const response = await axios.post(
      'https://services.leadconnectorhq.com/payments/checkout-sessions',
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: '2021-04-15',
          'Content-Type': 'application/json'
        }
      }
    );

    const checkoutSession = response.data;

    console.log('🛒 Payment session created:', checkoutSession.id || 'ID not available');

    // Enhanced response with all necessary data for frontend
    const responseData = {
      success: true,
      message: 'Payment session created successfully',
      checkoutSession: {
        id: checkoutSession.id,
        url: checkoutSession.url,
        mode: checkoutSession.mode,
        status: checkoutSession.status,
        currency: checkoutSession.currency,
        amount_total: checkoutSession.amount_total,
        expires_at: checkoutSession.expires_at
      },
      paymentDetails: {
        sessionId: paymentSessionData.sessionId,
        totalAmount: paymentSessionData.pricing.totalAmount,
        subtotal: paymentSessionData.pricing.subtotal,
        tipAmount: paymentSessionData.pricing.tipAmount,
        taxes: paymentSessionData.pricing.taxes,
        currency: paymentSessionData.pricing.currency,
        appointments: paymentSessionData.appointments.map(apt => ({
          serviceName: apt.serviceName,
          staffName: apt.staffName,
          price: apt.servicePrice,
          appointmentId: apt.appointmentId
        })),
        tipDistribution: paymentSessionData.tipDistribution
      },
      urls: {
        checkoutUrl: checkoutSession.url,
        successUrl: successUrl,
        cancelUrl: cancelUrl
      },
      nextSteps: {
        frontend: 'Redirect user to checkoutUrl',
        webhook: 'Set up webhook to handle payment completion',
        confirmation: 'Use session_id from success URL to confirm payment'
      }
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseData)
    };

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    console.error("❌ Error creating payment session:", message);

    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Failed to create payment session',
        details: message,
        debugInfo: {
          status: status,
          message: typeof message === 'string' ? message : JSON.stringify(message),
          endpoint: 'https://services.leadconnectorhq.com/payments/checkout-sessions'
        }
      })
    };
  }
};