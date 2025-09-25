const axios = require('axios');
const { getValidAccessToken } = require('../../supbase');

console.log("🔗 paymentWebhook function - Handle LeadConnector payment webhooks - 2025-09-25");

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature'
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
    // Parse webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(event.body);
    } catch (parseErr) {
      console.error('❌ Invalid webhook payload:', parseErr);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    const { type, data } = webhookData;

    console.log('🔗 Received webhook:', type, 'for session:', data?.id);

    // Handle different webhook events
    switch (type) {
      case 'checkout.session.completed':
        return await handlePaymentCompleted(data, corsHeaders);
      
      case 'checkout.session.expired':
        return await handlePaymentExpired(data, corsHeaders);
      
      case 'payment_intent.succeeded':
        return await handlePaymentSucceeded(data, corsHeaders);
      
      case 'payment_intent.payment_failed':
        return await handlePaymentFailed(data, corsHeaders);
      
      default:
        console.log('🔗 Unhandled webhook type:', type);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ 
            received: true, 
            type: type,
            message: 'Webhook received but not processed' 
          })
        };
    }

  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Webhook processing failed',
        details: err.message
      })
    };
  }
};

// Handle successful payment completion
async function handlePaymentCompleted(sessionData, corsHeaders) {
  try {
    console.log('✅ Processing completed payment for session:', sessionData.id);

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      throw new Error('Access token not available');
    }

    // Extract appointment and tip information from metadata
    const metadata = sessionData.metadata || {};
    const appointmentIds = metadata.totalAppointments ? JSON.parse(metadata.totalAppointments) : [];
    const tipAmount = parseFloat(metadata.tipAmount || '0');
    const staffCount = parseInt(metadata.staffCount || '1');

    // Process the payment completion
    const processingResults = {
      sessionId: metadata.sessionId,
      checkoutSessionId: sessionData.id,
      appointmentIds: appointmentIds,
      paymentAmount: sessionData.amount_total / 100,
      currency: sessionData.currency,
      customer: sessionData.customer_details,
      processedAt: new Date().toISOString()
    };

    // Update appointments to paid status
    for (const appointmentId of appointmentIds) {
      // Update your appointment database here
      console.log('✅ Marking appointment as paid:', appointmentId);
    }

    // Process tip distribution
    if (tipAmount > 0 && staffCount > 0) {
      const tipPerStaff = tipAmount / staffCount;
      console.log('💰 Processing tips:', tipAmount, 'total, divided among', staffCount, 'staff');
      
      // Queue tip payments for staff
      for (let i = 0; i < staffCount; i++) {
        console.log('💰 Queuing tip payment:', tipPerStaff, 'for staff member', i + 1);
        // Add to tip payment queue/database
      }
    }

    // Send notifications (implement as needed)
    // await sendPaymentConfirmationEmail(sessionData.customer_details.email, processingResults);
    // await notifyStaffOfCompletedBooking(appointmentIds, processingResults);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Payment completed successfully',
        processed: processingResults
      })
    };

  } catch (err) {
    console.error('❌ Error handling payment completion:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to process payment completion' })
    };
  }
}

// Handle expired payment session
async function handlePaymentExpired(sessionData, corsHeaders) {
  try {
    console.log('⏰ Processing expired payment session:', sessionData.id);

    const metadata = sessionData.metadata || {};
    const appointmentIds = metadata.totalAppointments ? JSON.parse(metadata.totalAppointments) : [];

    // Update appointments to expired status
    for (const appointmentId of appointmentIds) {
      console.log('⏰ Marking appointment as payment expired:', appointmentId);
      // Update your appointment database here
    }

    // Optionally, send reminder email to customer
    // await sendPaymentExpirationEmail(sessionData.customer_details.email, appointmentIds);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Payment expiration processed',
        sessionId: sessionData.id,
        appointmentIds: appointmentIds
      })
    };

  } catch (err) {
    console.error('❌ Error handling payment expiration:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to process payment expiration' })
    };
  }
}

// Handle successful payment intent
async function handlePaymentSucceeded(paymentData, corsHeaders) {
  try {
    console.log('💳 Payment intent succeeded:', paymentData.id);

    // Additional processing for payment intent success if needed
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Payment intent processed',
        paymentIntentId: paymentData.id
      })
    };

  } catch (err) {
    console.error('❌ Error handling payment success:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to process payment success' })
    };
  }
}

// Handle failed payment
async function handlePaymentFailed(paymentData, corsHeaders) {
  try {
    console.log('❌ Payment intent failed:', paymentData.id);

    // Handle payment failure (notify customer, update appointments, etc.)
    const failureReason = paymentData.last_payment_error?.message || 'Payment failed';
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Payment failure processed',
        paymentIntentId: paymentData.id,
        failureReason: failureReason
      })
    };

  } catch (err) {
    console.error('❌ Error handling payment failure:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to process payment failure' })
    };
  }
}